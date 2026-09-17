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
   * Attainment bands. A student's percentage against a standard is compared
   * top-down; the first band whose `min` is met is awarded.
   * Mirrors the four-point scale ADEK uses for the AI Standards.
   */
  ATTAINMENT_BANDS: [
    { key: 'mastery',    label: 'Mastery',    min: 85, color: '#21076C' },
    { key: 'secure',     label: 'Secure',     min: 70, color: '#4B2E9E' },
    { key: 'developing', label: 'Developing', min: 50, color: '#D8B664' },
    { key: 'emerging',   label: 'Emerging',   min: 0,  color: '#9A8248' }
  ],

  /** A lesson counts as complete once the worksheet is submitted at or above this %. */
  PASS_PERCENT: 50,

  /** Students may retry a worksheet up to this many times. Best attempt counts. */
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
  AUDIT: 'AuditLog'
};

/** Column order for each sheet. Changing these means migrating the workbook. */
const COLUMNS = {
  STAFF:       ['email', 'role', 'displayName', 'addedAt', 'addedBy'],
  ROSTER:      ['email', 'displayName', 'grade', 'className', 'active'],
  PROGRESS:    ['email', 'lessonId', 'status', 'startedAt', 'updatedAt', 'completedAt'],
  SUBMISSIONS: ['email', 'lessonId', 'attempt', 'submittedAt', 'marksAwarded',
                'marksAvailable', 'percent', 'answersJson', 'resultsJson'],
  AUDIT:       ['timestamp', 'actor', 'action', 'detail']
};
