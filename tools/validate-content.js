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
const STRANDS = ['CU', 'SD', 'CE', 'GE'];
const TIER_LETTERS = { E: 'emerging', P: 'proficient', A: 'advanced' };

/** The official catalogue. Every question's frameworkRef is checked against it. */
/**
 * The real marking engine, loaded so answer keys can be round-tripped through it.
 *
 * Checking a key's *shape* is not enough: a key can be perfectly well-formed and still
 * score zero, because the engine reads it differently from how it was written. That is
 * silent — the worksheet submits, a score appears, and the score is wrong. The only
 * check that catches it is running the key through the engine that will mark it.
 */
const vm = require('vm');
const engine = { console, JSON, Math, Number, String, Object, Array, isNaN, isFinite, Date };
engine.globalThis = engine;
vm.createContext(engine);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src/Marking.gs'), 'utf8'),
                engine, { filename: 'src/Marking.gs' });
const markWorksheet = vm.runInContext('markWorksheet_', engine);

const framework = JSON.parse(
  fs.readFileSync(path.join(curriculumDir, 'framework', 'standards.json'), 'utf8'));
const errors = [];
const warnings = [];

function err(where, message) { errors.push(`${where}: ${message}`); }
function warn(where, message) { warnings.push(`${where}: ${message}`); }

