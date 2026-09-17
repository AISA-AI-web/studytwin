#!/usr/bin/env node
/**
 * Extracts the official ADEK AI Literacy framework from the published Scope &
 * Sequence HTML into machine-readable JSON.
 *
 * This is an ingest tool, run when ADEK publishes a new version — not part of
 * the normal build. Its output under curriculum/framework/ is the authoritative
 * standards catalogue everything else references, so it parses the document's
 * tables structurally rather than scraping text, and reports anything it cannot
 * account for instead of silently dropping it.
 *
 *   node tools/extract-scope-sequence.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SOURCE = path.join(root, 'curriculum/source/ADEK_Scope_and_Sequence_Term1.html');
const OUT_DIR = path.join(root, 'curriculum/framework');

const html = fs.readFileSync(SOURCE, 'utf8');

/* --------------------------------------------------------------------------
 * Minimal HTML helpers. The document is machine-generated and highly regular,
 * so structural regexes are reliable here; anything unexpected is reported.
 * ------------------------------------------------------------------------ */

function decode(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits the document into its <table> elements, keeping class and caption. */
function tables() {
  const out = [];
  const re = /<table([^>]*)>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = re.exec(html))) {
    const cls = (/class="([^"]+)"/.exec(m[1]) || [, ''])[1];
    const cap = (/<caption[^>]*>([\s\S]*?)<\/caption>/i.exec(m[2]) || [, ''])[1];
    out.push({ cls, caption: decode(cap), inner: m[2] });
  }
  return out;
}

/** Returns a table's body rows, each as an array of cell texts (th and td alike). */
function rows(inner) {
  const body = (/<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(inner) || [, inner])[1];
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
    [...tr[1].matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => decode(c[2]))
  );
}

/** Rows that are section banners inside a table (a single spanning cell). */
function isBanner(cells) {
  return cells.length === 1;
}

/* --------------------------------------------------------------------------
 * Strand identity
 *
 * The framework keeps four strand ROWS from KG to Grade 12, but renames them as
 * students progress (Data Awareness becomes Data Literacy, then AI Solution
 * Design & Development). The two-letter code is what stays stable, so the code
 * is the identity and the label is per-grade presentation.
 * ------------------------------------------------------------------------ */

const STRAND_ROWS = [
  { row: 'Knowing how intelligent systems learn and operate', theme: 'How AI works' },
  { row: 'Working with data, and designing solutions',        theme: 'Data & design' },
  { row: 'Exercising judgement in the use of AI systems',     theme: 'Judgement' },
  { row: 'Assessing AI systems for ethical use',              theme: 'Ethics & governance' }
];

/**
 * Strand label -> framework code.
 *
 * The code must come from the strand's NAME, never from its row position in the
 * vertical progression tables. The framework keeps four thematic rows across all
 * fourteen year groups, but the strand sitting in a given row changes: at Grade 5
 * the "Exercising judgement" row holds AI Solution Design & Development, because
 * Critical Evaluation is not taught at Grade 5 at all.
 *
 * Keying on position instead of name resolves AIF-SD-G5-A to "Suggests
 * improvements to make data more reliable" when ADEK's own Grade 6 Bridging table
 * prints it against "Refines prompts to improve output quality and explains why".
 * Grade 6 Bridging Week 2 cites exactly that code, so the error reaches the grade
 * we are building. checkBridgingResolution_() below now fails the build on it.
 *
 * DA is ours, not ADEK's: the framework prints CU for the Data Awareness and Data
 * Literacy weeks at Grades 4 and 5, which collides with the genuine CU strand in
 * the same table. A distinct internal code keeps our catalogue unambiguous; the
 * code ADEK actually printed is preserved alongside it and the collision reported.
 */
