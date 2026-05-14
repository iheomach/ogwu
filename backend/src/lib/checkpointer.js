const { PostgresSaver } = require('@langchain/langgraph-checkpoint-postgres');

let _checkpointer = null;
let _setupDone = false;

async function getCheckpointer() {
  if (!process.env.DATABASE_URL) {
    console.warn('[checkpointer] DATABASE_URL not set — running without state persistence');
    return null;
  }

  if (!_checkpointer) {
    _checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
  }

  if (!_setupDone) {
    try {
      await _checkpointer.setup();
      _setupDone = true;
      console.log('[checkpointer] Postgres connection OK — checkpoint tables ready');
    } catch (err) {
      _checkpointer = null;
      console.error('[checkpointer] Failed to connect to Postgres:', err?.message);
      console.error('[checkpointer] Check your DATABASE_URL in backend/.env');
      return null;
    }
  }

  return _checkpointer;
}

module.exports = { getCheckpointer };
