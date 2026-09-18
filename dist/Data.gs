/**
 * StudyTwin — Data.gs
 *
 * GENERATED FILE. Every section below is one file from src/ in the repository.
 * Do not edit this in the Apps Script editor: regenerate with `npm run bundle`
 * and paste it again, or the next rebuild will silently discard your change.
 *
 * Built: 2026-09-18T09:48:30.188Z
 */

/* ==========================================================================
 * Config.gs
 * ========================================================================== */

/**
 * Central configuration.
 *
 * Nothing secret lives here. The one environment-specific value — the ID of the
 * spreadsheet used as the datastore — is held in Script Properties so this file
 * stays identical across the dev and live deployments.
 */

const CONFIG = {
  /** Only accounts on this domain may use the app. Enforced server-side on every call. */
  ALLOWED_DOMAIN: 'aisa.sch.ae',

  /** Display name of the platform, shown in the UI header. */
  APP_NAME: 'StudyTwin',
  SCHOOL_NAME: 'American International School in Abu Dhabi',

  /** Script Property key holding the datastore spreadsheet ID. */
  PROP_SPREADSHEET_ID: 'STUDYTWIN_SPREADSHEET_ID',

  /**
   * Attainment levels, from the ADEK K–12 AI Fluency Framework.
   *
   * These are CRITERION-REFERENCED levels awarded by a teacher against a written
   * descriptor. They are not score bands: no percentage threshold exists for any
   * of them anywhere in ADEK's published material, and none may be invented.
   *
   * `working_towards` is the published Teacher Packs' term for not yet meeting
   * Emerging. Their wording matters and is reproduced in the UI: it is
   * "diagnostic information, not a failure".
   *
   * Note that Emerging is the EXPECTED standard in Term 1 for Grades 6 and 7 —
   * it is the top of the scale for that term, not the bottom. Colours reflect
   * that: nothing below Advanced is rendered as a warning.
   */
  ATTAINMENT_LEVELS: [
    { key: 'working_towards', label: 'Working towards', letter: '—', ordinal: 0,
      isTier: false, color: '#9AA0A8',
      note: 'Diagnostic information, not a failure. Use the linked bridging content, then re-check.' },
    { key: 'emerging', label: 'Emerging', letter: 'E', ordinal: 1,
      isTier: true, color: '#8A76D0',
      note: 'The expected standard for Term 1.' },
    { key: 'proficient', label: 'Proficient', letter: 'P', ordinal: 2,
      isTier: true, color: '#21076C',
      note: 'The national entitlement standard; the target for the full year.' },
    { key: 'advanced', label: 'Advanced', letter: 'A', ordinal: 3,
      isTier: true, color: '#D8B664',
      note: 'Further stretch, and the prior-grade bar that Bridging rebuilds.' }
  ],

  /**
   * Overall-level decision rules, per grade, taken verbatim from each grade's
   * published Final Assessment.
   *
   * These genuinely differ between grades and must not be shared:
   *   - Grade 6 Emerging allows one strand below Emerging (3 of 4 suffice).
   *   - Grade 7 Emerging requires every strand at Emerging or above.
   *   - Grade 8's EXPECTED tier is Proficient, not Emerging, and its Proficient
   *     rule carries no floor condition.
   *
   * Rules are evaluated top-down; the first whose conditions hold is awarded.
   *   atOrAbove — at least `count` strands at `level` or above
   *   floor     — every strand must be at this level or above (null = no floor)
   */
  GRADE_RULES: {
    grade6: {
      expectedTier: 'emerging',
      source: 'Grade 6 Final Assessment, Module 8 — Analytic rubric, overall level judgement',
      rules: [
        { level: 'advanced',   atOrAbove: { level: 'advanced',   count: 3 }, floor: 'proficient',
          text: 'At least 3 strands at Advanced, with no strand below Proficient.' },
        { level: 'proficient', atOrAbove: { level: 'proficient', count: 3 }, floor: 'emerging',
          text: 'At least 3 of 4 strands at Proficient or above, with none below Emerging.' },
        { level: 'emerging',   atOrAbove: { level: 'emerging',   count: 3 }, floor: null,
          text: 'At least 3 of 4 strands at Emerging or above.' }
      ]
    },
    grade7: {
      expectedTier: 'emerging',
      source: 'Grade 7 Final Assessment, Module 9 — Analytic rubric, overall level judgement',
      rules: [
        { level: 'advanced',   atOrAbove: { level: 'advanced',   count: 3 }, floor: 'proficient',
          text: 'At least 3 strands at Advanced, with no strand below Proficient.' },
        { level: 'proficient', atOrAbove: { level: 'proficient', count: 3 }, floor: 'emerging',
          text: 'At least 3 of 4 strands at Proficient or above, none below Emerging.' },
        { level: 'emerging',   atOrAbove: { level: 'emerging',   count: 4 }, floor: 'emerging',
          text: '0–2 strands at Proficient, the rest at Emerging.' }
      ]
    },
    grade8: {
      expectedTier: 'proficient',
      source: 'Grade 8 Final Assessment, Module 10 — Analytic rubric, overall level judgement',
      rules: [
        { level: 'advanced',   atOrAbove: { level: 'advanced',   count: 3 }, floor: 'proficient',
          text: 'At least 3 strands at Advanced, with no strand below Proficient.' },
        { level: 'proficient', atOrAbove: { level: 'proficient', count: 3 }, floor: null,
          text: 'At least 3 of 4 strands at Proficient or above.' },
        { level: 'emerging',   atOrAbove: { level: 'emerging',   count: 4 }, floor: 'emerging',
          text: '0–2 strands at Proficient, the rest at Emerging.' }
      ]
    }
  },

  /**
   * The three scales in use. They sit on different continua and must never be
   * rolled into one another — only `summative_tier` is reportable attainment.
   */
  SCALES: {
    summative_tier: ['working_towards', 'emerging', 'proficient', 'advanced'],
    formative_criterion: ['not_yet', 'approaching', 'emerging'],
    bridging_readiness: ['not_yet', 'partial', 'mastery']
  },

  /**
   * Thresholds mapping auto-marked evidence to a SUGGESTED level.
   *
   * These are AISA's convention, not ADEK's. ADEK publishes no mark-to-tier conversion
   * anywhere: its levels are awarded by matching observed performance to a written
   * descriptor. The school has chosen to auto-suggest a level from the marked work so
   * that no staff time goes on correcting, with a teacher confirming it in a short
   * conversation before it is recorded.
   *
   * So the number never becomes the judgement on its own — it becomes a proposal. Every
   * judgement row records whether it was confirmed by a teacher or left as the automatic
   * suggestion, and the export says so, because a record that hides how a level was
   * reached is not one the school can defend.
   *
   * Deliberately conservative at the top: Advanced is a stretch tier in the framework,
   * and a high score on comprehension questions is not the same as the reasoning the
   * Advanced descriptors ask for.
   */
  SUGGESTION_THRESHOLDS: [
    { level: 'advanced',   min: 90 },
    { level: 'proficient', min: 70 },
    { level: 'emerging',   min: 45 },
    { level: 'working_towards', min: 0 }
  ],

  /** Below this many marked items, a suggestion is too thin to offer. */
  SUGGESTION_MIN_ITEMS: 3,

  /** The four strands of Phase 3. Codes are stable; labels vary by grade. */
  STRANDS: ['CU', 'SD', 'CE', 'GE'],

  /** Evidence sources ADEK requires judgements to triangulate across. */
  EVIDENCE_SOURCES: [
    { key: 'products',     label: 'Products',     hint: 'what students make' },
    { key: 'observations', label: 'Observations', hint: 'what students do' },
    { key: 'conversations', label: 'Conversations', hint: 'what students say' }
  ],

  /** Students may retry a worksheet up to this many times. */
  MAX_ATTEMPTS: 3,

  /** Seconds to cache curriculum + roster lookups. Content is static; identity is not. */
  CACHE_SECONDS: 300
};

