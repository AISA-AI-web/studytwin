#!/usr/bin/env node
/**
 * Builds a paste-ready bundle for deploying without a terminal.
 *
 * The normal path is `clasp push` from a clone, which is right for repeated updates.
 * But it asks whoever deploys to install Node, clone a private repo and write a config
 * file — a lot of ceremony for a school running one platform, and the only reason it is
 * needed is that the source is spread across thirteen files.
 *
 * This collapses the server code into a single .gs and flattens the UI filenames, so a
 * deployment is five copy-pastes into the Apps Script editor. Same code, same tests,
 * same behaviour — just fewer files to move.
 *
 *   npm run bundle   ->  dist/
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

const generated = path.join(src, 'generated', 'CurriculumData.gs');
if (!fs.existsSync(generated)) {
  console.error('Run `npm run build` first — the curriculum has not been compiled.');
  process.exit(1);
}

/**
 * Concatenation order.
 *
 * Apps Script shares one global scope across files, so function order does not matter.
 * Top-level `const` does: Config.gs computes LEVEL_ORDINAL from CONFIG at load time, and
 * the generated curriculum is referenced by Content.gs. Both come first so the bundle
 * evaluates cleanly top to bottom.
 */
const ORDER = [
  'Config.gs',
  'generated/CurriculumData.gs',
  'Auth.gs',
  'Db.gs',
  'Content.gs',
  'Marking.gs',
  'Attainment.gs',
  'Api.gs',
  'Code.gs'
];

const banner = (name) =>
  `\n/* ${'='.repeat(74)}\n * ${name}\n * ${'='.repeat(74)} */\n\n`;

let code = `/**
 * StudyTwin — bundled server code.
 *
 * GENERATED FILE. Every section below is one file from src/ in the repository.
 * Do not edit this in the Apps Script editor: regenerate it with \`npm run bundle\`
 * and paste it again, or the next rebuild will silently discard your change.
 *
 * Built: ${new Date().toISOString()}
 */
`;

ORDER.forEach((file) => {
  const full = path.join(src, file);
  if (!fs.existsSync(full)) {
    console.error(`Missing ${file} — bundle would be incomplete.`);
    process.exit(1);
  }
  code += banner(file) + fs.readFileSync(full, 'utf8').trimEnd() + '\n';
});

// The editor will not accept "/" in a filename, so the UI files flatten to Index,
// Styles and App, and the include() calls are rewritten to match.
code = code.replace(/include\('ui\/(\w+)'\)/g, "include('$1')");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'Code.gs'), code);

['Index', 'Styles', 'App'].forEach((name) => {
  let html = fs.readFileSync(path.join(src, 'ui', `${name}.html`), 'utf8');
  html = html.replace(/include\('ui\/(\w+)'\)/g, "include('$1')");
  fs.writeFileSync(path.join(dist, `${name}.html`), html);
});

fs.copyFileSync(path.join(src, 'appsscript.json'), path.join(dist, 'appsscript.json'));

const files = fs.readdirSync(dist).sort();
console.log('Wrote dist/ — paste these into the Apps Script editor:\n');
files.forEach((f) => {
  const kb = (fs.statSync(path.join(dist, f)).size / 1024).toFixed(0);
  const type = f.endsWith('.gs') ? 'Script' : f.endsWith('.html') ? 'HTML' : 'manifest';
  console.log(`  ${f.padEnd(20)} ${String(kb).padStart(4)} KB   (${type})`);
});
console.log(`\n${files.length} files instead of 13. See docs/deployment.md.`);
