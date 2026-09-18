#!/usr/bin/env node
/**
 * Assembles the extracted Grade 6 lessons into curriculum/grade6/.
 *
 * Input is two verification passes: the weeks that came back clean first time, and the
 * repaired weeks. Everything here is normalisation and checking — no content is authored.
 * Anything that cannot be normalised is reported and the run fails, rather than being
 * quietly written into a lesson a child will sit.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SP = '/tmp/claude-0/-home-user-studytwin/1e6d0d27-d31e-505c-8298-fa6c0b87f20b/scratchpad';
const outDir = path.join(root, 'curriculum/grade6/lessons');

/*
 * Both inputs come from the STRICT extraction rules. The original pass is deliberately
 * not used: one of the weeks it marked clean turned out to have twelve fabricated
 * questions where the published worksheet has five, so its verdicts cannot be relied on.
 */
const repaired = JSON.parse(fs.readFileSync(`${SP}/repair.json`, 'utf8'));   // 9 weeks
const strict = JSON.parse(fs.readFileSync(`${SP}/strict.json`, 'utf8'));     // the other 7

const problems = [];

/** Strand labels vary by grade; the two-letter code is the stable identity. */
const STRAND_BY_LABEL = {
  'ai conceptual understanding': 'CU',
  'ai solution design & development': 'SD',
  'ai solution design and development': 'SD',
  'critical evaluation & informed interaction': 'CE',
  'critical evaluation and informed interaction': 'CE',
  'ethics & governance': 'GE',
  'ethics and governance': 'GE',
};
const ALL = ['CU', 'SD', 'CE', 'GE'];

function normaliseStrands(raw, where) {
  const out = [];
  (raw || []).forEach((value) => {
    const key = String(value).toLowerCase().trim();
    if (ALL.includes(String(value).toUpperCase())) { out.push(String(value).toUpperCase()); return; }
    if (/all four/.test(key)) { ALL.forEach((s) => out.push(s)); return; }
    const code = STRAND_BY_LABEL[key];
    if (code) { out.push(code); return; }
    problems.push(`${where}: unrecognised strand "${value}"`);
  });
  return [...new Set(out)];
}

/**
 * Production figure specs leaked into two student prompts in main W7 — layout
 * instructions for a designer, not lesson text. The verifier quoted both; strip the
 * added clauses and leave the published instruction.
 */
const PROMPT_FIXES = [
  { id: 'g6-main-w7-core-q2',
    cut: /\s*[-–—]\s*Plan A \(complete\).*?(?=$)/s },
  { id: 'g6-main-w7-lab-q2',
    cut: /\s*,\s*following the branch template.*?(?=$)/s },
];

/**
 * Assigns each section a ROLE, which is what the interface colour-codes on.
 *
 * Every lesson in the published pack follows the same shape and uses the same headings —
 * "I can…", "Words to know", "Let's try it", "Think about it", "My reflection" — in all
 * 32 Grade 6 lessons. Keying the design system to those conventions rather than to
 * per-lesson styling means any future grade extracted from the same pack format inherits
 * the identical treatment with no extra work.
 *
 * A section whose role cannot be determined falls back to `explain`, which is the plain
 * reading style. That degrades quietly rather than looking broken.
 */
