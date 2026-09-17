#!/usr/bin/env node
/**
 * Exercises the marking, content-stripping and attainment logic against the real
 * curriculum JSON, outside Apps Script.
 *
 * The .gs files are plain V8 JavaScript with no Apps Script services used in
 * these three modules, so they can be concatenated and evaluated directly. This
 * is the only way to test marking without deploying — and marking is the part
 * where a bug silently gives every student the wrong grade.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const load = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const sandbox = { console, JSON, Math, Number, String, Object, Array, isNaN, Date };
vm.createContext(sandbox);
[
  'src/Config.gs',
  'src/generated/CurriculumData.gs',
  'src/Marking.gs',
  'src/Content.gs',
  'src/Attainment.gs'
].forEach((file) => vm.runInContext(load(file), sandbox, { filename: file }));

// `const` declarations are lexical and never land on the context's global object,
// so CONFIG and CURRICULUM have to be pulled out by evaluating an expression
// inside the context rather than read off `sandbox` directly.
const api = vm.runInContext(`({
  CONFIG, CURRICULUM,
  markWorksheet_, markQuestion_,
  getLessonForStudent_, computeAttainment_
})`, sandbox);

let passed = 0, failed = 0;
function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/** Builds the fully-correct answer set for a worksheet from its answer keys. */
function perfectAnswers(worksheet) {
  const answers = {};
  worksheet.questions.forEach((q) => {
    switch (q.type) {
      case 'mcq': answers[q.id] = q.answer; break;
      case 'truefalse': answers[q.id] = q.answer; break;
      case 'multi': answers[q.id] = q.answer.slice(); break;
      case 'matching': answers[q.id] = Object.assign({}, q.answer); break;
      case 'ordering': answers[q.id] = q.answer.slice(); break;
      case 'numeric': answers[q.id] = q.answer; break;
      case 'fillBlank':
        answers[q.id] = q.answer.map((a) => (Array.isArray(a) ? a[0] : a));
        break;
      case 'shortText':
        // Answer with the model answer — it should satisfy the keyword rules.
        answers[q.id] = q.modelAnswer;
        break;
    }
  });
  return answers;
}

console.log('\nFull marks on a perfect paper');
['g6-l01', 'g6-l02'].forEach((id) => {
  const lesson = api.CURRICULUM.grade6.lessons[id];
  const result = api.markWorksheet_(lesson.worksheet, perfectAnswers(lesson.worksheet));
  check(`${id} scores 100%`, result.percent === 100,
    `got ${result.percent}% (${result.marksAwarded}/${result.marksAvailable}); ` +
    result.results.filter((r) => !r.correct).map((r) => r.questionId).join(', '));
});

console.log('\nZero on an empty paper');
['g6-l01', 'g6-l02'].forEach((id) => {
  const lesson = api.CURRICULUM.grade6.lessons[id];
  const result = api.markWorksheet_(lesson.worksheet, {});
  check(`${id} scores 0%`, result.percent === 0, `got ${result.percent}%`);
  check(`${id} marks every question unanswered`,
    result.results.every((r) => r.answered === false));
});

console.log('\nPartial credit');
const l01 = api.CURRICULUM.grade6.lessons['g6-l01'];
const multi = l01.worksheet.questions.find((q) => q.id === 'l01q3');
check('multi: two of three correct earns 2/3 of the marks',
  api.markQuestion_(multi, ['a', 'c']).marksAwarded === Math.round((2 / 3) * multi.marks * 100) / 100,
  `got ${api.markQuestion_(multi, ['a', 'c']).marksAwarded} of ${multi.marks}`);
check('multi: selecting everything scores zero',
  api.markQuestion_(multi, ['a', 'b', 'c', 'd', 'e']).marksAwarded === 0,
  'guessing all options must not earn marks');
check('multi: one right and one wrong nets close to zero',
  api.markQuestion_(multi, ['a', 'b']).marksAwarded === 0,
  `got ${api.markQuestion_(multi, ['a', 'b']).marksAwarded}`);
