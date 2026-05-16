import { useState, useCallback, useRef, useEffect } from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToolPart = {
  type: 'tool-call' | 'tool-result';
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
  output?: unknown;
  state: 'input-available' | 'output-available';
};

export type AgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: ToolPart[];
};

// ── Auth fetch ────────────────────────────────────────────────────────────────

async function authedFetch(url: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const headers = new Headers((init?.headers as Record<string, string>) || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return expoFetch(url, { ...init, headers } as any);
}

// ── SSE parser ────────────────────────────────────────────────────────────────

type SSEHandler = {
  onText: (delta: string) => void;
  onToolCall: (toolCallId: string, toolName: string, args: unknown) => void;
  onToolResult: (toolCallId: string, result: unknown) => void;
  onError: (msg: string) => void;
};

async function parseSSEStream(response: Response, handlers: SSEHandler) {
  const reader = (response.body as any).getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const code = line.slice(0, colonIdx);
      const rest = line.slice(colonIdx + 1);
      let parsed: unknown;
      try { parsed = JSON.parse(rest); } catch { continue; }

      switch (code) {
        case '0': handlers.onText(parsed as string); break;
        case '9': {
          const p = parsed as { toolCallId: string; toolName: string; args: unknown };
          handlers.onToolCall(p.toolCallId, p.toolName, p.args);
          break;
        }
        case 'a': {
          const p = parsed as { toolCallId: string; result: unknown };
          handlers.onToolResult(p.toolCallId, p.result);
          break;
        }
        case '3': handlers.onError(parsed as string); break;
      }
    }
  }
}

// ── Serialise messages for the backend ────────────────────────────────────────

function serialiseMessages(messages: AgentMessage[]) {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.content };

    const completedTools = m.parts
      .filter((p) => p.type === 'tool-result')
      .map((p) => ({
        state: 'result',
        toolCallId: p.toolCallId,
        toolName: p.toolName,
        args: p.args ?? {},
        result: p.result,
      }));

    return {
      role: 'assistant',
      content: m.content,
      ...(completedTools.length > 0 ? { toolInvocations: completedTools } : {}),
    };
  });
}

// ── Session ID ────────────────────────────────────────────────────────────────

const SESSION_ID_KEY = 'assistantSessionId';

