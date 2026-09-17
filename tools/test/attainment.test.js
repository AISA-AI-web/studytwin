#!/usr/bin/env node
/**
 * Tests the attainment model against ADEK's published decision rules.
 *
 * The published Final Assessments state each grade's overall-level rule and, for
 * Grade 6, work two tie-break cases explicitly. Those worked cases are the
 * highest-value tests in the repo: they are ADEK telling us the answer, so if our
 * implementation disagrees with them it is our implementation that is wrong.
 *
 * Also asserts the negative that matters most — that nothing here turns a
 * percentage into a level.
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
].forEach((f) => vm.runInContext(load(f), sandbox, { filename: f }));

const api = vm.runInContext(`({
  CONFIG, FRAMEWORK, LEVEL_ORDINAL,
  overallLevelFrom_, buildStrandProfile_, computeClassProfile_,
  worksheetEvidenceByStrand_, getStandardsIndex_, levelDef_
})`, sandbox);

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const L = (CU, SD, CE, GE) => ({ CU, SD, CE, GE });
const overall = (levels, grade) => api.overallLevelFrom_(levels, grade || 'grade6');

/* ---------------------------------------------------------------------------
 * Grade 6 — the rule and its two published tie-break cases
 * ------------------------------------------------------------------------- */

console.log('\nGrade 6 decision rule');

check('all four Advanced is Advanced',
  overall(L('advanced', 'advanced', 'advanced', 'advanced')).level === 'advanced');

check('three Advanced with one Proficient is Advanced',
  overall(L('advanced', 'advanced', 'advanced', 'proficient')).level === 'advanced');

// Published verbatim: "a student Advanced on two strands and Proficient on two is
// Proficient (Advanced needs three)."
check('PUBLISHED CASE: two Advanced + two Proficient is Proficient, not Advanced',
  overall(L('advanced', 'advanced', 'proficient', 'proficient')).level === 'proficient',
  `got ${overall(L('advanced', 'advanced', 'proficient', 'proficient')).level}`);

// Published verbatim: "a student who is Proficient on three strands but Emerging
// on one is Proficient overall."
check('PUBLISHED CASE: three Proficient + one Emerging is Proficient',
  overall(L('proficient', 'proficient', 'proficient', 'emerging')).level === 'proficient',
  `got ${overall(L('proficient', 'proficient', 'proficient', 'emerging')).level}`);

check('three Advanced but one working towards is NOT Advanced (floor is Proficient)',
  overall(L('advanced', 'advanced', 'advanced', 'working_towards')).level !== 'advanced',
  `got ${overall(L('advanced', 'advanced', 'advanced', 'working_towards')).level}`);

check('three Proficient but one working towards is NOT Proficient (floor is Emerging)',
  overall(L('proficient', 'proficient', 'proficient', 'working_towards')).level === 'emerging',
  `got ${overall(L('proficient', 'proficient', 'proficient', 'working_towards')).level}`);

check('Grade 6: three Emerging and one working towards is still Emerging',
  overall(L('emerging', 'emerging', 'emerging', 'working_towards')).level === 'emerging',
  'the Grade 6 Emerging rule has no floor — 3 of 4 suffice');

check('two Emerging and two working towards is working towards',
  overall(L('emerging', 'emerging', 'working_towards', 'working_towards')).level === 'working_towards');

check('Emerging is flagged as the expected Grade 6 standard',
  overall(L('emerging', 'emerging', 'emerging', 'emerging')).isExpected === true);

check('the rule text is returned so the record can show why',
  /3 of 4/.test(overall(L('emerging', 'emerging', 'emerging', 'emerging')).rule),
  overall(L('emerging', 'emerging', 'emerging', 'emerging')).rule);

/* ---------------------------------------------------------------------------
 * The rules genuinely differ per grade
 * ------------------------------------------------------------------------- */

console.log('\nPer-grade differences (these rules must not be shared)');