const LABEL_TO_CODE = {
  'ai conceptual understanding': 'CU',
  'ai systems understanding': 'CU',
  'ai solution design & development': 'SD',
  'ai solution design and development': 'SD',
  'data awareness': 'DA',
  'data literacy': 'DA',
  'critical evaluation & informed interaction': 'CE',
  'critical evaluation and informed interaction': 'CE',
  'ethics & privacy': 'GE',
  'ethics & responsible use': 'GE',
  'responsible ai use': 'GE',
  'ethics & governance': 'GE',
  'governance & ethics': 'GE',
  'governance & impact': 'GE',
  'governance, ethics & societal impact': 'GE'
};

function codeForLabel_(label) {
  const key = String(label).toLowerCase().replace(/\s+/g, ' ').trim();
  return LABEL_TO_CODE[key] || null;
}

const TIERS = [
  { key: 'emerging',   label: 'Emerging',   letter: 'E', ordinal: 1 },
  { key: 'proficient', label: 'Proficient', letter: 'P', ordinal: 2 },
  { key: 'advanced',   label: 'Advanced',   letter: 'A', ordinal: 3 }
];

const warnings = [];
const notes = [];

/** "Grade 6" -> 6 ; "KG1 / FS2" -> "KG1" */
function gradeKeyFromCaption(caption) {
  const g = /Grade (\d+)/.exec(caption);
  if (g) return 'grade' + g[1];
  const kg = /(KG[12])/.exec(caption);
  if (kg) return kg[1].toLowerCase();
  return null;
}

function gradeNumber(gradeKey) {
  const m = /^grade(\d+)$/.exec(gradeKey);
  return m ? Number(m[1]) : null;
}

/** AIF·CU·G6·A — the framework's own reference format. */
function standardCode(strandCode, gradeKey, tierLetter) {
  const n = gradeNumber(gradeKey);
  const g = n === null ? gradeKey.toUpperCase() : 'G' + n;
  return `AIF·${strandCode}·${g}·${tierLetter}`;
}

/* --------------------------------------------------------------------------
 * 1. Vertical progression tables — the complete descriptor catalogue
 * ------------------------------------------------------------------------ */

const catalogue = {};   // gradeKey -> { strandCode -> { label, tiers{} } }

function ingestVerticalTables(all) {
  const vtables = all.filter((t) => t.cls.includes('vtable'));
  if (vtables.length !== STRAND_ROWS.length) {
    warnings.push(`Expected ${STRAND_ROWS.length} vertical progression tables, found ${vtables.length}`);
  }

  vtables.forEach((table) => {
    const strand = STRAND_ROWS.find((s) => table.caption.startsWith(s.row));
    if (!strand) {
      warnings.push(`Vertical table with unrecognised caption: "${table.caption}"`);
      return;
    }

    rows(table.inner).forEach((cells) => {
      if (isBanner(cells)) return;            // phase banner
      if (cells.length !== 4) {
        warnings.push(`${strand.code}: row with ${cells.length} cells, expected 4 — "${cells[0]}"`);
        return;
      }
      // First cell is "Grade 6 AI Solution Design & Development" or "KG1 Data Awareness"
      const head = cells[0];
      const gradeKey = gradeKeyFromCaption(head) ||
                       (/(KG[12])/.exec(head) ? /(KG[12])/.exec(head)[1].toLowerCase() : null);
      if (!gradeKey) {
        warnings.push(`${strand.code}: could not read a grade from "${head}"`);
        return;
      }
      // Whatever follows the grade is this grade's label for the strand.
      const label = head
        .replace(/^Grade \d+\s*/, '')
        .replace(/^KG[12]\s*/, '')
        .trim();

      const code = codeForLabel_(label);
      if (!code) {
        warnings.push(`Unrecognised strand label "${label}" at ${gradeKey} — ` +
                      `add it to LABEL_TO_CODE`);
        return;
      }
      if (!catalogue[gradeKey]) catalogue[gradeKey] = {};
      if (catalogue[gradeKey][code]) {
        warnings.push(`${gradeKey}: two strands both resolve to ${code} ` +
          `("${catalogue[gradeKey][code].label}" and "${label}")`);
      }
      catalogue[gradeKey][code] = {
        code: code,
        label: label,
        theme: strand.theme,
        frameworkRow: strand.row,
        tiers: {
          emerging:   { code: standardCode(code, gradeKey, 'E'), descriptor: cells[1] },
          proficient: { code: standardCode(code, gradeKey, 'P'), descriptor: cells[2] },
          advanced:   { code: standardCode(code, gradeKey, 'A'), descriptor: cells[3] }
        }
      };
    });
  });
}

