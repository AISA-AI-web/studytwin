#!/usr/bin/env node
/**
 * Validates curriculum JSON before it is built or pushed.
 *
 * Authoring errors here are expensive: a question whose answer key points at a
 * deleted option marks every student wrong, and nobody notices until a parent
 * asks. These checks run in `npm run push` so a broken lesson cannot reach
 * students.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const curriculumDir = path.join(root, 'curriculum');

const TYPES = ['mcq', 'truefalse', 'multi', 'matching', 'ordering', 'numeric', 'shortText', 'fillBlank'];
const errors = [];
const warnings = [];

function err(where, message) { errors.push(`${where}: ${message}`); }
function warn(where, message) { warnings.push(`${where}: ${message}`); }

function validateQuestion(q, where, standardCodes) {
  if (!q.id) return err(where, 'question has no "id"');
  const at = `${where} → ${q.id}`;

  if (!TYPES.includes(q.type)) {
    err(at, `unknown type "${q.type}" (expected one of ${TYPES.join(', ')})`);
  }
  if (typeof q.marks !== 'number' || q.marks <= 0) {
    err(at, '"marks" must be a positive number');
  }
  if (!q.prompt) err(at, 'missing "prompt"');

  (q.standards || []).forEach((code) => {
    if (!standardCodes.has(code)) err(at, `references unknown standard "${code}"`);
  });
  if (!q.standards || q.standards.length === 0) {
    warn(at, 'not tagged with any standard — it will not count toward attainment');
  }

  const optionIds = new Set((q.options || []).map((o) => String(o.id)));

  switch (q.type) {
    case 'mcq':
      if (!q.options || q.options.length < 2) err(at, 'mcq needs at least two options');
      if (!optionIds.has(String(q.answer))) err(at, `answer "${q.answer}" is not one of the options`);
      break;

    case 'truefalse':
      if (typeof q.answer !== 'boolean') err(at, 'truefalse answer must be true or false');
      break;

    case 'multi':
      if (!Array.isArray(q.answer) || q.answer.length === 0) {
        err(at, 'multi answer must be a non-empty array');
      } else {
        q.answer.forEach((a) => {
          if (!optionIds.has(String(a))) err(at, `answer "${a}" is not one of the options`);
        });
      }
      break;

    case 'matching': {
      const leftIds = new Set((q.left || []).map((o) => String(o.id)));
      const rightIds = new Set((q.right || []).map((o) => String(o.id)));
      if (!leftIds.size || !rightIds.size) err(at, 'matching needs both "left" and "right" items');
      Object.entries(q.answer || {}).forEach(([l, r]) => {
        if (!leftIds.has(String(l))) err(at, `answer key references unknown left item "${l}"`);
        if (!rightIds.has(String(r))) err(at, `answer key references unknown right item "${r}"`);
      });
      if (Object.keys(q.answer || {}).length !== leftIds.size) {
        err(at, 'every left item needs an entry in the answer key');
      }
      break;
    }

    case 'ordering': {
      const itemIds = new Set((q.items || []).map((o) => String(o.id)));
      if (!Array.isArray(q.answer) || q.answer.length !== itemIds.size) {
        err(at, 'ordering answer must list every item exactly once');
      } else {
        q.answer.forEach((a) => {
          if (!itemIds.has(String(a))) err(at, `answer references unknown item "${a}"`);
        });
      }
      break;
    }

    case 'numeric':
      if (typeof q.answer !== 'number') err(at, 'numeric answer must be a number');
      break;

    case 'shortText':
      if (!q.acceptedAnswers?.length && !q.keywordsAll?.length && !q.keywordsAny?.length) {
        err(at, 'shortText needs acceptedAnswers, keywordsAll or keywordsAny to be auto-markable');
      }
      if (q.keywordsAny?.length && !q.keywordsNeeded) {
        warn(at, 'keywordsAny without keywordsNeeded — defaults to needing 1');
      }
      if (!q.modelAnswer) warn(at, 'no modelAnswer — students see the keyword list instead');
      break;

    case 'fillBlank':
      if (!Array.isArray(q.answer) || q.answer.length === 0) {
        err(at, 'fillBlank answer must be an array, one entry per blank');
      }
      if ((q.blanks || []).length !== (q.answer || []).length) {
        err(at, `"blanks" (${(q.blanks || []).length}) and "answer" (${(q.answer || []).length}) must be the same length`);
      }
      break;
  }
}

function validateGrade(gradeName) {
  const gradeDir = path.join(curriculumDir, gradeName);
  const course = JSON.parse(fs.readFileSync(path.join(gradeDir, 'course.json'), 'utf8'));
  const standards = JSON.parse(fs.readFileSync(path.join(gradeDir, 'standards.json'), 'utf8'));
  const standardCodes = new Set(standards.map((s) => s.code));

  const seenCodes = new Set();
  standards.forEach((s) => {
    if (!s.code) err(gradeName, 'a standard has no "code"');
    if (seenCodes.has(s.code)) err(gradeName, `duplicate standard code "${s.code}"`);
    seenCodes.add(s.code);
    if (!s.descriptor) warn(`${gradeName} → ${s.code}`, 'no descriptor');
  });

  const lessonsDir = path.join(gradeDir, 'lessons');
  const lessons = {};
  if (fs.existsSync(lessonsDir)) {
    fs.readdirSync(lessonsDir).filter((f) => f.endsWith('.json')).forEach((file) => {
      const lesson = JSON.parse(fs.readFileSync(path.join(lessonsDir, file), 'utf8'));
      const where = `${gradeName}/${file}`;

      if (!lesson.id) return err(where, 'lesson has no "id"');
      if (lessons[lesson.id]) err(where, `duplicate lesson id "${lesson.id}"`);
      lessons[lesson.id] = lesson;

      if (!lesson.title) err(where, 'lesson has no "title"');
      if (!['core', 'lab'].includes(lesson.type)) {
        err(where, `type must be "core" or "lab", got "${lesson.type}"`);
      }

      const seenQ = new Set();
      ((lesson.worksheet && lesson.worksheet.questions) || []).forEach((q) => {
        if (seenQ.has(q.id)) err(where, `duplicate question id "${q.id}"`);
        seenQ.add(q.id);
        validateQuestion(q, where, standardCodes);
      });

      if (!lesson.worksheet || !(lesson.worksheet.questions || []).length) {
        warn(where, 'no worksheet questions — this lesson cannot contribute to attainment');
      }
    });
  }

  // Standards coverage. A standard with no question assessing it can never be
  // reported on, which is the whole point of the platform — so surface it loudly.
  const assessed = new Set();
  Object.values(lessons).forEach((lesson) => {
    ((lesson.worksheet && lesson.worksheet.questions) || []).forEach((q) => {
      (q.standards || []).forEach((code) => assessed.add(code));
    });
  });
  const uncovered = [...standardCodes].filter((code) => !assessed.has(code));
  if (uncovered.length) {
    warn(gradeName,
      `${uncovered.length} standard(s) have no worksheet question and cannot be ` +
      `reported on: ${uncovered.join(', ')}`);
  }
  console.log(`  ${gradeName}: ${assessed.size}/${standardCodes.size} standards assessed ` +
    `across ${Object.keys(lessons).length} lesson(s)`);

  // Every lesson referenced by a unit must exist, and vice versa.
  const referenced = new Set();
  (course.units || []).forEach((unit) => {
    (unit.lessons || []).forEach((id) => {
      referenced.add(id);
      if (!lessons[id]) err(`${gradeName}/course.json`, `unit "${unit.id}" references missing lesson "${id}"`);
    });
  });
  Object.keys(lessons).forEach((id) => {
    if (!referenced.has(id)) warn(gradeName, `lesson "${id}" exists but no unit lists it — students will not see it`);
  });
}

fs.readdirSync(curriculumDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^grade\d+$/.test(e.name))
  .forEach((e) => validateGrade(e.name));

warnings.forEach((w) => console.log(`  warn  ${w}`));
errors.forEach((e) => console.error(`  ERROR ${e}`));

if (errors.length) {
  console.error(`\n${errors.length} error(s). Fix these before pushing.`);
  process.exit(1);
}
console.log(`\nContent valid${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
