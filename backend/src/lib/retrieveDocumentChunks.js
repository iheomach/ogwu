const { OpenAIEmbeddings } = require('@langchain/openai');
const supabase = require('./supabase');

const embedder = new OpenAIEmbeddings({ model: 'text-embedding-3-small' });

const SIMILARITY_THRESHOLD = 0.0;
const TOP_K = 5;
const MAX_CHARS = 6000; // ~1500 tokens at 4 chars/token
const MIN_QUERY_LENGTH = 12; // skip greetings and slot confirmations ("Hi", "9am", "Yes please")

async function retrieveDocumentChunks(userId, query) {
  const q = query?.trim() ?? '';
  if (q.length < MIN_QUERY_LENGTH) return [];

  // Skip embedding entirely if the patient has no processed documents
  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', userId)
    .eq('status', 'complete');
  if (!count) return [];

  try {
    const [embedding] = await embedder.embedDocuments([q]);

    const { data, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: embedding,
      patient_id: userId,
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: TOP_K,
    });

    if (error) {
      console.error('[rag] match_document_chunks error:', error?.message);
      return [];
    }
    if (!data?.length) return [];

    let total = 0;
    const chunks = [];
    for (const row of data) {
      if (total + row.content.length > MAX_CHARS) break;
      chunks.push(row.content);
      total += row.content.length;
    }

    return chunks;
  } catch (err) {
    console.error('[rag] retrieveDocumentChunks error:', err?.message);
    return [];
  }
}

module.exports = { retrieveDocumentChunks };