/** Sheet names used in the datastore workbook. */
const SHEETS = {
  STAFF: 'Staff',
  ROSTER: 'Roster',
  PROGRESS: 'Progress',
  SUBMISSIONS: 'Submissions',
  JUDGEMENTS: 'Judgements',
  READINESS: 'Readiness',
  AUDIT: 'AuditLog'
};

/**
 * Column order for each sheet. Changing these means migrating the workbook.
 *
 * JUDGEMENTS is the ADEK observation record: one row per strand per assessment
 * event, append-only so a re-check after bridging leaves an audit trail rather
 * than overwriting the earlier judgement.
 */
const COLUMNS = {
  STAFF:       ['email', 'role', 'displayName', 'addedAt', 'addedBy'],
  ROSTER:      ['email', 'displayName', 'grade', 'className', 'active', 'bridgingStrands'],
  PROGRESS:    ['email', 'lessonId', 'track', 'weekNumber', 'status',
                'startedAt', 'updatedAt', 'submittedAt'],
  SUBMISSIONS: ['email', 'lessonId', 'track', 'attempt', 'submittedAt', 'marksAwarded',
                'marksAvailable', 'percent', 'answersJson', 'resultsJson'],
  JUDGEMENTS:  ['id', 'email', 'grade', 'track', 'strand', 'level', 'scale',
                'assessmentEvent', 'frameworkRefs', 'source', 'suggestedLevel',
                'evidenceProducts', 'evidenceObservations', 'evidenceConversations',
                'note', 'accessArrangements', 'nextStep', 'bridgingRef',
                'judgedBy', 'judgedAt', 'supersededBy'],
  READINESS:   ['email', 'grade', 'strand', 'probeCode', 'result', 'action',
                'recheckAfterWeek', 'recordedBy', 'recordedAt'],
  AUDIT:       ['timestamp', 'actor', 'action', 'detail']
};

