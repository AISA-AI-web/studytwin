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

const sandbox = { console, JSON, Math, Number, String, Object, Array, isNaN, isFinite, Date, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
[
  'src/Config.gs',
  ...fs.readdirSync(path.join(root, 'src/generated')).filter((f) => f.endsWith('.gs')).map((f) => `src/generated/${f}`),
  'src/Marking.gs',
  'src/Content.gs',
  'src/Attainment.gs'
].forEach((file) => vm.runInContext(load(file), sandbox, { filename: file }));

// `const` declarations are lexical and never land on the context's global object,
// so CONFIG and CURRICULUM have to be pulled out by evaluating an expression
// inside the context rather than read off `sandbox` directly.
const api = vm.runInContext(`({
  CONFIG, CURRICULUM: getCurriculum_(),
  markWorksheet_, markQuestion_,
  getLessonForStudent_, stripAnswerKey_, markWorksheet_
})`, sandbox);

let passed = 0, failed = 0;
function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/*
 * FIXTURES, not curriculum.
 *
 * These tests used to run against whatever lessons happened to be in the repo, so they
 * broke the moment the placeholder content was replaced — and, worse, they would have
 * gone quiet if real content contained no auto-marked questions, which is exactly what
 * the published Grade 6 pack turns out to be. The marking engine still has to work for
 * grades and worksheets that do carry closed items, so it is tested against fixtures
 * that exercise every supported type regardless of what content is loaded.
 */
const REF = [{ framework: 'AIF', strand: 'CU', grade: 6, tier: 'E', code: 'AIF\u00B7CU\u00B7G6\u00B7E' }];

const FIXTURE = {
  title: 'Marking engine fixture',
  questions: [
    { id: 'q-mcq', type: 'mcq', marks: 2, frameworkRefs: REF,
      prompt: 'Which best describes a learning system?',
      options: [{ id: 'a', text: 'It follows written rules' },
                { id: 'b', text: 'It finds patterns in examples' },
                { id: 'c', text: 'It stores a lookup table' },
                { id: 'd', text: 'It runs faster' }],
      answer: 'b',
      feedback: { correct: 'Yes.', incorrect: 'Reread the section on learning.' } },

    { id: 'q-tf', type: 'truefalse', marks: 1, frameworkRefs: REF,
      prompt: 'General AI exists today.', answer: false },

    { id: 'q-multi', type: 'multi', marks: 3, frameworkRefs: REF,
      prompt: 'Select all that use machine learning.',
      options: [{ id: 'a', text: 'Voice assistant' }, { id: 'b', text: 'Calculator' },
                { id: 'c', text: 'Recommendations' }, { id: 'd', text: 'Spam filter' },
                { id: 'e', text: 'Digital clock' }],
      answer: ['a', 'c', 'd'] },

    { id: 'q-match', type: 'matching', marks: 4, frameworkRefs: REF,
      prompt: 'Match each system to the data it learns from.',
      left: [{ id: 'l1', text: 'Face recognition' }, { id: 'l2', text: 'Translation' },
             { id: 'l3', text: 'Spam filter' }, { id: 'l4', text: 'Music picks' }],
      right: [{ id: 'r1', text: 'Labelled photos' }, { id: 'r2', text: 'Translated sentences' },
              { id: 'r3', text: 'Junk-marked email' }, { id: 'r4', text: 'Listening history' }],
      answer: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' } },

    { id: 'q-order', type: 'ordering', marks: 4, frameworkRefs: REF,
      prompt: 'Put the stages in order.',
      items: [{ id: 's1', text: 'Collect examples' }, { id: 's2', text: 'Train' },
              { id: 's3', text: 'Test on unseen items' }, { id: 's4', text: 'Improve and retrain' }],
      answer: ['s1', 's2', 's3', 's4'] },

    { id: 'q-num', type: 'numeric', marks: 2, frameworkRefs: REF,
      prompt: '17 correct out of 20. Accuracy as a percentage?',
      answer: 85, tolerance: 0.5 },

    { id: 'q-fill', type: 'fillBlank', marks: 2, frameworkRefs: REF,
      prompt: 'Complete: machine learning finds patterns in ___ instead of following ___.',
      blanks: ['first blank', 'second blank'],
      answer: [['data', 'examples', 'training data'], ['rules', 'instructions', 'a rule']] },

    { id: 'q-short', type: 'shortText', marks: 3, frameworkRefs: REF,
      prompt: 'Explain why examples beat rules for recognising a cat.',
      keywordsAny: ['pattern', 'example', 'learn', 'rule', 'vary', 'different'],
      keywordsNeeded: 2,
      modelAnswer: 'Cats vary so much that the rules would be endless; examples let the ' +
                   'system find the pattern itself.' }
  ]
};

/** The fully-correct answer set for a worksheet, built from its own answer keys. */
function perfectAnswers(worksheet) {
  const answers = {};
  worksheet.questions.forEach((q) => {
    if (q.autoMarked === false) return;
    switch (q.type) {
      case 'mcq': case 'truefalse': case 'numeric': answers[q.id] = q.answer; break;
      case 'multi': case 'ordering': answers[q.id] = q.answer.slice(); break;
      case 'matching': answers[q.id] = Object.assign({}, q.answer); break;
      case 'fillBlank':
        answers[q.id] = q.answer.map((a) => (Array.isArray(a) ? a[0] : a)); break;
      case 'shortText': answers[q.id] = q.modelAnswer; break;
    }
  });
  return answers;
}

const FIXTURE_TOTAL = FIXTURE.questions
  .reduce((sum, q) => sum + (q.autoMarked === false ? 0 : q.marks), 0);

console.log('\nFull marks on a perfect paper');
const perfect = api.markWorksheet_(FIXTURE, perfectAnswers(FIXTURE));
check('a perfect paper scores 100%', perfect.percent === 100,
  `got ${perfect.percent}% (${perfect.marksAwarded}/${perfect.marksAvailable}); wrong: ` +
  perfect.results.filter((r) => !r.correct).map((r) => r.questionId).join(', '));
check('every supported question type is exercised',
  new Set(FIXTURE.questions.map((q) => q.type)).size === 8,
  'the fixture must cover all eight markable types');
check('marks available equal the paper total',
  perfect.marksAvailable === FIXTURE_TOTAL, `${perfect.marksAvailable} vs ${FIXTURE_TOTAL}`);

console.log('\nZero on an empty paper');
const empty = api.markWorksheet_(FIXTURE, {});
check('an empty paper scores 0%', empty.percent === 0, `got ${empty.percent}%`);
check('every question is recorded unanswered',
  empty.results.every((r) => r.answered === false));
check('an unanswered paper still reports the marks that were available',
  empty.marksAvailable === FIXTURE_TOTAL);

console.log('\nPartial credit');
const multi = FIXTURE.questions.find((q) => q.id === 'q-multi');
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

const matching = FIXTURE.questions.find((q) => q.id === 'q-match');
check('matching: half the pairs earns half the marks',
  api.markQuestion_(matching, { l1: 'r1', l2: 'r2', l3: 'r1', l4: 'r1' }).marksAwarded === matching.marks / 2);

const ordering = FIXTURE.questions.find((q) => q.id === 'q-order');
check('ordering: reversed sequence scores zero',
  api.markQuestion_(ordering, ordering.answer.slice().reverse()).marksAwarded === 0);

console.log('\nText normalisation');
const fill = FIXTURE.questions.find((q) => q.id === 'q-fill');
check('fillBlank accepts any listed synonym',
  api.markQuestion_(fill, ['examples', 'instructions']).correct);
check('fillBlank ignores case and surrounding whitespace',
  api.markQuestion_(fill, ['  DATA  ', 'Rules']).correct);
check('fillBlank rejects a wrong word',
  api.markQuestion_(fill, ['pizza', 'rules']).marksAwarded === fill.marks / 2);

const short = FIXTURE.questions.find((q) => q.id === 'q-short');
check('shortText credits an answer containing enough keywords',
  api.markQuestion_(short, 'Cats vary a lot so you learn from examples and patterns.').correct);
check('shortText gives partial credit for one keyword',
  api.markQuestion_(short, 'Because of patterns.').partial);
check('shortText scores an off-topic answer zero',
  api.markQuestion_(short, 'I do not know.').marksAwarded === 0);

console.log('\nNumeric tolerance');
const numeric = FIXTURE.questions.find((q) => q.id === 'q-num');
check('numeric accepts the exact value', api.markQuestion_(numeric, 85).correct);
check('numeric accepts a value inside tolerance', api.markQuestion_(numeric, 85.4).correct);
check('numeric rejects a value outside tolerance', api.markQuestion_(numeric, 80).marksAwarded === 0);
check('numeric rejects text', api.markQuestion_(numeric, 'eighty five').marksAwarded === 0);

console.log('\nOpen responses are captured, never scored');

const openQ = {
  id: 'open1', type: 'shortText', autoMarked: false, prompt: 'Explain why.',
  lookFor: 'Links the data cause to the output effect.',
  frameworkRefs: [{ strand: 'CU', code: 'AIF\u00B7CU\u00B7G6\u00B7E' }]
};
const openMarked = api.markQuestion_(openQ, 'The data was noisy so the output was wrong.');
check('an open response is flagged for teacher review',
  openMarked.needsTeacherReview === true);
check('it scores nothing and offers nothing to score',
  openMarked.marksAwarded === 0 && openMarked.marksAvailable === 0);
check('it is never marked correct or partial',
  openMarked.correct === false && openMarked.partial === false);
check('the response itself is carried through for the teacher to read',
  openMarked.response === 'The data was noisy so the output was wrong.');
check('the teacher look-for travels with the result',
  openMarked.lookFor === 'Links the data cause to the output effect.');
check('an unanswered open response is recorded as unanswered, not wrong',
  api.markQuestion_(openQ, '').answered === false);

const mixed = {
  questions: [
    { id: 'm1', type: 'mcq', marks: 2, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      answer: 'a' },
    openQ
  ]
};
const mixedResult = api.markWorksheet_(mixed, { m1: 'a', open1: 'some writing' });
check('a mixed worksheet scores only its markable part',
  mixedResult.marksAwarded === 2 && mixedResult.marksAvailable === 2 &&
  mixedResult.percent === 100,
  `got ${mixedResult.marksAwarded}/${mixedResult.marksAvailable} = ${mixedResult.percent}%`);
check('open responses are counted separately so the teacher knows there is reading to do',
  mixedResult.openResponses === 1);
check('an all-open worksheet reports 0 available rather than a misleading 0%',
  api.markWorksheet_({ questions: [openQ] }, { open1: 'x' }).marksAvailable === 0);

console.log('\nAnswer keys never reach the browser');
const safe = api.stripAnswerKey_({ id: 'fixture', worksheet: FIXTURE });
const serialised = JSON.stringify(safe);
check('stripped worksheet has no "answer" field',
  safe.worksheet.questions.every((q) => q.answer === undefined));
check('stripped worksheet has no acceptedAnswers or keyword lists',
  safe.worksheet.questions.every((q) =>
    q.acceptedAnswers === undefined && q.keywordsAny === undefined && q.keywordsAll === undefined));
check('stripped worksheet has no modelAnswer', !/modelAnswer/.test(serialised));
check('stripped worksheet has no feedback text', !/"feedback"/.test(serialised));
check('stripped worksheet keeps options students need to answer',
  safe.worksheet.questions.find((q) => q.id === 'q-mcq').options.length === 4);
check('the authoritative copy is untouched by stripping',
  FIXTURE.questions.find((q) => q.id === 'q-mcq').answer === 'b');

/*
 * The same guarantee, swept across the real curriculum.
 *
 * The fixture proves the function works; this proves it holds for every lesson actually
 * shipped, which is what matters. It is also the check that would catch an authoring
 * mistake putting a teacher-only field somewhere stripAnswerKey_ does not look.
 */
const gradeKeys = Object.keys(api.CURRICULUM);
let lessonsSwept = 0;
const leaks = [];
gradeKeys.forEach((gradeKey) => {
  Object.keys(api.CURRICULUM[gradeKey].lessons || {}).forEach((lessonId) => {
    lessonsSwept++;
    const student = JSON.stringify(api.getLessonForStudent_(gradeKey, lessonId));
    ['answer', 'lookFor', 'modelAnswer', 'acceptedAnswers', 'keywordsAny', 'keywordsAll',
     'feedback', 'tierProbed'].forEach((field) => {
      if (new RegExp('"' + field + '"').test(student)) {
        leaks.push(`${lessonId}: "${field}"`);
      }
    });
  });
});
check('every shipped lesson was swept', lessonsSwept > 0, `swept ${lessonsSwept}`);
check(`no teacher-only field reaches a student in any of ${lessonsSwept} lessons`,
  leaks.length === 0, leaks.slice(0, 5).join('; '));

const safeOpen = api.stripAnswerKey_({
  worksheet: { questions: [openQ] }
}).worksheet.questions[0];
check('a stripped open response keeps its autoMarked flag so the UI can say so',
  safeOpen.autoMarked === false);
check('but never carries the teacher look-for to the browser',
  safeOpen.lookFor === undefined && !/lookFor/.test(JSON.stringify(safeOpen)));

console.log('\nEvery readable authoring shape survives the trip to the marking engine');
{
  /*
   * normaliseAnswerShape lives in the assembler, but what it has to produce is defined
   * entirely by this engine, so it is tested against it.
   *
   * Each case below is a shape an author (or a generating agent) actually wrote. They
   * all share one failure mode: handed to markQuestion_ unconverted, none of them throws
   * or warns — they award zero to every student on every attempt while the worksheet
   * still submits and still shows a score. That is why these are worth a test each.
   */
  const assembler = fs.readFileSync(path.join(root, 'tools/assemble-grade6.js'), 'utf8');
  const fnSource = assembler.match(/function normaliseAnswerShape\(question\) \{[\s\S]*?\n\}/)[0];
  const normalise = new Function(`${fnSource}; return normaliseAnswerShape;`)();

  /** Marks a question the way a browser would submit a correct answer. */
  function scoreCorrect(q) {
    normalise(q);
    let response;
    switch (q.type) {
      case 'matching':
        response = {};
        (q.left || []).forEach((l) => { response[String(l.id)] = String((q.answer || {})[l.id]); });
        break;
      case 'ordering': case 'multi': response = (q.answer || []).map(String); break;
      case 'fillBlank':
        response = (q.answer || []).map((a) => String(Array.isArray(a) ? a[0] : a));
        break;
      default: response = String(q.answer);
    }
    return api.markWorksheet_({ questions: [q] }, { [q.id]: response }).percent;
  }

  check('mcq: options as plain strings, answer as a position',
    scoreCorrect({ id: 'q', type: 'mcq', marks: 1,
      options: ['Rule-based', 'Learning'], answer: 1 }) === 100);

  check('mcq: options already carrying ids is left alone',
    scoreCorrect({ id: 'q', type: 'mcq', marks: 1,
      options: [{ id: 'a', text: 'Rule-based' }, { id: 'b', text: 'Learning' }],
      answer: 'b' }) === 100);

  check('multi: answer as positions',
    scoreCorrect({ id: 'q', type: 'multi', marks: 3,
      options: ['Remove names', 'Check the fact', 'Share it anyway', 'Mark what is unclear'],
      answer: [0, 1, 3] }) === 100);

  check('ordering: answer as the item texts in order',
    scoreCorrect({ id: 'q', type: 'ordering', marks: 4,
      items: ['Name the system', 'Write the prompt', 'Triage the output', 'Check the risk'],
      answer: ['Name the system', 'Write the prompt', 'Triage the output', 'Check the risk'] }) === 100);

  check('matching: a list of {left, right} pairs',
    scoreCorrect({ id: 'q', type: 'matching', marks: 2,
      left: [{ id: 'L1', text: 'Rules a person wrote' }, { id: 'L2', text: 'Learned from data' }],
      right: [{ id: 'R1', text: 'Rule-based' }, { id: 'R2', text: 'Learning' }],
      answer: [{ left: 'L1', right: 'R1' }, { left: 'L2', right: 'R2' }] }) === 100);

  check('matching: plain strings with the key given as positions',
    scoreCorrect({ id: 'q', type: 'matching', marks: 2,
      left: ['Rules a person wrote', 'Learned from data'],
      right: ['Rule-based', 'Learning'],
      answer: [0, 1] }) === 100);

  check('matching: a key already in the shape the engine wants',
    scoreCorrect({ id: 'q', type: 'matching', marks: 2,
      left: [{ id: 'L1', text: 'a' }, { id: 'L2', text: 'b' }],
      right: [{ id: 'R1', text: 'x' }, { id: 'R2', text: 'y' }],
      answer: { L1: 'R1', L2: 'R2' } }) === 100);

  check('fillBlank: accepted answers authored per blank',
    scoreCorrect({ id: 'q', type: 'fillBlank', marks: 2,
      stem: 'This is a {{1}} system, because the logic came from a {{2}}.',
      blanks: [{ id: '1', answer: 'rule-based', acceptedAnswers: ['rule based'] },
               { id: '2', answer: 'person', acceptedAnswers: ['human'] }] }) === 100);

  check('fillBlank: a blank\u2019s label never leaks the answer', (function () {
    const q = { id: 'q', type: 'fillBlank', marks: 1,
      blanks: [{ id: '1', answer: 'rule-based', acceptedAnswers: [] }] };
    normalise(q);
    // The label is rendered as the input's placeholder.
    return q.blanks.every((label) => !/rule-based/.test(String(label)));
  })());

  check('an unresolvable key is left alone for the validator, not guessed at', (function () {
    const q = { id: 'q', type: 'mcq', marks: 1,
      options: ['Rule-based', 'Learning'], answer: 'something else entirely' };
    normalise(q);
    return q.answer === 'something else entirely';
  })());

  check('an open question is never rewritten', (function () {
    const q = { id: 'q', type: 'shortText', autoMarked: false,
      blanks: [{ id: '1', answer: 'x' }] };
    normalise(q);
    return q.blanks[0].answer === 'x';
  })());
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