check('multi: all correct with no distractors picked earns full marks',
  api.markQuestion_(multi, ['a', 'c', 'd']).marksAwarded === multi.marks);
check('multi: duplicate submissions of the same option are not double counted',
  api.markQuestion_(multi, ['a', 'a', 'c', 'd']).marksAwarded === multi.marks);

const matching = l01.worksheet.questions.find((q) => q.id === 'l01q4');
check('matching: half the pairs earns half the marks',
  api.markQuestion_(matching, { l1: 'r1', l2: 'r2', l3: 'r1', l4: 'r1' }).marksAwarded === matching.marks / 2);

const ordering = api.CURRICULUM.grade6.lessons['g6-l02'].worksheet.questions
  .find((q) => q.id === 'l02q1');
check('ordering: reversed sequence scores zero',
  api.markQuestion_(ordering, ordering.answer.slice().reverse()).marksAwarded === 0);

console.log('\nText normalisation');
const fill = l01.worksheet.questions.find((q) => q.id === 'l01q5');
check('fillBlank accepts any listed synonym',
  api.markQuestion_(fill, ['examples', 'instructions']).correct);
check('fillBlank ignores case and surrounding whitespace',
  api.markQuestion_(fill, ['  DATA  ', 'Rules']).correct);
check('fillBlank rejects a wrong word',
  api.markQuestion_(fill, ['pizza', 'rules']).marksAwarded === fill.marks / 2);

const short = l01.worksheet.questions.find((q) => q.id === 'l01q6');
check('shortText credits an answer containing enough keywords',
  api.markQuestion_(short, 'Cats vary a lot so you learn from examples and patterns.').correct);
check('shortText gives partial credit for one keyword',
  api.markQuestion_(short, 'Because of patterns.').partial);
check('shortText scores an off-topic answer zero',
  api.markQuestion_(short, 'I do not know.').marksAwarded === 0);

console.log('\nNumeric tolerance');
const numeric = api.CURRICULUM.grade6.lessons['g6-l02'].worksheet.questions
  .find((q) => q.id === 'l02q2');
check('numeric accepts the exact value', api.markQuestion_(numeric, 85).correct);
check('numeric accepts a value inside tolerance', api.markQuestion_(numeric, 85.4).correct);
check('numeric rejects a value outside tolerance', api.markQuestion_(numeric, 80).marksAwarded === 0);
check('numeric rejects text', api.markQuestion_(numeric, 'eighty five').marksAwarded === 0);

console.log('\nAnswer keys never reach the browser');
const safe = api.getLessonForStudent_('grade6', 'g6-l01');
const serialised = JSON.stringify(safe);
check('stripped lesson has no "answer" field',
  safe.worksheet.questions.every((q) => q.answer === undefined));
check('stripped lesson has no acceptedAnswers or keyword lists',
  safe.worksheet.questions.every((q) =>
    q.acceptedAnswers === undefined && q.keywordsAny === undefined && q.keywordsAll === undefined));
check('stripped lesson has no modelAnswer', !/modelAnswer/.test(serialised));
check('stripped lesson has no feedback text', !/"feedback"/.test(serialised));
check('stripped lesson keeps options students need to answer',
  safe.worksheet.questions.find((q) => q.id === 'l01q1').options.length === 4);
check('the authoritative copy is untouched by stripping',
  api.CURRICULUM.grade6.lessons['g6-l01'].worksheet.questions[0].answer === 'b');

console.log('\nAttainment rollup');
const perfect = ['g6-l01', 'g6-l02'].map((id) => {
  const lesson = api.CURRICULUM.grade6.lessons[id];
  const marked = api.markWorksheet_(lesson.worksheet, perfectAnswers(lesson.worksheet));
  return { lessonId: id, resultsJson: JSON.stringify(marked.results) };
});
const attainment = api.computeAttainment_('grade6', perfect);
check('a perfect student is 100% overall', attainment.overall.percent === 100);
check('a perfect student bands as Mastery', attainment.overall.band === 'mastery');
// 8, not 10: AI.6.3.2 and AI.6.4.2 are defined in standards.json but no question
// in either worksheet assesses them yet. validate-content.js reports that gap.
check('every standard tagged in the worksheets is evidenced',
  attainment.byStandard.length === 8,
  `evidenced ${attainment.byStandard.length} standards: ` +
  attainment.byStandard.map((s) => s.code).join(', '));