/** Ordinal lookup, built once from ATTAINMENT_LEVELS. */
const LEVEL_ORDINAL = CONFIG.ATTAINMENT_LEVELS.reduce(function (acc, l) {
  acc[l.key] = l.ordinal;
  return acc;
}, {});

/** Level definition by key. */
function levelDef_(key) {
  return CONFIG.ATTAINMENT_LEVELS.filter(function (l) { return l.key === key; })[0] || null;
}

/* ==========================================================================
 * generated/CurriculumData.gs
 * ========================================================================== */

/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Built from curriculum/** by tools/build-content.js (`npm run build`).
 * Edit the JSON under curriculum/ and rebuild; changes made here are overwritten.
 *
 * Settings, framework and curriculum index.
 * Built: 2026-09-18T09:48:30.139Z
 */

const CURRICULUM_SHELLS = {"grade6":{"meta":{"grade":6,"title":"Grade 6 — AI Fluency","subtitle":"ADEK AI Literacy Curriculum, Term 1","source":"Grade 6 Curriculum and Sample Core Lesson (ADEK, published pack)","tracks":{"bridging":{"title":"Bridging Program — Building Trustworthy AI","summary":"Six weeks rebuilding each strand to the prior grade’s Advanced bar before the Main Course begins."},"main":{"title":"Main Course — Rule-Based vs Learning Systems","summary":"Ten weeks securing the Grade 6 Emerging outcomes across the four strands."}}},"units":[{"id":"g6-bridging-w1","track":"bridging","week":1,"title":"Week 1","summary":"Data Quality and AI Outputs · Data Quality Investigation (Lab)","lessons":["g6-bridging-w1-core","g6-bridging-w1-lab"]},{"id":"g6-bridging-w2","track":"bridging","week":2,"title":"Week 2","summary":"Refining Prompts for Better Outputs · Prompt Refinement Workshop (Lab)","lessons":["g6-bridging-w2-core","g6-bridging-w2-lab"]},{"id":"g6-bridging-w3","track":"bridging","week":3,"title":"Week 3","summary":"How Data Shapes a Solution's Outcome · Trace-the-Data Investigation (Lab)","lessons":["g6-bridging-w3-core","g6-bridging-w3-lab"]},{"id":"g6-bridging-w4","track":"bridging","week":4,"title":"Week 4","summary":"Misinformation Risks and Verification · Verify and De-risk Workshop (Lab)","lessons":["g6-bridging-w4-core","g6-bridging-w4-lab"]},{"id":"g6-bridging-w5","track":"bridging","week":5,"title":"Week 5","summary":"Trustworthy AI Helper - Design & Test the Data (Part 1 Core) · Trustworthy AI Helper - Build & Refine the Prompt (Part 1 Lab)","lessons":["g6-bridging-w5-core","g6-bridging-w5-lab"]},{"id":"g6-bridging-w6","track":"bridging","week":6,"title":"Week 6","summary":"Trustworthy AI Helper - Trace the Data & Plan Checks (Part 2 Core) · Trustworthy AI Helper - Verify, De-risk & Showcase (Part 2 Lab)","lessons":["g6-bridging-w6-core","g6-bridging-w6-lab"]},{"id":"g6-main-w1","track":"main","week":1,"title":"Week 1","summary":"Unit Launch - Rule-Based vs Learning Systems · Rule vs Learning - Hands-On Exploration (Lab)","lessons":["g6-main-w1-core","g6-main-w1-lab"]},{"id":"g6-main-w2","track":"main","week":2,"title":"Week 2","summary":"Rules vs Learning - How Each System Works · Train a Simple Model (Lab)","lessons":["g6-main-w2-core","g6-main-w2-lab"]},{"id":"g6-main-w3","track":"main","week":3,"title":"Week 3","summary":"Structured Prompts to Complete a Task · Prompt-to-Task Workshop (Lab)","lessons":["g6-main-w3-core","g6-main-w3-lab"]},{"id":"g6-main-w4","track":"main","week":4,"title":"Week 4","summary":"Judging Outputs - Correct, Incorrect, Unclear · Output Triage Clinic (Lab)","lessons":["g6-main-w4-core","g6-main-w4-lab"]},{"id":"g6-main-w5","track":"main","week":5,"title":"Week 5","summary":"Risks and Responsible Use · Class AI Risk Audit (Lab)","lessons":["g6-main-w5-core","g6-main-w5-lab"]},{"id":"g6-main-w6","track":"main","week":6,"title":"Week 6","summary":"Bringing the Strands Together · Integrated Build-and-Check (Lab)","lessons":["g6-main-w6-core","g6-main-w6-lab"]},{"id":"g6-main-w7","track":"main","week":7,"title":"Week 7","summary":"Signature Solution - Planning · Prototype and Pressure-Test the Plan (Lab)","lessons":["g6-main-w7-core","g6-main-w7-lab"]},{"id":"g6-main-w8","track":"main","week":8,"title":"Week 8","summary":"Signature Solution - Building · Extended Build and Evaluation (Lab)","lessons":["g6-main-w8-core","g6-main-w8-lab"]},{"id":"g6-main-w9","track":"main","week":9,"title":"Week 9","summary":"Signature Solution - Refining & Finishing · Final Iteration and Risk Review (Lab)","lessons":["g6-main-w9-core","g6-main-w9-lab"]},{"id":"g6-main-w10","track":"main","week":10,"title":"Week 10","summary":"Showcase, Assessment & Reflection · Showcase Carousel and Reflection (Lab)","lessons":["g6-main-w10-core","g6-main-w10-lab"]}],"lessons":{}}};

