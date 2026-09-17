#!/usr/bin/env node
/**
 * Verifies the paste-ready bundle behaves identically to the multi-file source.
 *
 * Concatenating Apps Script files into one is not free: separate files tolerate a
 * duplicate top-level declaration that a single file rejects outright as a
 * SyntaxError, and load-time `const` use across files becomes order-dependent.
 * A bundle that fails only once pasted into the editor would be discovered by
 * whoever is deploying, which is the worst place to find it.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const bundlePath = path.join(root, 'dist', 'Code.gs');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

if (!fs.existsSync(bundlePath)) {
  console.error('dist/Code.gs missing. Run `npm run bundle` first.');
  process.exit(1);
}
const bundle = fs.readFileSync(bundlePath, 'utf8');

console.log('\nBundle integrity');

// Apps Script services the bundle references at load time do not exist here; stub
// only what top-level evaluation touches.
const sandbox = { console, JSON, Math, Number, String, Object, Array, isNaN, Date };
vm.createContext(sandbox);

let loadError = null;
try {
  vm.runInContext(bundle, sandbox, { filename: 'dist/Code.gs' });
} catch (err) {
  loadError = err;
}
check('the bundle parses and evaluates as a single file',
  loadError === null, loadError && loadError.message);

if (loadError) { console.log(`\n${passed} passed, ${failed} failed.`); process.exit(1); }

const api = vm.runInContext(`({
  CONFIG, CURRICULUM, FRAMEWORK, LEVEL_ORDINAL,
  markWorksheet_, markQuestion_, overallLevelFrom_, buildStrandProfile_,
  getLessonForStudent_, getStandardsIndex_, stripAnswerKey_
})`, sandbox);

check('CONFIG survived concatenation', !!api.CONFIG && api.CONFIG.ALLOWED_DOMAIN === 'aisa.sch.ae');
check('LEVEL_ORDINAL computed at load time from CONFIG',
  api.LEVEL_ORDINAL && api.LEVEL_ORDINAL.emerging === 1);
check('the curriculum is present', !!api.CURRICULUM && !!api.CURRICULUM.grade6);
check('the framework catalogue is present',
  !!api.FRAMEWORK && Object.keys(api.FRAMEWORK.grades).length === 14);

console.log('\nBehaviour matches the multi-file source');

const lesson = api.CURRICULUM.grade6.lessons['g6-l01'];
const perfect = {};
lesson.worksheet.questions.forEach((q) => {
  if (q.autoMarked === false) return;
  switch (q.type) {
    case 'mcq': case 'truefalse': perfect[q.id] = q.answer; break;
    case 'multi': perfect[q.id] = q.answer.slice(); break;
    case 'matching': perfect[q.id] = Object.assign({}, q.answer); break;
    case 'ordering': perfect[q.id] = q.answer.slice(); break;
    case 'numeric': perfect[q.id] = q.answer; break;
    case 'fillBlank': perfect[q.id] = q.answer.map((a) => Array.isArray(a) ? a[0] : a); break;
    case 'shortText': perfect[q.id] = q.modelAnswer; break;
  }
});
check('marking still scores a perfect paper at 100%',
  api.markWorksheet_(lesson.worksheet, perfect).percent === 100,
  `got ${api.markWorksheet_(lesson.worksheet, perfect).percent}%`);

check('the Grade 6 decision rule still applies',
  api.overallLevelFrom_({ CU: 'proficient', SD: 'proficient', CE: 'proficient', GE: 'emerging' },
    'grade6').level === 'proficient');

check('answer keys are still stripped for students',
  api.getLessonForStudent_('grade6', 'g6-l01').worksheet.questions
    .every((q) => q.answer === undefined));

console.log('\nUI include paths are flattened for the editor');

check('no "ui/" include survives in the bundle',
  !/include\('ui\//.test(bundle), 'the editor cannot create a file with "/" in its name');

['Index', 'Styles', 'App'].forEach((name) => {
  const p = path.join(root, 'dist', `${name}.html`);
  check(`dist/${name}.html exists`, fs.existsSync(p));
  if (fs.existsSync(p)) {
    check(`dist/${name}.html has no "ui/" include`,
      !/include\('ui\//.test(fs.readFileSync(p, 'utf8')));
  }
});

check('the manifest is included', fs.existsSync(path.join(root, 'dist', 'appsscript.json')));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'appsscript.json'), 'utf8'));
check('the manifest keeps the domain-locked web app settings',
  manifest.webapp.executeAs === 'USER_DEPLOYING' && manifest.webapp.access === 'DOMAIN',
  JSON.stringify(manifest.webapp));

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
