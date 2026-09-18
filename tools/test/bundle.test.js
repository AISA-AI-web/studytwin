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
/*
 * Every .gs the deployment gets. Deliberately loaded in REVERSE, because
 * getCurriculum_() assembles the chunks at runtime and must not depend on paste order —
 * which is the whole reason the curriculum is chunked rather than inlined.
 */
const BUNDLE_FILES = fs.readdirSync(path.join(root, 'dist'))
  .filter((f) => f.endsWith('.gs'))
  .sort()
  .reverse();

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
const sandbox = { console, JSON, Math, Number, String, Object, Array, isNaN, isFinite, Date, Error };
sandbox.globalThis = sandbox;
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
check('all bundle files parse and evaluate together, loaded in reverse order',
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
  CONFIG, CURRICULUM: getCurriculum_(), FRAMEWORK, LEVEL_ORDINAL,
  markWorksheet_, markQuestion_, overallLevelFrom_, buildStrandProfile_,
  getLessonForStudent_, getLessonAuthoritative_, getStandardsIndex_, stripAnswerKey_,
  getCurriculum_
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

const lessonIds = Object.keys(api.CURRICULUM.grade6.lessons);
check('the chunked curriculum reassembles in full',
  lessonIds.length === 32, `assembled ${lessonIds.length} lessons`);
check('both tracks are present',
  lessonIds.some((id) => id.includes('bridging')) && lessonIds.some((id) => id.includes('main')));
check('getCurriculum_ caches rather than reassembling each call',
  api.getCurriculum_() === api.getCurriculum_());

check('the marking engine still runs', (function () {
  const fixture = { questions: [{ id: 'q', type: 'mcq', marks: 2,
    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: 'b' }] };
  return api.markWorksheet_(fixture, { q: 'b' }).percent === 100;
})());

check('the Grade 6 decision rule still applies',
  api.overallLevelFrom_({ CU: 'proficient', SD: 'proficient', CE: 'proficient', GE: 'emerging' },
    'grade6').level === 'proficient');

check('answer keys are still stripped for students',
  api.getLessonForStudent_('grade6', lessonIds[0]).worksheet.questions
    .every((q) => q.answer === undefined && q.lookFor === undefined));

// The formative block is the pack's own teacher planning language. `targets` names the
// tier a lesson is pitched at — "Grade 5 Advanced: explains how data quality affects AI
// outputs" — which tells a student exactly how they are being levelled, on every lesson.
check('every lesson carries the pack\u2019s formative block server-side',
  lessonIds.every((id) => {
    const f = api.getLessonAuthoritative_('grade6', id).formative;
    return f && f.successCriteria && f.targets;
  }));

check('students receive the success criteria',
  lessonIds.every((id) =>
    (api.getLessonForStudent_('grade6', id).formative || {}).successCriteria));

check('students receive no other formative field',
  lessonIds.every((id) => {
    const keys = Object.keys(api.getLessonForStudent_('grade6', id).formative || {});
    return keys.length === 1 && keys[0] === 'successCriteria';
  }));

console.log('\nApps Script API usage suits a standalone web app');

/*
 * getDocumentLock() is for container-bound scripts. This is a standalone web app with
 * no container document, so that lock cannot be acquired and every write throws — which
 * is how the first student submission failed with "Something went wrong". A script lock
 * is also the right scope here: it serialises writes across all users of the one shared
 * datastore.
 */
// Match the CALL, not the word — the source comments mention getDocumentLock precisely
// to explain why it must not be used, and a bare word match flags its own documentation.
check('no container-bound lock is used',
  !/LockService\s*\.\s*getDocumentLock\s*\(/.test(bundle),
  'getDocumentLock() yields an unusable lock in a standalone script — use getScriptLock()');
check('writes are serialised with a script lock',
  /LockService\.getScriptLock\(\)/.test(bundle));

// Same class of mistake: these only exist for container-bound scripts and would throw here.
[['SpreadsheetApp', 'getActiveSpreadsheet'],
 ['DocumentApp', 'getActiveDocument'],
 ['SpreadsheetApp', 'getUi']].forEach(([service, call]) => {
  const pattern = new RegExp(service + '\\s*\\.\\s*' + call + '\\s*\\(');
  check(`no container-bound call: ${service}.${call}()`, !pattern.test(bundle),
    `${call}() requires a bound container and throws in a standalone web app`);
});

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