/** Official ADEK framework catalogue — strand descriptors per grade per tier. */
const FRAMEWORK = {"source":"ADEK AI Literacy Curriculum — Scope & Sequence, KG to Grade 12, Term 1","framework":"ADEK K–12 AI Fluency Framework","extractedFrom":"curriculum/source/ADEK_Scope_and_Sequence_Term1.html","tiers":[{"key":"emerging","label":"Emerging","letter":"E","ordinal":1},{"key":"proficient","label":"Proficient","letter":"P","ordinal":2},{"key":"advanced","label":"Advanced","letter":"A","ordinal":3}],"strandRows":[{"row":"Knowing how intelligent systems learn and operate","theme":"How AI works"},{"row":"Working with data, and designing solutions","theme":"Data & design"},{"row":"Exercising judgement in the use of AI systems","theme":"Judgement"},{"row":"Assessing AI systems for ethical use","theme":"Ethics & governance"}],"grades":{"grade4":{"CU":{"code":"CU","label":"AI Conceptual Understanding","theme":"How AI works","frameworkRow":"Knowing how intelligent systems learn and operate","tiers":{"emerging":{"code":"AIF·CU·G4·E","descriptor":"Recognises that systems use data to make decisions."},"proficient":{"code":"AIF·CU·G4·P","descriptor":"Explains how data is represented and used."},"advanced":{"code":"AIF·CU·G4·A","descriptor":"Explains how patterns in data influence outcomes."}}},"DA":{"code":"DA","label":"Data Awareness","theme":"Data & design","frameworkRow":"Working with data, and designing solutions","tiers":{"emerging":{"code":"AIF·DA·G4·E","descriptor":"Labels and organises simple data."},"proficient":{"code":"AIF·DA·G4·P","descriptor":"Identifies errors or imbalance in data."},"advanced":{"code":"AIF·DA·G4·A","descriptor":"Improves data to make it more accurate and balanced."}}},"CE":{"code":"CE","label":"Critical Evaluation & Informed Interaction","theme":"Judgement","frameworkRow":"Exercising judgement in the use of AI systems","tiers":{"emerging":{"code":"AIF·CE·G4·E","descriptor":"Uses block-based tools to simulate decisions."},"proficient":{"code":"AIF·CE·G4·P","descriptor":"Creates simple solutions using data and logic."},"advanced":{"code":"AIF·CE·G4·A","descriptor":"Explains how data influences the outcome of a solution."}}},"GE":{"code":"GE","label":"Responsible AI Use","theme":"Ethics & governance","frameworkRow":"Assessing AI systems for ethical use","tiers":{"emerging":{"code":"AIF·GE·G4·E","descriptor":"Recognises that data can affect fairness."},"proficient":{"code":"AIF·GE·G4·P","descriptor":"Explains how biased data leads to unfair outcomes."},"advanced":{"code":"AIF·GE·G4·A","descriptor":"Evaluates fairness based on input data."}}}},"grade5":{"CU":{"code":"CU","label":"AI Conceptual Understanding","theme":"How AI works","frameworkRow":"Knowing how intelligent systems learn and operate","tiers":{"emerging":{"code":"AIF·CU·G5·E","descriptor":"Recognises that AI systems generate outputs using data."},"proficient":{"code":"AIF·CU·G5·P","descriptor":"Explains how AI uses data to generate responses."},"advanced":{"code":"AIF·CU·G5·A","descriptor":"Explains how data quality affects AI outputs."}}},"DA":{"code":"DA","label":"Data Literacy","theme":"Data & design","frameworkRow":"Working with data, and designing solutions","tiers":{"emerging":{"code":"AIF·DA·G5·E","descriptor":"Recognises that data affects outputs."},"proficient":{"code":"AIF·DA·G5·P","descriptor":"Identifies when data is incomplete or biased."},"advanced":{"code":"AIF·DA·G5·A","descriptor":"Suggests improvements to make data more reliable."}}},"SD":{"code":"SD","label":"AI Solution Design & Development","theme":"Judgement","frameworkRow":"Exercising judgement in the use of AI systems","tiers":{"emerging":{"code":"AIF·SD·G5·E","descriptor":"Uses AI tools to generate simple outputs with guidance."},"proficient":{"code":"AIF·SD·G5·P","descriptor":"Uses structured prompts to generate useful outputs."},"advanced":{"code":"AIF·SD·G5·A","descriptor":"Refines prompts to improve output quality and explains why."}}},"GE":{"code":"GE","label":"Ethics & Responsible Use","theme":"Ethics & governance","frameworkRow":"Assessing AI systems for ethical use","tiers":{"emerging":{"code":"AIF·GE·G5·E","descriptor":"Recognises when outputs may be incorrect."},"proficient":{"code":"AIF·GE·G5·P","descriptor":"Evaluates outputs for accuracy and fairness."},"advanced":{"code":"AIF·GE·G5·A","descriptor":"Explains misinformation risks and proposes verification strategies."}}}},"grade6":{"CU":{"code":"CU","label":"AI Conceptual Understanding","theme":"How AI works","frameworkRow":"Knowing how intelligent systems learn and operate","tiers":{"emerging":{"code":"AIF·CU·G6·E","descriptor":"Recognises the difference between rule-based and learning systems."},"proficient":{"code":"AIF·CU·G6·P","descriptor":"Explains how AI systems learn from data to generate outputs."},"advanced":{"code":"AIF·CU·G6·A","descriptor":"Explains how training data affects output quality and performance."}}},"SD":{"code":"SD","label":"AI Solution Design & Development","theme":"Data & design","frameworkRow":"Working with data, and designing solutions","tiers":{"emerging":{"code":"AIF·SD·G6·E","descriptor":"Uses AI tools with structured prompts to complete tasks."},"proficient":{"code":"AIF·SD·G6·P","descriptor":"Applies simple structured processes (input to output) to generate results."},"advanced":{"code":"AIF·SD·G6·A","descriptor":"Builds structured AI-assisted solutions using guided inputs and data."}}},"CE":{"code":"CE","label":"Critical Evaluation & Informed Interaction","theme":"Judgement","frameworkRow":"Exercising judgement in the use of AI systems","tiers":{"emerging":{"code":"AIF·CE·G6·E","descriptor":"Identifies when outputs are incorrect or unclear."},"proficient":{"code":"AIF·CE·G6·P","descriptor":"Evaluates outputs for accuracy and relevance."},"advanced":{"code":"AIF·CE·G6·A","descriptor":"Explains how changes to inputs or data improve outputs."}}},"GE":{"code":"GE","label":"Ethics & Governance","theme":"Ethics & governance","frameworkRow":"Assessing AI systems for ethical use","tiers":{"emerging":{"code":"AIF·GE·G6·E","descriptor":"Recognises basic risks (e.g. incorrect outputs, unsafe use)."},"proficient":{"code":"AIF·GE·G6·P","descriptor":"Explains bias, privacy, and the need for responsible use."},"advanced":{"code":"AIF·GE·G6·A","descriptor":"Identifies biased outputs and suggests simple ways to improve fairness and safety."}}}}}};

