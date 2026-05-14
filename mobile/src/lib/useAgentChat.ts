import { useState, useCallback, useRef } from 'react';
import { fetch as expoFetch } from 'expo/fetch';
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

export type BookingInterrupt = {
  slot: string;
  time_zone: string;
  hospital_id: string;
  reason: string;
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
  onInterrupt: (data: BookingInterrupt) => void;
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
        case '2': {
          const items = parsed as Array<{ type: string; data: BookingInterrupt }>;
          for (const item of items) {
            if (item.type === 'booking_interrupt') handlers.onInterrupt(item.data);
          }
          break;
        }
        case '3': handlers.onError(parsed as string); break;
      }
    }
  }
}

// ── Serialise messages for the backend ────────────────────────────────────────
// Converts AgentMessage[] → the format toLangChainMessages in agent.js expects.

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
  const [pendingInterrupt, setPendingInterrupt] = useState<BookingInterrupt | null>(null);

  // Stable ref to latest messages for closures inside stream
  const messagesRef = useRef<AgentMessage[]>([]);
  messagesRef.current = messages;

  const sharedBody = {
    ...(location ? { location } : {}),
    ...(lat != null ? { lat } : {}),
    ...(lon != null ? { lon } : {}),
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const runStream = useCallback(async (url: string, extraBody: object) => {
    if (!apiBase) throw new Error('API URL not configured');

    const response = await authedFetch(url, {
      method: 'POST',
      body: JSON.stringify({ ...sharedBody, ...extraBody }),
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
      onInterrupt: (data) => setPendingInterrupt(data),
      onError: (msg) => { throw new Error(msg); },
    });
  }, [apiBase, location, lat, lon]);

  const append = useCallback(async (msg: { role: 'user'; content: string }) => {
    if (isLoading) return;

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
    setPendingInterrupt(null);

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

  const confirmBooking = useCallback(async (confirmed: boolean) => {
    setPendingInterrupt(null);
    const assistantMsg: AgentMessage = {
      id: `assistant-resume-${Date.now()}`,
      role: 'assistant',
      content: '',
      parts: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setIsLoading(true);
    setError(null);

    try {
      await runStream(`${apiBase}/resume`, { confirmed });
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, runStream]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    handleSubmit,
    append,
    isLoading,
    error,
    pendingInterrupt,
    confirmBooking,
  };
}