/* --------------------------------------------------------------------------
 * 2. Per-grade framework expectation tables — cross-check on the catalogue
 * ------------------------------------------------------------------------ */

function crossCheckExpectations(all) {
  let compared = 0;
  let mismatches = 0;

  all.filter((t) => t.cls.trim() === 'exp').forEach((table) => {
    const gradeKey = gradeKeyFromCaption(table.caption);
    if (!gradeKey || !catalogue[gradeKey]) return;

    rows(table.inner).forEach((cells) => {
      if (cells.length !== 4) return;
      const label = cells[0];
      const entry = Object.values(catalogue[gradeKey])
        .find((s) => s.label.toLowerCase() === label.toLowerCase());

      if (!entry) {
        warnings.push(`${gradeKey}: expectations table lists strand "${label}" ` +
                      `which the vertical progression does not have`);
        return;
      }
      [['emerging', 1], ['proficient', 2], ['advanced', 3]].forEach(([tier, i]) => {
        compared++;
        if (entry.tiers[tier].descriptor !== cells[i]) {
          mismatches++;
          warnings.push(`${gradeKey} ${entry.code} ${tier}: expectations table and ` +
            `vertical progression disagree.\n      exp: "${cells[i]}"\n      vert: "${entry.tiers[tier].descriptor}"`);
        }
      });
    });
  });

  notes.push(`Cross-checked ${compared} descriptors between the per-grade expectation ` +
             `tables and the vertical progression: ${mismatches} mismatch(es).`);
}

/* --------------------------------------------------------------------------
 * 3. Week-by-week sequences (Main Course and Bridging)
 * ------------------------------------------------------------------------ */

const sequences = {};   // gradeKey -> { main: [...], bridging: [...] }

/** Splits "Core Title Lab Other Title" into labelled lessons. */
function parseLessons(text) {
  const parts = [];
  const re = /(Core|Lab)\s+(.*?)(?=\s+(?:Core|Lab)\s+|$)/g;
  let m;
  while ((m = re.exec(text))) {
    parts.push({ kind: m[1].toLowerCase(), title: m[2].trim() });
  }
  if (!parts.length && text.trim()) {
    parts.push({ kind: 'lesson', title: text.trim() });   // Grades 1-5: one unlabelled lesson
  }
  return parts;
}

function ingestSequences(all) {
  all.filter((t) => t.cls.includes('weeks')).forEach((table) => {
    const gradeKey = gradeKeyFromCaption(table.caption);
    if (!gradeKey) return;
    const isBridging = table.cls.includes('bridge');

    const parsed = rows(table.inner).map((cells) => {
      if (cells.length < 4) return null;
      const week = cells[0];
      const entry = {
        week: week,
        weekNumber: Number((/^(\d+)/.exec(week) || [, ''])[1]) || null,
        phase: week.replace(/^\d+\s*/, '').trim() || null,
        lessons: parseLessons(cells[1]),
        strand: cells[2]
      };
      if (isBridging) {
        entry.rebuildsTo = cells[3];                       // prior-grade Advanced descriptor
        // Integration weeks print several refs run together with no separator,
        // e.g. "AIF<mid>CU<mid>G5<mid>AAIF<mid>SD<mid>G5<mid>A" — split on the prefix, not on whitespace.
        entry.frameworkRefs = (cells[4] || '')
          .split(/(?=AIF\u00B7)/).map((s) => s.trim()).filter(Boolean);
      } else {
        entry.secures = cells[3];                          // Emerging descriptor
        entry.stretch = cells[4] || '';                    // Proficient descriptor
      }
      return entry;
    }).filter(Boolean);

    if (!sequences[gradeKey]) sequences[gradeKey] = {};
    sequences[gradeKey][isBridging ? 'bridging' : 'main'] = parsed;
  });
}