/** Published week-by-week Main Course and Bridging sequences. */
const SEQUENCES = {"grade6":{"main":[{"week":"1 Launch","weekNumber":1,"phase":"Launch","lessons":[{"kind":"core","title":"Rule-Based vs Learning Systems"},{"kind":"lab","title":"Rule vs Learning: Hands-On Exploration"}],"strand":"All four strands","secures":"Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 6 strands in a first guided task.","stretch":"Students state the big idea in their own words and predict which strand each part of the task will need."},{"week":"2","weekNumber":2,"phase":null,"lessons":[{"kind":"core","title":"Rules vs Learning: How Each System Works"},{"kind":"lab","title":"Train a Simple Model"}],"strand":"AI Conceptual Understanding","secures":"Recognises the difference between rule-based and learning systems.","stretch":"Explains how AI systems learn from data to generate outputs."},{"week":"3","weekNumber":3,"phase":null,"lessons":[{"kind":"core","title":"Structured Prompts to Complete a Task"},{"kind":"lab","title":"Prompt-to-Task Workshop"}],"strand":"AI Solution Design & Development","secures":"Uses AI tools with structured prompts to complete tasks.","stretch":"Applies simple structured processes (input to output) to generate results."},{"week":"4","weekNumber":4,"phase":null,"lessons":[{"kind":"core","title":"Judging Outputs: Correct, Incorrect, Unclear"},{"kind":"lab","title":"Output Triage Clinic"}],"strand":"Critical Evaluation & Informed Interaction","secures":"Identifies when outputs are incorrect or unclear.","stretch":"Evaluates outputs for accuracy and relevance."},{"week":"5","weekNumber":5,"phase":null,"lessons":[{"kind":"core","title":"Risks and Responsible Use"},{"kind":"lab","title":"Class AI Risk Audit"}],"strand":"Ethics & Governance","secures":"Recognises basic risks (e.g. incorrect outputs, unsafe use).","stretch":"Explains bias, privacy, and the need for responsible use."},{"week":"6 Integrate","weekNumber":6,"phase":"Integrate","lessons":[{"kind":"core","title":"Bringing the Strands Together"},{"kind":"lab","title":"Integrated Build-and-Check"}],"strand":"All four strands","secures":"Applies all four Grade 6 strands to one task, so the strands become a single practice rather than four separate lessons.","stretch":"Students sequence the four strands independently and justify why each step is needed."},{"week":"7 Plan","weekNumber":7,"phase":"Plan","lessons":[{"kind":"core","title":"Signature Solution: Planning"},{"kind":"lab","title":"Prototype and Pressure-Test the Plan"}],"strand":"All four strands","secures":"Signature activity – planning. Students design a solution of their own that will require all four Grade 6 strands, and set the criteria it must meet.","stretch":"Students justify design choices against their criteria before any building begins."},{"week":"8 Build","weekNumber":8,"phase":"Build","lessons":[{"kind":"core","title":"Signature Solution: Building"},{"kind":"lab","title":"Extended Build and Evaluation"}],"strand":"All four strands","secures":"Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.","stretch":"Students diagnose what is not working from evidence rather than by trial and error."},{"week":"9 Refine","weekNumber":9,"phase":"Refine","lessons":[{"kind":"core","title":"Signature Solution: Refining & Finishing"},{"kind":"lab","title":"Final Iteration and Risk Review"}],"strand":"All four strands","secures":"Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.","stretch":"Students explain the impact of each refinement using the evidence they gathered."},{"week":"10 Showcase","weekNumber":10,"phase":"Showcase","lessons":[{"kind":"core","title":"Showcase, Assessment & Reflection"},{"kind":"lab","title":"Showcase Carousel and Reflection"}],"strand":"All four strands","secures":"Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.","stretch":"Students identify their own next target from the strand profile the rubric produces."}],"bridging":[{"week":"1","weekNumber":1,"phase":null,"lessons":[{"kind":"core","title":"Data Quality and AI Outputs"},{"kind":"lab","title":"Data Quality Investigation"}],"strand":"AI Conceptual Understanding","rebuildsTo":"Explains how data quality affects AI outputs.","frameworkRefs":["AIF·CU·G5·A"]},{"week":"2","weekNumber":2,"phase":null,"lessons":[{"kind":"core","title":"Refining Prompts for Better Outputs"},{"kind":"lab","title":"Prompt Refinement Workshop"}],"strand":"AI Solution Design & Development","rebuildsTo":"Refines prompts to improve output quality and explains why.","frameworkRefs":["AIF·SD·G5·A"]},{"week":"3","weekNumber":3,"phase":null,"lessons":[{"kind":"core","title":"How Data Shapes a Solution’s Outcome"},{"kind":"lab","title":"Trace-the-Data Investigation"}],"strand":"Critical Evaluation & Informed Interaction","rebuildsTo":"Explains how data influences the outcome of a solution.","frameworkRefs":["AIF·CE·G4·A"]},{"week":"4","weekNumber":4,"phase":null,"lessons":[{"kind":"core","title":"Misinformation Risks and Verification"},{"kind":"lab","title":"Verify and De-risk Workshop"}],"strand":"Ethics & Governance","rebuildsTo":"Explains misinformation risks and proposes verification strategies.","frameworkRefs":["AIF·GE·G5·A"]},{"week":"5 Integrate 1","weekNumber":5,"phase":"Integrate 1","lessons":[{"kind":"core","title":"Trustworthy AI Helper: Design & Test the Data (Part 1)"},{"kind":"lab","title":"Trustworthy AI Helper: Build & Refine the Prompt (Part 1)"}],"strand":"Integration – all four strands","rebuildsTo":"Integration, part 1. Students design and build a small solution that applies four rebuilt prior-grade strands at once.","frameworkRefs":["AIF·CU·G5·A","AIF·SD·G5·A","AIF·CE·G4·A","AIF·GE·G5·A"]},{"week":"6 Integrate 2","weekNumber":6,"phase":"Integrate 2","lessons":[{"kind":"core","title":"Trustworthy AI Helper: Trace the Data & Plan Checks (Part 2)"},{"kind":"lab","title":"Trustworthy AI Helper: Verify, De-risk & Showcase (Part 2)"}],"strand":"Integration – all four strands","rebuildsTo":"Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.","frameworkRefs":["AIF·CU·G5·A","AIF·SD·G5·A","AIF·CE·G4·A","AIF·GE·G5·A"]}]}};

