#!/usr/bin/env node
/**
 * Compiles the curriculum JSON into an Apps Script source file.
 *
 * Apps Script projects can only contain .gs and .html files, so the lessons
 * cannot simply be shipped as .json. Rather than force authors to write lessons
 * as code, the JSON under curriculum/ stays the source of truth and this script
 * wraps it. Run via `npm run build`; the output is gitignored and regenerated.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const curriculumDir = path.join(root, 'curriculum');
const outFile = path.join(root, 'src', 'generated', 'CurriculumData.gs');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Could not parse ${path.relative(root, file)}: ${err.message}`);
  }
}

function buildGrade(gradeDir) {
  const course = readJson(path.join(gradeDir, 'course.json'));

  const lessonsDir = path.join(gradeDir, 'lessons');
  const lessons = {};
  if (fs.existsSync(lessonsDir)) {
    fs.readdirSync(lessonsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .forEach((file) => {
        const lesson = readJson(path.join(lessonsDir, file));
        if (!lesson.id) throw new Error(`${file} has no "id"`);
        lessons[lesson.id] = lesson;
      });
  }

  return { meta: course.meta, units: course.units || [], lessons };
}

/**
 * The official framework catalogue, extracted from ADEK's published Scope &
 * Sequence by tools/extract-scope-sequence.js. It is compiled in alongside the
 * lessons so the app can show a teacher the exact Emerging/Proficient/Advanced
 * descriptors at the point of judgement — which is what the packs say makes two
 * teachers reach the same level.
 */
const frameworkFile = path.join(curriculumDir, 'framework', 'standards.json');
if (!fs.existsSync(frameworkFile)) {
  console.error('curriculum/framework/standards.json is missing. Run:\n' +
                '  node tools/extract-scope-sequence.js');
  process.exit(1);
}
const framework = readJson(frameworkFile);

const sequencesFile = path.join(curriculumDir, 'framework', 'sequences.json');
const sequences = fs.existsSync(sequencesFile) ? readJson(sequencesFile) : {};

const curriculum = {};
const grades = fs.readdirSync(curriculumDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^grade\d+$/.test(e.name))
  .map((e) => e.name)
  .sort();

if (grades.length === 0) {
  console.error('No grade folders found under curriculum/. Expected e.g. curriculum/grade6/');
  process.exit(1);
}

for (const grade of grades) {
  curriculum[grade] = buildGrade(path.join(curriculumDir, grade));
  const lessonCount = Object.keys(curriculum[grade].lessons).length;
  console.log(`  ${grade}: ${lessonCount} lesson(s)`);
}

/**
 * Ship only the grades this deployment actually needs.
 *
 * The full catalogue covers KG to Grade 12 and the sequences cover Grades 1-12. A school
 * running Grade 6 needs Grade 6 plus the prior grades its Bridging weeks reference - for
 * Grade 6 that is Grades 4 and 5, since Bridging rebuilds the previous grade's Advanced
 * bar and Critical Evaluation reaches back to Grade 4.
 *
 * Carrying the rest inflated the deployable bundle from roughly 90 KB to 242 KB, which
 * is the difference between a paste that works and one that silently truncates.
 */
function gradesNeeded() {
  const needed = new Set(Object.keys(curriculum));
  Object.keys(curriculum).forEach((gradeKey) => {
    const bridging = (sequences[gradeKey] || {}).bridging || [];
    bridging.forEach((week) => {
      (week.frameworkRefs || []).forEach((ref) => {
        const m = /AIF\u00B7[A-Z]{2}\u00B7G(\d+)\u00B7[EPA]/.exec(ref);
        if (m) needed.add('grade' + m[1]);
      });
    });
  });
  return needed;
}

const keep = gradesNeeded();
const trimmedFramework = {
  ...framework,
  grades: Object.fromEntries(
    Object.entries(framework.grades).filter(([g]) => keep.has(g)))
};
const trimmedSequences = Object.fromEntries(
  Object.entries(sequences).filter(([g]) => curriculum[g]));

fs.mkdirSync(path.dirname(outFile), { recursive: true });

/*
 * The curriculum is emitted in CHUNKS, each returned by its own function.
 *
 * A deployment without a terminal is made by pasting files into the Apps Script editor,
 * and a large paste truncates silently — the resulting parse error points at a line that
 * is perfectly fine, because the parser simply ran out of text. The real Grade 6 pack is
 * around 240 KB, far past the size where that starts happening.
 *
 * Splitting it means the pieces must be reassembled, and Apps Script gives no guarantee
 * about the order it concatenates files in. A top-level `const` referring to another
 * file's data is therefore unsafe. Function declarations are not: once concatenated they
 * are all hoisted, so a function that CALLS them at runtime works whatever the order.
 * Hence getCurriculum_(), which merges the chunks on first use and caches the result.
 */