const ROLE_BY_HEADING = [
  [/^i can/i, 'objectives'],
  [/words to know|key vocabulary|vocabulary/i, 'vocabulary'],
  [/let'?s try it|hands-on|have a go/i, 'activity'],
  [/think about it|talk about|discuss/i, 'discuss'],
  [/my reflection|reflect/i, 'reflect'],
];

function assignRole(section, index) {
  if (section.role) return;

  if (section.type === 'vocabulary') { section.role = 'vocabulary'; return; }
  if (section.type === 'activity') { section.role = 'activity'; return; }
  if (section.type === 'steps') { section.role = 'activity'; return; }
  if (section.type === 'callout') { section.role = 'important'; return; }
  if (section.type === 'diagram') { section.role = 'diagram'; return; }
  if (section.type === 'reference') { section.role = 'reference'; return; }

  const heading = String(section.heading || section.label || '');
  const match = ROLE_BY_HEADING.filter(function (pair) { return pair[0].test(heading); })[0];
  if (match) { section.role = match[1]; return; }

  // The opening paragraph, before any other section, sets up the lesson.
  section.role = index === 0 ? 'intro' : 'explain';
}

/**
 * Reconciles the field names the extraction used with the ones the platform reads.
 *
 * Some weeks wrote `instruction` rather than `prompt`, and some numbered questions bare
 * (`q1`) rather than scoped to their lesson. Neither changes meaning, but the platform
 * reads `prompt`, and an id that is unique only within its file is miserable to debug
 * once marks are sitting in a spreadsheet referring to it.
 */
function normaliseFields(question, lessonId) {
  if (!question.prompt && question.instruction) {
    question.prompt = question.instruction;
  }
  delete question.instruction;

  // A stem that merely repeats the prompt adds nothing on screen.
  if (question.stem) {
    const [firstLine, ...rest] = String(question.stem).split('\n');
    if (firstLine.trim() === String(question.prompt || '').trim()) {
      question.stem = rest.join('\n').trim();
      if (!question.stem) delete question.stem;
    }
  }

  if (!String(question.id).startsWith(lessonId)) {
    question.id = `${lessonId}-${question.id}`;
  }

  normaliseAnswerShape(question);
}

/**
 * Puts a question into the one shape the marking engine reads.
 *
 * Authors write choices and keys the way the source table reads — a plain list of
 * strings, an ordered list of {left, right} pairs, a key given as positions. The engine
 * wants ids, and looks keys up by id. Handed anything else it does not error: it awards
 * **zero to every student on every attempt**, silently, while the worksheet still submits
 * and still shows a score.
 *
 * So every readable shape is accepted here and converted once, rather than each author
 * having to know what markQuestion_ indexes by. Anything genuinely ambiguous is left
 * untouched so validate-content.js reports it, instead of being guessed at.
 */
function normaliseAnswerShape(question) {
  if (question.autoMarked === false) return;

  const ID_PREFIX = { options: '', items: 'i', left: 'L', right: 'R' };
  const original = {};

  // A plain list of strings becomes {id, text}. The original list is kept so a key
  // written as positions still resolves against it.
  ['options', 'items', 'left', 'right'].forEach((field) => {
    const list = question[field];
    if (!Array.isArray(list) || !list.length) return;
    original[field] = list.slice();
    if (list.every((entry) => entry && typeof entry === 'object')) return;
    if (!list.every((entry) => typeof entry === 'string')) return;

    question[field] = list.map((text, i) => ({
      id: field === 'options' ? String.fromCharCode(97 + i) : `${ID_PREFIX[field]}${i + 1}`,
      text
    }));
  });

  const idsOf = (field) => (question[field] || []).map((entry) => String(entry.id));

  /* Resolves one key entry to an id: an id already, a position, or an exact text. */
  const resolve = (field, value) => {
    const list = question[field] || [];
    if (!list.length) return undefined;

    const ids = idsOf(field);
    if (ids.includes(String(value))) return String(value);

    if (typeof value === 'number' && Number.isInteger(value) &&
        value >= 0 && value < list.length) {
      return String(list[value].id);
    }

    if (typeof value === 'string') {
      const byText = list.filter((entry) => String(entry.text).trim() === value.trim());
      if (byText.length === 1) return String(byText[0].id);
    }
    return undefined;
  };

  switch (question.type) {
    case 'mcq': {
      const id = resolve('options', question.answer);
      if (id !== undefined) question.answer = id;
      break;
    }

    case 'multi': {
      if (!Array.isArray(question.answer)) break;
      const ids = question.answer.map((v) => resolve('options', v));
      if (ids.every((id) => id !== undefined)) question.answer = ids;
      break;
    }

    case 'ordering': {
      if (!Array.isArray(question.answer)) break;
      const ids = question.answer.map((v) =>
        resolve('items', v && typeof v === 'object' ? (v.id ?? v.item) : v));
      if (ids.every((id) => id !== undefined)) question.answer = ids;
      break;
    }

    case 'matching': {
      if (!Array.isArray(question.answer)) break;
      const left = question.left || [];
      const map = {};
      let ok = left.length > 0;

      question.answer.forEach((entry, i) => {
        // Either an explicit pair, or the right-hand choice for left[i] by position.
        const pair = entry && typeof entry === 'object'
          ? { l: entry.left ?? entry.from ?? entry.l, r: entry.right ?? entry.to ?? entry.r }
          : { l: left[i] && left[i].id, r: entry };

        const l = resolve('left', pair.l);
        const r = resolve('right', pair.r);
        if (l === undefined || r === undefined) { ok = false; return; }
        map[l] = r;
      });

      if (ok && Object.keys(map).length === left.length) question.answer = map;
      break;
    }

    default: break;
  }

  // fillBlank is naturally authored per blank — {id, answer, acceptedAnswers} — which
  // keeps each blank's accepted spellings next to the blank they belong to. The engine
  // wants two parallel arrays. Split them here rather than making authors do it, since
  // getting the parallel arrays out of step is silent and marks the wrong blank.
  if (question.type === 'fillBlank' && Array.isArray(question.blanks) &&
      question.blanks.some((b) => b && typeof b === 'object')) {
    const labels = [];
    const answer = [];

    question.blanks.forEach((blank, i) => {
      if (!blank || typeof blank !== 'object') {
        labels.push(String(blank));
        answer.push((question.answer || [])[i] ?? '');
        return;
      }
      const accepted = (blank.acceptedAnswers || []).map(String);
      if (blank.answer !== undefined && !accepted.includes(String(blank.answer))) {
        accepted.unshift(String(blank.answer));
      }
      answer.push(accepted.length ? accepted : ['']);
      // The label becomes a placeholder in the box, so it must never be the answer.
      labels.push(String(blank.label ?? blank.hint ?? ''));
    });

    question.blanks = labels;
    question.answer = answer;
  }
}

/**
 * Collapses the many names the extraction used for an open task onto the one type the
 * platform has.
 *
 * Agents produced ten variants — open-response, short-answer, longText, table and so on —
 * all meaning the same thing: free text captured for a teacher to read. The platform has
 * one such type, shortText, and the distinction between a short and a long answer is
 * presentation, not behaviour.
 *
 * fillBlank is kept only where the question actually carries the blanks to render;
 * without them it is just free text wearing a different name.
 */
const OPEN_TYPES = new Set(['shorttext', 'short-answer', 'shortanswer', 'open-response',
  'openresponse', 'open', 'short', 'longtext', 'long-answer', 'longanswer', 'long',
  'table', 'log', 'text']);

function normaliseType(question, where) {
  if (question.autoMarked !== false) return;

  const type = String(question.type || '').toLowerCase();
  if (type === 'fillblank') {
    if ((question.blanks || []).length) return;   // genuinely a row of blanks
    question.type = 'shortText';
    return;
  }
  if (OPEN_TYPES.has(type)) { question.type = 'shortText'; return; }
  problems.push(`${where}: open question has unrecognised type "${question.type}"`);
}

function cleanPrompt(question) {
  const fix = PROMPT_FIXES.find((f) => f.id === question.id);
  if (!fix) return false;
  const before = question.prompt;
  question.prompt = before.replace(fix.cut, '').trim();
  return question.prompt !== before;
}

/* ------------------------------------------------------------------ */

const weeks = [];
repaired.extraction.forEach((w) => weeks.push({ key: w.key, lessons: w.lessons }));
strict.extraction.forEach((w) => weeks.push({ key: w.key, lessons: w.lessons }));

const expected = 16;
if (weeks.length !== expected) {
  problems.push(`expected ${expected} weeks, got ${weeks.length} — ` +
    `have both extraction passes completed?`);
}
const seen = new Set();
weeks.forEach((w) => {
  if (seen.has(w.key)) problems.push(`week ${w.key} appears twice`);
  seen.add(w.key);
});

const TRACK_ORDER = { bridging: 0, main: 1 };
weeks.sort((a, b) => {
  const [ta, wa] = [a.lessons[0].track, a.lessons[0].week];
  const [tb, wb] = [b.lessons[0].track, b.lessons[0].week];
  return TRACK_ORDER[ta] - TRACK_ORDER[tb] || wa - wb;
});

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const byTrack = { bridging: [], main: [] };
let promptsCleaned = 0;
let supplementsApplied = 0;

/* Content AISA has written to fill gaps in the published pack; see its own _readme. */
const supplementsPath = path.join(root, 'curriculum/grade6/supplements.json');
const supplements = fs.existsSync(supplementsPath)
  ? JSON.parse(fs.readFileSync(supplementsPath, 'utf8')) : {};

/* The pack's own formative block per lesson, verbatim; see its own _readme. */
const formativePath = path.join(root, 'curriculum/grade6/formative.json');
const formative = fs.existsSync(formativePath)
  ? JSON.parse(fs.readFileSync(formativePath, 'utf8')) : {};
let formativeApplied = 0;

/*
 * Auto-marked questions written to replace the pack's open response cells.
 *
 * AISA cannot staff teacher marking, so an open question in a worksheet is never
 * assessed at all — it counts in the denominator and can never score. These replace
 * them: the same reasoning demand, expressed in a form a machine can mark. See
 * docs/authoring-lessons.md for the conversion patterns.
 *
 * Substituted here rather than edited into the lesson files, because the lesson files
 * are regenerated by this script and anything written into them directly is lost on the
 * next run.
 */
const assessmentsPath = path.join(root, 'curriculum/grade6/assessments.json');
const assessments = fs.existsSync(assessmentsPath)
  ? JSON.parse(fs.readFileSync(assessmentsPath, 'utf8')) : {};
let lessonsReplaced = 0;

let openCount = 0;
let scoredCount = 0;

weeks.forEach((week) => {
  week.lessons.forEach((raw) => {
    const where = `${raw.track} W${raw.week} ${raw.type}`;

    let sections, worksheet;
    try { sections = JSON.parse(raw.sectionsJson); }
    catch (e) { problems.push(`${where}: sectionsJson is not valid JSON — ${e.message}`); return; }
    try { worksheet = JSON.parse(raw.worksheetJson); }
    catch (e) { problems.push(`${where}: worksheetJson is not valid JSON — ${e.message}`); return; }

    sections.forEach(assignRole);

    // The generated set replaces the extracted questions wholesale, rather than being
    // merged with them. Keeping both would leave every open question in place, scoring
    // nothing and dragging the strand's evidence down with it.
    const generated = assessments[raw.id];
    if (Array.isArray(generated) && generated.length) {
      worksheet.questions = JSON.parse(JSON.stringify(generated));
      lessonsReplaced++;
    }

    const strands = normaliseStrands(raw.strands, where);
    if (!strands.length) problems.push(`${where}: no strands resolved`);

    (worksheet.questions || []).forEach((q) => {
      normaliseFields(q, raw.id);
      if (cleanPrompt(q)) promptsCleaned++;
      normaliseType(q, `${where} ${q.id}`);

      // An open task must carry no marks; a scored one must carry a readable answer.
      if (q.autoMarked === false) {
        delete q.marks;
        openCount++;
      } else {
        scoredCount++;
        if (typeof q.marks !== 'number' || q.marks <= 0) {
          problems.push(`${where} ${q.id}: scored question has no positive marks`);
        }
        if (q.answer === undefined && !q.acceptedAnswers && !q.keywordsAny && !q.keywordsAll) {
          problems.push(`${where} ${q.id}: scored question has no answer key`);
        }
      }
      if (!(q.frameworkRefs || []).length) {
        problems.push(`${where} ${q.id}: no frameworkRefs`);
      }
      delete q.heading;   // not part of the schema; the prompt carries the block name
    });

    (supplements[raw.id] || []).forEach((add) => {
      const section = Object.assign({ authored: true }, add.section);
      assignRole(section, 99);
      if (add.insertAfter === 'start') { sections.unshift(section); supplementsApplied++; return; }
      // After the lesson's own opening, so a diagram never pre-empts the text that sets it up.
      if (add.insertAfter === 'intro') {
        const introAt = sections.findIndex((sec) => sec.role === 'intro');
        sections.splice(introAt === -1 ? 0 : introAt + 1, 0, section);
        supplementsApplied++;
        return;
      }
      const at = sections.findIndex((sec) =>
        String(sec.heading || sec.label || '').trim() === String(add.insertAfter).trim());
      if (at === -1) {
        problems.push(`${where}: supplement anchored to "${add.insertAfter}", ` +
          `which is not a heading in this lesson`);
        return;
      }
      sections.splice(at + 1, 0, section);
      supplementsApplied++;
    });

    const lesson = {
      id: raw.id,
      number: raw.number,
      week: raw.week,
      track: raw.track,
      type: raw.type,
      title: raw.title,
      summary: raw.summary,
      duration: raw.duration || '45 minutes',
      strands,
      objectives: raw.objectives || [],
      sections,
      worksheet,
    };

    // The pack prints these for every lesson and they are the closest thing it has to
    // a mark scheme students may see. successCriteria reaches them; the rest is teacher
    // planning language and stripAnswerKey_ keeps it server-side.
    if (formative[raw.id]) {
      lesson.formative = formative[raw.id];
      formativeApplied++;
    } else {
      problems.push(`${where}: no formative block — students see no success criteria`);
    }

    fs.writeFileSync(path.join(outDir, `${raw.id}.json`),
      JSON.stringify(lesson, null, 2) + '\n');
    byTrack[raw.track].push(lesson);
  });
});

['bridging', 'main'].forEach((t) => byTrack[t].sort((a, b) =>
  a.week - b.week || (a.type === 'core' ? 0 : 1) - (b.type === 'core' ? 0 : 1)));

// Renumber sequentially within each track, since the two passes numbered independently.
['bridging', 'main'].forEach((t) => byTrack[t].forEach((lesson, i) => {
  lesson.number = i + 1;
  fs.writeFileSync(path.join(outDir, `${lesson.id}.json`),
    JSON.stringify(lesson, null, 2) + '\n');
}));

/* The unit of delivery is the WEEK, which owns the strand and contains Core + Lab. */
function unitsFor(track, title, summary) {
  const byWeek = {};
  byTrack[track].forEach((l) => { (byWeek[l.week] = byWeek[l.week] || []).push(l); });
  return Object.keys(byWeek).map(Number).sort((a, b) => a - b).map((week) => ({
    id: `g6-${track}-w${week}`,
    track,
    week,
    title: `Week ${week}`,
    summary: byWeek[week].map((l) => l.title).join(' · '),
    lessons: byWeek[week].map((l) => l.id),
  }));
}

const course = {
  meta: {
    grade: 6,
    title: 'Grade 6 — AI Fluency',
    subtitle: 'ADEK AI Literacy Curriculum, Term 1',
    source: 'Grade 6 Curriculum and Sample Core Lesson (ADEK, published pack)',
    tracks: {
      bridging: { title: 'Bridging Program — Building Trustworthy AI',
                  summary: 'Six weeks rebuilding each strand to the prior grade’s Advanced bar before the Main Course begins.' },
      main: { title: 'Main Course — Rule-Based vs Learning Systems',
              summary: 'Ten weeks securing the Grade 6 Emerging outcomes across the four strands.' },
    },
  },
  units: [...unitsFor('bridging'), ...unitsFor('main')],
};
fs.writeFileSync(path.join(root, 'curriculum/grade6/course.json'),
  JSON.stringify(course, null, 2) + '\n');

console.log(`Weeks assembled : ${weeks.length}`);
console.log(`Lessons written : ${byTrack.bridging.length + byTrack.main.length} ` +
            `(${byTrack.bridging.length} bridging, ${byTrack.main.length} main)`);
console.log(`Questions       : ${openCount} open (teacher-read), ${scoredCount} auto-marked`);
console.log(`Formative block : ${formativeApplied}/32 lesson(s)`);
console.log(`Auto-marked set : ${lessonsReplaced}/32 lesson(s) replaced`);
const typeCounts = {};
fs.readdirSync(outDir).forEach((f) => {
  JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8')).worksheet.questions
    .forEach((q) => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
});
console.log(`Types           : ${Object.entries(typeCounts)
  .sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(', ')}`);
console.log(`Prompts cleaned : ${promptsCleaned} (figure-spec text removed)`);
console.log(`Supplements     : ${supplementsApplied} AISA-authored section(s) inserted`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  problems.slice(0, 25).forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nNo problems.');