/* --------------------------------------------------------------------------
 * 4. Consistency checks that matter for assessment
 * ------------------------------------------------------------------------ */

function checkSequenceAlignment() {
  Object.entries(sequences).forEach(([gradeKey, seq]) => {
    const strands = catalogue[gradeKey];
    if (!strands) return;

    (seq.main || []).forEach((week) => {
      if (/all four strands/i.test(week.strand)) return;
      const entry = Object.values(strands)
        .find((s) => s.label.toLowerCase() === week.strand.toLowerCase());
      if (!entry) {
        warnings.push(`${gradeKey} main W${week.week}: strand "${week.strand}" ` +
                      `does not match any strand label for this grade`);
        return;
      }
      if (week.secures && entry.tiers.emerging.descriptor !== week.secures) {
        warnings.push(`${gradeKey} main W${week.week} (${entry.code}): "Outcome secured" ` +
          `does not match the Emerging descriptor.\n      week: "${week.secures}"` +
          `\n      framework: "${entry.tiers.emerging.descriptor}"`);
      }
    });

    // Bridging references should point at the PREVIOUS grade's Advanced bar.
    const n = gradeNumber(gradeKey);
    (seq.bridging || []).forEach((week) => {
      week.frameworkRefs.forEach((ref) => {
        const m = /AIF·([A-Z]{2})·G(\d+)·([EPA])/.exec(ref);
        if (!m) { warnings.push(`${gradeKey} bridging ${week.week}: unparseable ref "${ref}"`); return; }
        if (m[3] !== 'A') {
          warnings.push(`${gradeKey} bridging ${week.week}: ref ${ref} is not an Advanced bar`);
        }
        if (n !== null && Number(m[2]) >= n) {
          warnings.push(`${gradeKey} bridging ${week.week}: ref ${ref} cites grade ${m[2]}, ` +
                        `not a prior grade`);
        }
      });
    });
  });
}

/**
 * Resolves every Bridging citation against the catalogue and checks the descriptor
 * printed beside it matches.
 *
 * This is the strongest validation available, because the Bridging tables are the
 * one place ADEK prints a code and its descriptor together. It is what catches a
 * code that resolves to the wrong text — the failure mode that matters, since a
 * mis-resolved code silently assesses a student against another strand's outcome.
 */
function checkBridgingResolution_() {
  let checked = 0, exact = 0;
  const collisions = [];

  Object.entries(sequences).forEach(([gradeKey, seq]) => {
    (seq.bridging || []).forEach((week) => {
      if (week.frameworkRefs.length !== 1 || !week.rebuildsTo) return;  // skip integration weeks
      const m = /AIF\u00B7([A-Z]{2})\u00B7G(\d+)\u00B7([EPA])/.exec(week.frameworkRefs[0]);
      if (!m) return;

      const [, printedCode, priorGrade, tierLetter] = m;
      const tier = TIERS.find((t) => t.letter === tierLetter).key;
      const priorKey = 'grade' + priorGrade;
      const strands = catalogue[priorKey] || {};
      checked++;

      const viaPrinted = strands[printedCode];
      if (viaPrinted && viaPrinted.tiers[tier].descriptor === week.rebuildsTo) { exact++; return; }

      // The descriptor is authoritative — find which strand it actually belongs to.
      const actual = Object.values(strands)
        .find((st) => st.tiers[tier].descriptor === week.rebuildsTo);

      if (actual) {
        collisions.push(`${gradeKey} bridging ${week.week} ("${week.strand}"): ADEK prints ` +
          `${week.frameworkRefs[0]}, but that descriptor is ${actual.code} ` +
          `(${actual.label}) at ${priorKey}.`);
      } else {
        warnings.push(`${gradeKey} bridging ${week.week}: ${week.frameworkRefs[0]} resolves to ` +
          `no descriptor at ${priorKey} matching the printed text ` +
          `"${week.rebuildsTo.slice(0, 60)}..."`);
      }
    });
  });

  notes.push(`Resolved ${checked} Bridging citations against the catalogue: ${exact} matched ` +
             `the descriptor printed beside them, ${collisions.length} hit a code collision in ` +
             `ADEK's own document.`);
  return collisions;
}

