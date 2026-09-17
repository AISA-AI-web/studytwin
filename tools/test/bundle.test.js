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
// Data.gs must load first: it holds CONFIG and the curriculum that Code.gs uses.
const BUNDLE_FILES = ['Data.gs', 'Code.gs'];

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

BUNDLE_FILES.forEach((f) => {
  if (!fs.existsSync(path.join(root, 'dist', f))) {
    console.error(`dist/${f} missing. Run \`npm run bundle\` first.`);
    process.exit(1);
  }
});
const bundle = BUNDLE_FILES
  .map((f) => fs.readFileSync(path.join(root, 'dist', f), 'utf8')).join('\n');

console.log('\nBundle integrity');

// Apps Script services the bundle references at load time do not exist here; stub
// only what top-level evaluation touches.
const sandbox = { console, JSON, Math, Number, String, Object, Array, isNaN, Date };
vm.createContext(sandbox);

let loadError = null;
try {
  BUNDLE_FILES.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(root, 'dist', f), 'utf8'),
      sandbox, { filename: 'dist/' + f });
  });
} catch (err) {
  loadError = err;
}
check('both bundle files parse and evaluate together',
  loadError === null, loadError && loadError.message);

// A truncated paste is the failure mode this guards against, so the marker that
// makes truncation visible must actually be there.
BUNDLE_FILES.forEach((f) => {
  const text = fs.readFileSync(path.join(root, 'dist', f), 'utf8');
  check(`dist/${f} ends with the truncation marker`,
    /--- END OF .+ --- if you cannot see this line/.test(text.trimEnd().split('\n').pop()));
});

check('verifyInstall is available to run in the editor',
  /function verifyInstall\(\)/.test(bundle));

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
check('the framework catalogue is present', !!api.FRAMEWORK && !!api.FRAMEWORK.grades);

// The bundle carries only the grades this deployment needs: the grade being taught,
// plus the prior grades its Bridging weeks reference. Shipping all fourteen is what
// pushed the paste past the size where it truncates.
const shipped = Object.keys(api.FRAMEWORK.grades).sort();
check('the framework is trimmed to the grades actually needed',
  shipped.join(',') === 'grade4,grade5,grade6', shipped.join(','));
check('Grade 6 Bridging references still resolve in the trimmed catalogue',
  api.FRAMEWORK.grades.grade5.SD.tiers.advanced.descriptor ===
    'Refines prompts to improve output quality and explains why.' &&
  !!api.FRAMEWORK.grades.grade4.CE.tiers.advanced.descriptor,
  'bridging cites AIF\u00B7SD\u00B7G5\u00B7A and AIF\u00B7CE\u00B7G4\u00B7A');
check('grades this deployment does not teach are not shipped',
  api.FRAMEWORK.grades.grade12 === undefined && api.FRAMEWORK.grades.kg1 === undefined);

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

// The earlier version of this test matched only include('ui/...'), the same blind spot
// the bundler had — so it passed while doGet still called createTemplateFromFile('ui/Index'),
// and the app deployed fine then failed on its first page load. Match ANY 'ui/' reference.
check('no "ui/" reference of any kind survives in the bundle',
  !/['"]ui\//.test(bundle),
  (bundle.split('\n').filter((l) => /['"]ui\//.test(l))[0] || '').trim());

check('doGet loads the flattened Index template',
  /createTemplateFromFile\('Index'\)/.test(bundle),
  'doGet must reference Index, not ui/Index');

/*
 * Every HtmlService file reference must name a file that actually ships.
 *
 * These are resolved by NAME at runtime, so a wrong one deploys cleanly and then
 * throws on the first page load — which is exactly how 'ui/Index' reached a live
 * deployment. The bundle is evaluated in Node here, where HtmlService does not
 * exist, so doGet is never executed and nothing catches it dynamically. This
 * checks the references statically instead.
 */
const htmlFiles = new Set(fs.readdirSync(path.join(root, 'dist'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => f.replace(/\.html$/, '')));

const referenced = [...bundle.matchAll(
  /(?:createTemplateFromFile|createHtmlOutputFromFile|include)\(\s*'([^']+)'/g)]
  .map((m) => m[1]);

check('the bundle references at least one HTML file',
  referenced.length > 0, 'the regex found nothing — has the call style changed?');

const missing = [...new Set(referenced)].filter((name) => !htmlFiles.has(name));
check('every HTML file the code loads by name is actually shipped',
  missing.length === 0,
  missing.length ? `referenced but not in dist/: ${missing.join(', ')} ` +
    `(shipped: ${[...htmlFiles].join(', ')})` : '');

// The HTML files load each other the same way, so check their references too.
const htmlRefs = [];
htmlFiles.forEach((name) => {
  const text = fs.readFileSync(path.join(root, 'dist', `${name}.html`), 'utf8');
  [...text.matchAll(/include\(\s*'([^']+)'/g)].forEach((m) => htmlRefs.push(m[1]));
});
const htmlMissing = [...new Set(htmlRefs)].filter((name) => !htmlFiles.has(name));
check('every HTML file included from another HTML file is shipped',
  htmlMissing.length === 0,
  htmlMissing.length ? `referenced but not in dist/: ${htmlMissing.join(', ')}` : '');

['Index', 'Styles', 'App'].forEach((name) => {
  const p = path.join(root, 'dist', `${name}.html`);
  check(`dist/${name}.html exists`, fs.existsSync(p));
  if (fs.existsSync(p)) {
    check(`dist/${name}.html has no "ui/" reference`,
      !/['"]ui\//.test(fs.readFileSync(p, 'utf8')));
  }
});

check('the manifest is included', fs.existsSync(path.join(root, 'dist', 'appsscript.json')));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'appsscript.json'), 'utf8'));
check('the manifest keeps the domain-locked web app settings',
  manifest.webapp.executeAs === 'USER_DEPLOYING' && manifest.webapp.access === 'DOMAIN',
  JSON.stringify(manifest.webapp));

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