// Regression: the overall figure must count each question once, not once per
// standard tag. Summing the per-standard rows reported a student who scored
// 46.67% on every paper as 52.5% overall — above the 50% pass mark.
const partialSubs = ['g6-l01', 'g6-l02'].map((id) => {
  const lesson = api.CURRICULUM.grade6.lessons[id];
  const answers = perfectAnswers(lesson.worksheet);
  // Drop the multi-standard questions so double-counting would show up.
  lesson.worksheet.questions.forEach((q) => {
    if ((q.standards || []).length > 1) delete answers[q.id];
  });
  const marked = api.markWorksheet_(lesson.worksheet, answers);
  return { lessonId: id, resultsJson: JSON.stringify(marked.results), marked: marked };
});
const partialAttainment = api.computeAttainment_('grade6', partialSubs);
const rawAwarded = partialSubs.reduce((n, s) => n + s.marked.marksAwarded, 0);
const rawAvailable = partialSubs.reduce((n, s) => n + s.marked.marksAvailable, 0);
const rawPercent = Math.round((rawAwarded / rawAvailable) * 100 * 100) / 100;

check('overall marks equal the sum of the worksheet marks',
  partialAttainment.overall.marksAwarded === rawAwarded &&
  partialAttainment.overall.marksAvailable === rawAvailable,
  `attainment says ${partialAttainment.overall.marksAwarded}/${partialAttainment.overall.marksAvailable}, ` +
  `worksheets say ${rawAwarded}/${rawAvailable}`);
check('overall percent equals the true average worksheet mark',
  Math.abs(partialAttainment.overall.percent - rawPercent) < 0.01,
  `attainment ${partialAttainment.overall.percent}% vs worksheets ${rawPercent}%`);
check('per-standard totals still exceed the raw total (full credit per tag)',
  partialAttainment.byStandard.reduce((n, r) => n + r.marksAvailable, 0) > rawAvailable,
  'multi-tagged questions should still count toward every standard they evidence');

// A student below the pass mark on every paper must not report above it.
const failing = ['g6-l01'].map((id) => {
  const lesson = api.CURRICULUM.grade6.lessons[id];
  const answers = perfectAnswers(lesson.worksheet);
  let dropped = 0;
  lesson.worksheet.questions.forEach((q) => {
    if (dropped < 3) { delete answers[q.id]; dropped++; }
  });
  const marked = api.markWorksheet_(lesson.worksheet, answers);
  return { lessonId: id, resultsJson: JSON.stringify(marked.results), percent: marked.percent };
});
check('a student scoring below the pass mark reports below it overall',
  (failing[0].percent < api.CONFIG.PASS_PERCENT) ===
  (api.computeAttainment_('grade6', failing).overall.percent < api.CONFIG.PASS_PERCENT),
  `worksheet ${failing[0].percent}% vs overall ` +
  `${api.computeAttainment_('grade6', failing).overall.percent}%`);

const empty = api.computeAttainment_('grade6', []);
check('a student with no work is 0% and evidences nothing',
  empty.overall.percent === 0 && empty.byStandard.length === 0);

const half = ['g6-l01'].map((id) => {
  const lesson = api.CURRICULUM.grade6.lessons[id];
  const marked = api.markWorksheet_(lesson.worksheet, {});
  return { lessonId: id, resultsJson: JSON.stringify(marked.results) };
});
check('a zero-scoring submission still bands as Emerging, not undefined',
  api.computeAttainment_('grade6', half).overall.band === 'emerging');

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