function validateQuestion(q, where) {
  if (!q.id) return err(where, 'question has no "id"');
  const at = `${where} → ${q.id}`;

  if (!TYPES.includes(q.type)) {
    err(at, `unknown type "${q.type}" (expected one of ${TYPES.join(', ')})`);
  }
  if (!q.prompt) err(at, 'missing "prompt"');

  // An open response is captured as evidence, never scored, so it carries no
  // marks and no answer key. Everything below this point is about scoring.
  if (q.autoMarked === false) {
    if (q.marks) err(at, 'autoMarked:false questions must not carry marks — they are evidence, not score');
    if (!q.lookFor) warn(at, 'no lookFor — the teacher sees the response with no guidance beside it');
    if (!['shortText', 'fillBlank'].includes(q.type)) {
      warn(at, `type "${q.type}" is unusual for an open response; shortText or fillBlank is typical`);
    }
    return;
  }

  if (typeof q.marks !== 'number' || q.marks <= 0) {
    err(at, '"marks" must be a positive number');
  }

  const refs = q.frameworkRefs || [];
  if (!refs.length) {
    warn(at, 'no frameworkRefs — this item evidences no strand and a teacher will not see it ' +
             'when judging');
  }
  refs.forEach((ref) => {
    if (STRANDS.indexOf(ref.strand) === -1) {
      return err(at, `strand "${ref.strand}" is not one of ${STRANDS.join(', ')}`);
    }
    const tier = TIER_LETTERS[ref.tier];
    if (!tier) return err(at, `tier "${ref.tier}" is not E, P or A`);

    const gradeEntry = framework.grades['grade' + ref.grade];
    if (!gradeEntry) return err(at, `no framework entry for grade ${ref.grade}`);
    const strandEntry = gradeEntry[ref.strand];
    if (!strandEntry) {
      return err(at, `the framework defines no ${ref.strand} strand at grade ${ref.grade}`);
    }
    const expected = strandEntry.tiers[tier].code;
    if (ref.code !== expected) {
      err(at, `code "${ref.code}" does not match the framework, which has "${expected}"`);
    }
  });

  // An item may only ever probe toward a tier; it can never award one.
  if (q.tierProbed && !['emerging', 'proficient', 'advanced'].includes(q.tierProbed)) {
    err(at, `tierProbed "${q.tierProbed}" is not a framework tier`);
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

/**
 * What the BROWSER would submit for a student who knew everything.
 *
 * It matters that this is built the way App.html builds it, not by echoing the answer
 * key back. Echoing the key passes trivially — including for a key the engine cannot
 * read — because both sides are then the same object. The bug that motivated this check
 * did exactly that: a matching key written as a list of {left, right} pairs round-trips
 * against itself perfectly and scores every real student zero, because the browser sends
 * a flat {leftId: rightId} map and the engine looks the key up by left id.
 *
 * So each branch below mirrors a branch of collectAnswers() in App.html, and reads the
 * key the same way the marker will.
 */
function perfectResponse(q) {
  switch (q.type) {
    // A radio's value is always a string, whatever the key holds.
    case 'mcq': case 'truefalse': case 'numeric': return String(q.answer);

    case 'multi': return (q.answer || []).map(String);

    // The order the student left the list in, which for a correct answer is the key's.
    case 'ordering': return (q.answer || []).map(String);

    // One <select> per left item; its value is the chosen right id.
    case 'matching': {
      const key = q.answer || {};
      const response = {};
      (q.left || []).forEach((l) => { response[String(l.id)] = String(key[l.id]); });
      return response;
    }

    case 'fillBlank':
      return (q.answer || []).map((a) => String(Array.isArray(a) ? a[0] : a).trim());

    case 'shortText':
      // Whatever the mark scheme actually accepts, in the order it prefers.
      if (q.acceptedAnswers?.length) return String(q.acceptedAnswers[0]);
      if (q.keywordsAll?.length) return q.keywordsAll.join(' ');
      if (q.keywordsAny?.length) return q.keywordsAny.slice(0, q.keywordsNeeded || 1).join(' ');
      return q.modelAnswer || '';

    default: return null;
  }
}

/**
 * Marks each question twice: once with the key, once with nothing.
 *
 * A key that cannot score full marks is broken however well-formed it looks, and a
 * question that awards full marks for an empty answer is worse than no question.
 */
function markableCheck(lesson, where) {
  const questions = ((lesson.worksheet && lesson.worksheet.questions) || [])
    .filter((q) => q.autoMarked !== false);
  if (!questions.length) return;

  questions.forEach((q) => {
    const at = `${where} → ${q.id}`;
    const sheet = { questions: [q] };

    let full, empty;
    try {
      full = markWorksheet(sheet, { [q.id]: perfectResponse(q) });
      empty = markWorksheet(sheet, {});
    } catch (e) {
      return err(at, `the marking engine threw on this question: ${e.message}`);
    }

    if (full.marksAwarded !== full.marksAvailable) {
      err(at, `the answer key itself scores ${full.marksAwarded}/${full.marksAvailable} — ` +
              'a student giving the correct answer would be marked down');
    }
    if (empty.marksAwarded > 0) {
      err(at, `an empty answer scores ${empty.marksAwarded}/${empty.marksAvailable}`);
    }

    // Every spelling an author listed as acceptable must actually be accepted. An entry
    // that does not score is worse than not listing it: it reads as covered, and the
    // child it was written for is still marked wrong with nobody to appeal to.
    if (q.type === 'fillBlank' && Array.isArray(q.answer)) {
      q.answer.forEach((blank, i) => {
        const accepted = Array.isArray(blank) ? blank : [blank];
        accepted.forEach((variant) => {
          const response = q.answer.map((b, j) =>
            j === i ? String(variant) : String(Array.isArray(b) ? b[0] : b));
          const scored = markWorksheet(sheet, { [q.id]: response });
          if (scored.marksAwarded !== scored.marksAvailable) {
            err(at, `blank ${i + 1} lists "${variant}" as accepted, but answering with ` +
                    'it does not score full marks');
          }
        });
      });
    }

    if (q.type === 'shortText') {
      (q.acceptedAnswers || []).forEach((variant) => {
        const scored = markWorksheet(sheet, { [q.id]: String(variant) });
        if (scored.marksAwarded !== scored.marksAvailable) {
          err(at, `"${variant}" is listed as an accepted answer but does not score`);
        }
      });
    }
  });
}

function validateGrade(gradeName) {
  const gradeDir = path.join(curriculumDir, gradeName);
  const course = JSON.parse(fs.readFileSync(path.join(gradeDir, 'course.json'), 'utf8'));
  const gradeStrands = framework.grades[gradeName];
  if (!gradeStrands) {
    err(gradeName, 'the framework catalogue has no entry for this grade');
    return;
  }
  const standardCodes = new Set();

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
        validateQuestion(q, where);
      });

      if (!lesson.worksheet || !(lesson.worksheet.questions || []).length) {
        warn(where, 'no worksheet questions — this lesson cannot contribute to attainment');
      }

      markableCheck(lesson, where);
    });
  }

  // Standards coverage. A standard with no question assessing it can never be
  // reported on, which is the whole point of the platform — so surface it loudly.
  // Auto-marked only. An open question's tags used to count here, so the warning below
  // could stay silent while every item on the strand was one no machine ever scores —
  // which is precisely the state it exists to catch.
  const touched = new Set();
  const perStrand = {};
  STRANDS.forEach((code) => { perStrand[code] = 0; });
  Object.values(lessons).forEach((lesson) => {
    ((lesson.worksheet && lesson.worksheet.questions) || []).forEach((q) => {
      if (q.autoMarked === false) return;
      (q.frameworkRefs || []).forEach((ref) => {
        if (perStrand[ref.strand] !== undefined) perStrand[ref.strand]++;
        touched.add(ref.strand);
      });
    });
  });
  // CONFIG.SUGGESTION_MIN_ITEMS. Below this the platform proposes nothing for the strand,
  // so a term's teaching produces no level for it — worse than a visibly empty strand,
  // because the lessons look covered.
  const MIN_ITEMS = 3;
  STRANDS.filter((code) => perStrand[code] > 0 && perStrand[code] < MIN_ITEMS).forEach((code) => {
    warn(gradeName, `only ${perStrand[code]} auto-marked item(s) bear on ${code} — below the ` +
      `${MIN_ITEMS} the platform needs before it will propose a level, so ${code} would get ` +
      'no proposal all term');
  });

  const untouched = STRANDS.filter((s) => !touched.has(s));
  if (untouched.length) {
    warn(gradeName,
      `no auto-marked item bears on ${untouched.join(', ')} — a teacher judging ` +
      `${untouched.length === 1 ? 'that strand' : 'those strands'} will see no product evidence`);
  }
  console.log(`  ${gradeName}: product evidence for ${touched.size}/${STRANDS.length} strands ` +
    `across ${Object.keys(lessons).length} lesson(s) ` +
    `(${STRANDS.map((c) => `${c} ${perStrand[c]}`).join(', ')})`);

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