function newSessionId() {
  return Date.now().toString();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

type UseAgentChatOptions = {
  apiBase: string | null;
  location?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export function useAgentChat({ apiBase, location, lat, lon }: UseAgentChatOptions) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [hasPreviousSession, setHasPreviousSession] = useState(false);

  // Stable ref to latest messages for closures inside stream
  const messagesRef = useRef<AgentMessage[]>([]);
  messagesRef.current = messages;

  // Saved state from the session before the last startNewSession call
  const previousSessionIdRef = useRef<string | null>(null);
  const previousMessagesRef = useRef<AgentMessage[]>([]);

  // Session ID — persisted across app restarts, changes on startNewSession
  const sessionIdRef = useRef<string>(newSessionId());

  useEffect(() => {
    AsyncStorage.getItem(SESSION_ID_KEY).then((saved) => {
      if (saved) {
        sessionIdRef.current = saved;
      } else {
        AsyncStorage.setItem(SESSION_ID_KEY, sessionIdRef.current).catch(() => {});
      }
    });
  }, []);

  const runStream = useCallback(async (url: string, extraBody: object) => {
    if (!apiBase) throw new Error('API URL not configured');

    const response = await authedFetch(url, {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionIdRef.current,
        ...(location ? { location } : {}),
        ...(lat != null ? { lat } : {}),
        ...(lon != null ? { lon } : {}),
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...extraBody,
      }),
    });

    if (!response.ok) {
      const text = await (response as any).text?.() ?? '';
      throw new Error(text || `HTTP ${response.status}`);
    }

    // Track pending tool calls so results can update the right part
    const toolCallNames = new Map<string, string>();

    await parseSSEStream(response as any, {
      onText: (delta) => {
        setMessages((prev) => {
          const msgs = [...prev];
          const last = { ...msgs[msgs.length - 1] };
          last.content = (last.content ?? '') + delta;
          msgs[msgs.length - 1] = last;
          return msgs;
        });
      },
      onToolCall: (toolCallId, toolName, args) => {
        toolCallNames.set(toolCallId, toolName);
        const part: ToolPart = { type: 'tool-call', toolCallId, toolName, args: args as any, state: 'input-available' };
        setMessages((prev) => {
          const msgs = [...prev];
          const last = { ...msgs[msgs.length - 1] };
          last.parts = [...last.parts, part];
          msgs[msgs.length - 1] = last;
          return msgs;
        });
      },
      onToolResult: (toolCallId, result) => {
        const toolName = toolCallNames.get(toolCallId) ?? '';
        const resultPart: ToolPart = {
          type: 'tool-result', toolCallId, toolName, result, output: result, state: 'output-available',
        };
        setMessages((prev) => {
          const msgs = [...prev];
          const last = { ...msgs[msgs.length - 1] };
          last.parts = last.parts.map((p) => p.toolCallId === toolCallId ? resultPart : p);
          msgs[msgs.length - 1] = last;
          return msgs;
        });
      },
      onError: (msg) => { throw new Error(msg); },
    });
  }, [apiBase, location, lat, lon]);

  const loadPastSession = useCallback(async (): Promise<AgentMessage[]> => {
    if (!apiBase) return [];
    try {
      const resp = await authedFetch(`${apiBase}/session`);
      if (!resp.ok) return [];
      const json = await (resp as any).json();
      return Array.isArray(json.messages) ? json.messages : [];
    } catch {
      return [];
    }
  }, [apiBase]);

  const fetchContextSummary = useCallback(async () => {
    if (!apiBase) return;
    try {
      const resp = await authedFetch(`${apiBase}/context`);
      if (resp.ok) {
        const json = await (resp as any).json();
        if (json?.summary) setContextSummary(json.summary);
      }
    } catch {
      // non-fatal — fall back to default greeting
    }
  }, [apiBase]);

  const append = useCallback(async (msg: { role: 'user'; content: string }) => {
    if (isLoading) return;
    setContextSummary(null); // clear once user starts talking

    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg.content,
      parts: [],
    };
    const assistantMsg: AgentMessage = {
      id: `assistant-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      parts: [],
    };

    const nextMessages = [...messagesRef.current, userMsg];
    setMessages([...nextMessages, assistantMsg]);
    setIsLoading(true);
    setError(null);

    try {
      await runStream(`${apiBase}/chat`, { messages: serialiseMessages(nextMessages) });
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, apiBase, runStream]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    append({ role: 'user', content: text });
  }, [input, isLoading, append]);

  const resetState = useCallback(() => {
    setMessages([]);
    setInput('');
    setError(null);
  }, []);

  // Generates a new session — old checkpoint preserved in DB but no longer active.
  // When fetchSummary=true, saves the old session so resumePreviousSession can restore it.
  const startNewSession = useCallback((fetchSummary = true) => {
    if (fetchSummary) {
      previousSessionIdRef.current = sessionIdRef.current;
      previousMessagesRef.current = messagesRef.current;
      setHasPreviousSession(true);
    } else {
      previousSessionIdRef.current = null;
      previousMessagesRef.current = [];
      setHasPreviousSession(false);
    }

    const id = newSessionId();
    sessionIdRef.current = id;
    AsyncStorage.setItem(SESSION_ID_KEY, id).catch(() => {});
    setMessages([]);
    setInput('');
    setError(null);
    setContextSummary(null);
    if (fetchSummary) fetchContextSummary();
  }, [fetchContextSummary]);

  // Restores the session that existed before the last startNewSession call.
  const resumePreviousSession = useCallback(() => {
    const prevId = previousSessionIdRef.current;
    const prevMessages = previousMessagesRef.current;
    if (!prevId) return;

    sessionIdRef.current = prevId;
    AsyncStorage.setItem(SESSION_ID_KEY, prevId).catch(() => {});
    setMessages(prevMessages);
    setInput('');
    setError(null);
    setContextSummary(null);
    setHasPreviousSession(false);
    previousSessionIdRef.current = null;
    previousMessagesRef.current = [];
  }, []);

  return {
    messages,
    setMessages,
    input,
    setInput,
    handleSubmit,
    append,
    isLoading,
    error,
    resetState,
    startNewSession,
    resumePreviousSession,
    contextSummary,
    fetchContextSummary,
    hasPreviousSession,
    loadPastSession,
  };
}