/** Teacher interview prompts, one per tier per strand. */
const INTERVIEW_PROMPTS = {"_readme":["Short spoken prompts for the teacher confirmation step, written by AISA.","","The published pack contains only four 'Advanced probe' questions in total, not enough for","a per-strand script, so these are authored from the framework's own tier descriptors: one","prompt per tier, each written to elicit exactly what that tier's descriptor describes.","A student who answers the Proficient prompt well but not the Advanced one is Proficient.","","They are a conversation aid, not a test. The teacher is confirming or overriding a level","the platform has already proposed from marked work, which takes a minute per strand."],"grade6":{"CU":{"emerging":"Show me one system that follows rules a person wrote, and one that learned from examples. How can you tell which is which?","proficient":"Take the model you trained. Explain how it got from the examples it saw to the answer it gave.","advanced":"If half its training examples were labelled wrongly, what exactly would change about its answers — and which cases would go wrong first?"},"SD":{"emerging":"Show me the prompt you used to get that result. Which parts of it were doing the work?","proficient":"Walk me through your solution from input to output. What happens at each step?","advanced":"Why did you build it that way rather than another way? What would break if you took one step out?"},"CE":{"emerging":"Point to an output here that is wrong or unclear. How did you know?","proficient":"How did you check that one? What did you compare it against, and what made that a good source?","advanced":"What single change to the input or the data would most improve these outputs — and how would you prove it worked?"},"GE":{"emerging":"What could go wrong if someone used this without checking it first?","proficient":"Who could be treated unfairly by this, and why? What about anyone's private information?","advanced":"Trace this unfair result back to the data behind it. What one change would make it fairer, and how would you check that it had?"}}};