check('Grade 7 Emerging requires ALL four strands at Emerging, unlike Grade 6',
  overall(L('emerging', 'emerging', 'emerging', 'working_towards'), 'grade7').level === 'working_towards' &&
  overall(L('emerging', 'emerging', 'emerging', 'working_towards'), 'grade6').level === 'emerging',
  `g7=${overall(L('emerging','emerging','emerging','working_towards'),'grade7').level}, ` +
  `g6=${overall(L('emerging','emerging','emerging','working_towards'),'grade6').level}`);

check("Grade 8's expected tier is Proficient, not Emerging",
  api.CONFIG.GRADE_RULES.grade8.expectedTier === 'proficient' &&
  api.CONFIG.GRADE_RULES.grade6.expectedTier === 'emerging');

check('Grade 8 Proficient has no floor condition, unlike Grade 6 and 7',
  overall(L('proficient', 'proficient', 'proficient', 'working_towards'), 'grade8').level === 'proficient' &&
  overall(L('proficient', 'proficient', 'proficient', 'working_towards'), 'grade6').level !== 'proficient',
  `g8=${overall(L('proficient','proficient','proficient','working_towards'),'grade8').level}`);

check('an unknown grade yields no level rather than a guess',
  overall(L('emerging', 'emerging', 'emerging', 'emerging'), 'grade99').level === null);

/* ---------------------------------------------------------------------------
 * Incompleteness is reported, never defaulted
 * ------------------------------------------------------------------------- */

console.log('\nIncomplete profiles');

const partial = overall({ CU: 'emerging', SD: 'proficient' });
check('a profile missing strands has no overall level',
  partial.level === null && partial.reason === 'incomplete');
check('it names which strands are missing',
  partial.missingStrands.join(',') === 'CE,GE', partial.missingStrands.join(','));
check('no strands judged yields no level (not working_towards)',
  overall({}).level === null, `got ${overall({}).level}`);

/* ---------------------------------------------------------------------------
 * Strand profile from judgement rows
 * ------------------------------------------------------------------------- */

console.log('\nStrand profile');

const judgement = (strand, level, extra) => Object.assign({
  strand, level, scale: 'summative_tier', assessmentEvent: 'final',
  judgedAt: '2026-09-10T10:00:00Z', judgedBy: 'teacher@aisa.sch.ae',
  evidenceProducts: 'Worksheet', evidenceObservations: 'Card sort', evidenceConversations: ''
}, extra || {});

const profile = api.buildStrandProfile_('grade6', [
  judgement('CU', 'emerging'),
  judgement('SD', 'proficient'),
  judgement('CE', 'emerging'),
  judgement('GE', 'emerging')
]);

check('profile reports all four strands', profile.byStrand.length === 4);
check('profile computes the overall level', profile.overall.level === 'emerging');
check('profile carries ADEK descriptors for judging against',
  !!profile.byStrand[0].descriptors.emerging.descriptor &&
  profile.byStrand[0].descriptors.emerging.code === 'AIF·CU·G6·E',
  profile.byStrand[0].descriptors.emerging.code);
check('profile uses ADEK strand labels',
  profile.byStrand[1].label === 'AI Solution Design & Development',
  profile.byStrand[1].label);

const superseded = api.buildStrandProfile_('grade6', [
  judgement('CU', 'working_towards', { judgedAt: '2026-09-01T10:00:00Z', supersededBy: 'j2' }),
  judgement('CU', 'emerging', { judgedAt: '2026-09-20T10:00:00Z' })
]);
check('a superseded judgement is ignored in favour of the re-check',
  superseded.byStrand[0].level === 'emerging', superseded.byStrand[0].level);

const unjudged = api.buildStrandProfile_('grade6', [judgement('CU', 'emerging')]);
check('an unjudged strand reads "Not yet judged", not a computed value',
  unjudged.byStrand[1].judged === false &&
  unjudged.byStrand[1].levelLabel === 'Not yet judged' &&
  unjudged.byStrand[1].level === null);

