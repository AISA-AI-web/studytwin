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

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile,
`/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Built from curriculum/** by tools/build-content.js (\`npm run build\`).
 * Edit the JSON under curriculum/ and rebuild; changes made here are overwritten.
 *
 * Built: ${new Date().toISOString()}
 */

const CURRICULUM = ${JSON.stringify(curriculum, null, 2)};

/** Official ADEK framework catalogue — strand descriptors per grade per tier. */
const FRAMEWORK = ${JSON.stringify(framework, null, 2)};

/** Published week-by-week Main Course and Bridging sequences. */
const SEQUENCES = ${JSON.stringify(sequences, null, 2)};
`);

const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`  framework: ${Object.keys(framework.grades).length} grades, ` +
  `${Object.values(framework.grades).reduce((n, g) => n + Object.keys(g).length * 3, 0)} descriptors`);
console.log(`\nWrote ${path.relative(root, outFile)} (${kb} KB)`);
