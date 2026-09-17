#!/usr/bin/env node
/**
 * Syntax-checks Apps Script .gs files.
 *
 * `node --check` refuses the .gs extension, so each file is copied to a temp .js
 * and checked there. Catches the class of typo that would otherwise only surface
 * as a blank page after a clasp push.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const srcDir = path.join(__dirname, '..', 'src');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-check-'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const all = walk(srcDir);
let failed = 0;

let checked = 0;

function checkSource(label, source) {
  checked++;
  const tmp = path.join(tmpDir, label.replace(/[^a-z0-9]/gi, '_') + '.js');
  fs.writeFileSync(tmp, source);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    console.log('  ok   ' + label);
  } catch (err) {
    failed++;
    console.error('  FAIL ' + label);
    console.error(String(err.stderr).split('\n').slice(0, 6).join('\n'));
  }
}

for (const file of all.filter((f) => f.endsWith('.gs'))) {
  checkSource(path.relative(srcDir, file), fs.readFileSync(file, 'utf8'));
}

// The SPA lives inside <script> tags in an .html file, so a typo there would
// otherwise only show up as a blank page in the browser after a deploy.
for (const file of all.filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    // Apps Script template tags are server-side and are not valid JS on their own.
    .filter((code) => code.trim() && !/<\?[!=]?/.test(code));

  blocks.forEach((code, i) => {
    checkSource(path.relative(srcDir, file) + ' <script #' + (i + 1) + '>', code);
  });
}



fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(failed ? `\n${failed} of ${checked} checked failed.` : `\n${checked} source(s) OK.`);
process.exit(failed ? 1 : 0);