const thin = api.buildStrandProfile_('grade6', [
  judgement('CU', 'emerging', { evidenceObservations: '', evidenceConversations: '' })
]);
check('a single-source judgement is flagged, not blocked',
  thin.byStrand[0].singleSource === true && thin.byStrand[0].level === 'emerging');
check('it names the missing evidence sources',
  thin.byStrand[0].missingSources.join(',') === 'observations,conversations',
  thin.byStrand[0].missingSources.join(','));

const formativeOnly = api.buildStrandProfile_('grade6', [
  judgement('CU', 'emerging', { scale: 'formative_criterion' })
]);
check('formative rows never contribute to the reportable profile',
  formativeOnly.byStrand[0].judged === false);

/* ---------------------------------------------------------------------------
 * Marks are products evidence, never a level
 * ------------------------------------------------------------------------- */

console.log('\nMarks stay evidence');

const results = [
  { questionId: 'q1', marksAwarded: 2, marksAvailable: 2, standards: ['AIF·CU·G6·E'] },
  { questionId: 'q2', marksAwarded: 1, marksAvailable: 3, standards: ['AIF·SD·G6·E'] }
];
const evidence = api.worksheetEvidenceByStrand_('grade6', [
  { lessonId: 'g6-w2-core', attempt: 3, resultsJson: JSON.stringify(results) }
]);
const cu = evidence.filter((e) => e.strand === 'CU')[0];

check('evidence is labelled as products', cu.evidenceType === 'products');
check('worksheet score is reported as a score, not a level',
  cu.worksheetScore === 100 && cu.level === undefined && cu.band === undefined);
check('a third-attempt result is flagged as not independent',
  cu.notIndependent === true && cu.highestAttemptUsed === 3);
check('a strand with no items has a null score rather than zero',
  evidence.filter((e) => e.strand === 'GE')[0].worksheetScore === null);
check('structured frameworkRef tags are read as well as string codes',
  api.worksheetEvidenceByStrand_('grade6', [{
    lessonId: 'x', attempt: 1,
    resultsJson: JSON.stringify([{ marksAwarded: 1, marksAvailable: 1,
      frameworkRefs: [{ strand: 'GE', code: 'AIF·GE·G6·E' }] }])
  }]).filter((e) => e.strand === 'GE')[0].marksAwarded === 1);

check('NO function converts a percentage into a level',
  !/function\s+bandFor_|PASS_PERCENT|ATTAINMENT_BANDS/.test(
    load('src/Attainment.gs') + load('src/Config.gs')),
  'a percent-to-level path has reappeared');

/* ---------------------------------------------------------------------------
 * Class rollup
 * ------------------------------------------------------------------------- */

console.log('\nClass rollup');

const cohort = [
  { profile: api.buildStrandProfile_('grade6', [
      judgement('CU', 'emerging'), judgement('SD', 'emerging'),
      judgement('CE', 'emerging'), judgement('GE', 'emerging')]) },
  { profile: api.buildStrandProfile_('grade6', [
      judgement('CU', 'proficient'), judgement('SD', 'proficient'),
      judgement('CE', 'proficient'), judgement('GE', 'emerging')]) },
  { profile: api.buildStrandProfile_('grade6', [judgement('CU', 'working_towards')]) }
];
const klass = api.computeClassProfile_('grade6', cohort);

const cuRow = klass.byStrand.filter((r) => r.strand === 'CU')[0];
check('class rollup counts students per level per strand',
  cuRow.distribution.filter((d) => d.level === 'emerging')[0].count === 1 &&
  cuRow.distribution.filter((d) => d.level === 'proficient')[0].count === 1 &&
  cuRow.distribution.filter((d) => d.level === 'working_towards')[0].count === 1);
check('unjudged strands are counted separately, not as zero',
  klass.byStrand.filter((r) => r.strand === 'GE')[0].notJudged === 1);
check('students with an incomplete profile are reported as incomplete',
  klass.overall.incomplete === 1);
check('class rollup exposes no average and no band',
  klass.averagePercent === undefined && klass.band === undefined);

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