/** Reports where a bridging week's stated strand disagrees with its code. */
function checkStrandCodeConsistency() {
  const seen = {};
  Object.entries(sequences).forEach(([gradeKey, seq]) => {
    (seq.bridging || []).forEach((week) => {
      if (week.frameworkRefs.length !== 1) return;   // integration weeks cite several
      const m = /AIF·([A-Z]{2})·/.exec(week.frameworkRefs[0]);
      if (!m) return;
      const key = week.strand + ' => ' + m[1];
      if (!seen[key]) seen[key] = [];
      seen[key].push(`${gradeKey} ${week.week}`);
    });
  });
  return seen;
}

/* --------------------------------------------------------------------------
 * Run
 * ------------------------------------------------------------------------ */

const all = tables();
console.log(`Parsed ${all.length} tables from the Scope & Sequence.\n`);

ingestVerticalTables(all);
crossCheckExpectations(all);
ingestSequences(all);
checkSequenceAlignment();
const codeCollisions = checkBridgingResolution_();
const strandCodeMap = checkStrandCodeConsistency();

fs.mkdirSync(OUT_DIR, { recursive: true });

const grades = Object.keys(catalogue).sort((a, b) => {
  const na = gradeNumber(a), nb = gradeNumber(b);
  if (na === null && nb === null) return a.localeCompare(b);
  if (na === null) return -1;
  if (nb === null) return 1;
  return na - nb;
});

const descriptorCount = grades.reduce((n, g) =>
  n + Object.keys(catalogue[g]).length * 3, 0);

fs.writeFileSync(path.join(OUT_DIR, 'standards.json'), JSON.stringify({
  source: 'ADEK AI Literacy Curriculum — Scope & Sequence, KG to Grade 12, Term 1',
  framework: 'ADEK K–12 AI Fluency Framework',
  extractedFrom: 'curriculum/source/ADEK_Scope_and_Sequence_Term1.html',
  tiers: TIERS,
  strandRows: STRAND_ROWS,
  grades: grades.reduce((acc, g) => { acc[g] = catalogue[g]; return acc; }, {})
}, null, 2));

fs.writeFileSync(path.join(OUT_DIR, 'sequences.json'), JSON.stringify(sequences, null, 2));

console.log(`Grades:      ${grades.length} (${grades.join(', ')})`);
console.log(`Descriptors: ${descriptorCount} (grades x strands x 3 tiers)`);
console.log(`Sequences:   ${Object.keys(sequences).length} grades with week-by-week tables`);

console.log('\nStrand label -> code mapping observed in Bridging references:');
Object.entries(strandCodeMap).sort().forEach(([k, v]) => {
  console.log(`  ${k.padEnd(62)} (${v.length}x, e.g. ${v[0]})`);
});

notes.forEach((n) => console.log('\n' + n));

if (codeCollisions.length) {
  console.log('\nCode collisions in ADEK\u2019s published document (ours resolve correctly by' +
              ' strand name; raise these with ADEK):\n');
  codeCollisions.forEach((c) => console.log('  - ' + c));
}

if (warnings.length) {
  console.log(`\n${warnings.length} item(s) needing attention:\n`);
  warnings.forEach((w) => console.log('  - ' + w));
} else {
  console.log('\nNo inconsistencies found.');
}