/** Every lesson shipped, and whether it is placeholder content. */
const CURRICULUM_MANIFEST = [{"id":"g6-bridging-w1-core","grade":"grade6","provisional":false},{"id":"g6-bridging-w1-lab","grade":"grade6","provisional":false},{"id":"g6-bridging-w2-core","grade":"grade6","provisional":false},{"id":"g6-bridging-w2-lab","grade":"grade6","provisional":false},{"id":"g6-bridging-w3-core","grade":"grade6","provisional":false},{"id":"g6-bridging-w3-lab","grade":"grade6","provisional":false},{"id":"g6-bridging-w4-core","grade":"grade6","provisional":false},{"id":"g6-bridging-w4-lab","grade":"grade6","provisional":false},{"id":"g6-bridging-w5-core","grade":"grade6","provisional":false},{"id":"g6-bridging-w5-lab","grade":"grade6","provisional":false},{"id":"g6-bridging-w6-core","grade":"grade6","provisional":false},{"id":"g6-bridging-w6-lab","grade":"grade6","provisional":false},{"id":"g6-main-w1-core","grade":"grade6","provisional":false},{"id":"g6-main-w1-lab","grade":"grade6","provisional":false},{"id":"g6-main-w10-core","grade":"grade6","provisional":false},{"id":"g6-main-w10-lab","grade":"grade6","provisional":false},{"id":"g6-main-w2-core","grade":"grade6","provisional":false},{"id":"g6-main-w2-lab","grade":"grade6","provisional":false},{"id":"g6-main-w3-core","grade":"grade6","provisional":false},{"id":"g6-main-w3-lab","grade":"grade6","provisional":false},{"id":"g6-main-w4-core","grade":"grade6","provisional":false},{"id":"g6-main-w4-lab","grade":"grade6","provisional":false},{"id":"g6-main-w5-core","grade":"grade6","provisional":false},{"id":"g6-main-w5-lab","grade":"grade6","provisional":false},{"id":"g6-main-w6-core","grade":"grade6","provisional":false},{"id":"g6-main-w6-lab","grade":"grade6","provisional":false},{"id":"g6-main-w7-core","grade":"grade6","provisional":false},{"id":"g6-main-w7-lab","grade":"grade6","provisional":false},{"id":"g6-main-w8-core","grade":"grade6","provisional":false},{"id":"g6-main-w8-lab","grade":"grade6","provisional":false},{"id":"g6-main-w9-core","grade":"grade6","provisional":false},{"id":"g6-main-w9-lab","grade":"grade6","provisional":false}];

/** How many lesson chunks to expect. */
const CURRICULUM_CHUNKS = 5;

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

// --- END OF Data.gs --- if you cannot see this line, the paste was cut short.
