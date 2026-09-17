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

const pass1 = JSON.parse(fs.readFileSync(`${SP}/extraction.json`, 'utf8'));
const pass2 = JSON.parse(fs.readFileSync(`${SP}/repair.json`, 'utf8'));

const flaggedInPass1 = new Set(pass1.flagged.map((f) => f.week));
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

function cleanPrompt(question) {
  const fix = PROMPT_FIXES.find((f) => f.id === question.id);
  if (!fix) return false;
  const before = question.prompt;
  question.prompt = before.replace(fix.cut, '').trim();
  return question.prompt !== before;
}

/* ------------------------------------------------------------------ */

const weeks = [];
pass2.extraction.forEach((w) => weeks.push({ key: w.key, lessons: w.lessons, source: 'repaired' }));
pass1.extraction.forEach((w) => {
  const key = `${w.track} W${w.week}`;
  if (!flaggedInPass1.has(key)) weeks.push({ key, lessons: w.lessons, source: 'clean first pass' });
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

    const strands = normaliseStrands(raw.strands, where);
    if (!strands.length) problems.push(`${where}: no strands resolved`);

    (worksheet.questions || []).forEach((q) => {
      if (cleanPrompt(q)) promptsCleaned++;

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
console.log(`Prompts cleaned : ${promptsCleaned} (figure-spec text removed)`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  problems.slice(0, 25).forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nNo problems.');
