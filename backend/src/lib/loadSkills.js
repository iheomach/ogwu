const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../skills');

/**
 * Reads every .md/.js pair from src/skills/ and builds a tool map for streamText.
 *
 * Each skill directory entry:
 *   <name>.md  — tool description (what the LLM sees)
 *   <name>.js  — exports a factory fn (ctx) => { inputSchema, execute }
 *
 * @param {object} tool   — the `tool` helper from ai
 * @param {object} ctx    — context passed to every skill factory
 * @returns {object}      — { skillName: tool({ description, inputSchema, execute }), ... }
 */
function loadSkills(tool, ctx) {
  const skillNames = fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.basename(f, '.js'));

  const tools = {};

  for (const name of skillNames) {
    const mdPath = path.join(SKILLS_DIR, `${name}.md`);
    const jsPath = path.join(SKILLS_DIR, `${name}.js`);

    if (!fs.existsSync(mdPath)) {
      console.warn(`[loadSkills] No .md file found for skill "${name}" — skipping`);
      continue;
    }

    const description = fs.readFileSync(mdPath, 'utf8').trim();
    const factory = require(jsPath);
    const skill = factory(ctx);

    tools[name] = tool({
      description,
      inputSchema: skill.inputSchema,
      execute: skill.execute,
    });
  }

  return tools;
}

module.exports = { loadSkills };
