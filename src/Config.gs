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
