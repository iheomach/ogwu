const { PostgresSaver } = require('@langchain/langgraph-checkpoint-postgres');

let _checkpointer = null;
let _setupDone = false;

async function getCheckpointer() {
  if (!process.env.DATABASE_URL) return null;

  if (!_checkpointer) {
    _checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
  }

  if (!_setupDone) {
    await _checkpointer.setup(); // creates checkpoint tables if they don't exist
    _setupDone = true;
  }

  return _checkpointer;
}

module.exports = { getCheckpointer };