const CHUNK_TARGET_BYTES = 55 * 1024;

function chunkLessons(allGrades) {
  const chunks = [];
  let current = {};
  let size = 0;

  Object.entries(allGrades).forEach(([gradeKey, course]) => {
    Object.entries(course.lessons || {}).forEach(([id, lesson]) => {
      const json = JSON.stringify(lesson);
      if (size > 0 && size + json.length > CHUNK_TARGET_BYTES) {
        chunks.push(current); current = {}; size = 0;
      }
      current[gradeKey] = current[gradeKey] || {};
      current[gradeKey][id] = lesson;
      size += json.length;
    });
  });
  if (size > 0) chunks.push(current);
  return chunks;
}

// Course shells without their lessons — small, and needed before anything else.
const shells = {};
Object.entries(curriculum).forEach(([gradeKey, course]) => {
  shells[gradeKey] = { meta: course.meta, units: course.units, lessons: {} };
});

const chunks = chunkLessons(curriculum);

const manifest = [];
Object.entries(curriculum).forEach(([gradeKey, course]) => {
  Object.values(course.lessons || {}).forEach((lesson) => {
    manifest.push({ id: lesson.id, grade: gradeKey, provisional: lesson.provisional === true });
  });
});

const header = (name) => `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Built from curriculum/** by tools/build-content.js (\`npm run build\`).
 * Edit the JSON under curriculum/ and rebuild; changes made here are overwritten.
 *
 * ${name}
 * Built: ${new Date().toISOString()}
 */
`;

// Part 0: course shells, the framework, the sequences and the assembler.
let core = header('Settings, framework and curriculum index.') + `
const CURRICULUM_SHELLS = ${JSON.stringify(shells)};

/** Official ADEK framework catalogue — strand descriptors per grade per tier. */
const FRAMEWORK = ${JSON.stringify(trimmedFramework)};

/** Published week-by-week Main Course and Bridging sequences. */
const SEQUENCES = ${JSON.stringify(trimmedSequences)};

/** Every lesson shipped, and whether it is placeholder content. */
const CURRICULUM_MANIFEST = ${JSON.stringify(manifest)};

/** How many lesson chunks to expect. */
const CURRICULUM_CHUNKS = ${chunks.length};

var CURRICULUM_CACHE_ = null;

/**
 * The full curriculum, assembled from its chunks on first use.
 *
 * Called at runtime rather than evaluated at load, so it does not depend on the order
 * Apps Script concatenates files in.
 */
function getCurriculum_() {
  if (CURRICULUM_CACHE_) return CURRICULUM_CACHE_;

  const out = JSON.parse(JSON.stringify(CURRICULUM_SHELLS));
  for (let i = 1; i <= CURRICULUM_CHUNKS; i++) {
    const fn = globalThis['curriculumChunk' + i + '_'];
    if (typeof fn !== 'function') {
      throw new Error('CURRICULUM_CHUNK_MISSING_' + i);
    }
    const part = fn();
    Object.keys(part).forEach(function (gradeKey) {
      if (!out[gradeKey]) out[gradeKey] = { lessons: {} };
      Object.keys(part[gradeKey]).forEach(function (id) {
        out[gradeKey].lessons[id] = part[gradeKey][id];
      });
    });
  }
  CURRICULUM_CACHE_ = out;
  return out;
}
`;
fs.writeFileSync(outFile, core);

chunks.forEach((chunk, i) => {
  const n = i + 1;
  const file = path.join(path.dirname(outFile), `CurriculumChunk${n}.gs`);
  fs.writeFileSync(file,
    header(`Lesson chunk ${n} of ${chunks.length}.`) +
    `\nfunction curriculumChunk${n}_() {\n  return ${JSON.stringify(chunk)};\n}\n`);
});

const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`  framework: ${Object.keys(trimmedFramework.grades).length} of ` +
  `${Object.keys(framework.grades).length} grades shipped ` +
  `(${[...keep].sort().join(', ')}) — the rest are not needed by this deployment`);
const written = [outFile].concat(chunks.map((_, i) =>
  path.join(path.dirname(outFile), `CurriculumChunk${i + 1}.gs`)));
console.log('');
written.forEach((f) => {
  console.log(`  ${path.relative(root, f).padEnd(46)} ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
});
const largest = Math.max(...written.map((f) => Math.round(fs.statSync(f).size / 1024)));
console.log(`\n${written.length} generated file(s); largest ${largest} KB ` +
  `(kept well under the size where a browser paste truncates)`);
