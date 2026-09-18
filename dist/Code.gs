/**
 * StudyTwin — Code.gs
 *
 * GENERATED FILE. Every section below is one file from src/ in the repository.
 * Do not edit this in the Apps Script editor: regenerate with `npm run bundle`
 * and paste it again, or the next rebuild will silently discard your change.
 *
 * Built: 2026-09-18T09:40:33.989Z
 */

/* ==========================================================================
 * Auth.gs
 * ========================================================================== */

/**
 * Identity and authorisation.
 *
 * SECURITY MODEL
 * --------------
 * The web app is deployed with `executeAs: USER_DEPLOYING` and `access: DOMAIN`
 * (see appsscript.json). That combination is deliberate and must not be changed:
 *
 *   - `access: DOMAIN` makes Google itself refuse anyone outside the Workspace
 *     domain. An unauthenticated or personal Gmail user never reaches our code.
 *   - `executeAs: USER_DEPLOYING` means the script touches the datastore with the
 *     deploying admin's authority, so students never need — and never get — direct
 *     access to the spreadsheet holding everyone's marks.
 *
 * If this were flipped to `executeAs: USER_ACCESSING`, every student would need
 * write access to the marks workbook and could edit their own scores directly in
 * Sheets, bypassing the app entirely. Do not flip it.
 *
 * Because the script owner and the accessing user share a domain,
 * `Session.getActiveUser().getEmail()` still returns the real signed-in student.
 * That value comes from Google, not from the browser, so it cannot be spoofed by
 * the client.
 */

const ROLES = { STUDENT: 'student', TEACHER: 'teacher', ADMIN: 'admin' };

/**
 * Resolves the caller. Throws if the caller is not a valid domain user.
 * Every entry point in Api.gs calls this before doing anything else.
 *
 * @return {{email: string, displayName: string, role: string, grade: string, className: string}}
 */
function getCurrentUser() {
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase().trim();

  if (!email) {
    // Google could not tell us who this is. Never fall back to a guest identity.
    throw new Error('NOT_SIGNED_IN');
  }
  if (!isAllowedDomain_(email)) {
    logAudit_(email, 'ACCESS_DENIED', 'Domain not permitted');
    throw new Error('DOMAIN_NOT_ALLOWED');
  }

  const role = resolveRole_(email);
  const rosterEntry = findRosterEntry_(email);

  return {
    email: email,
    displayName: (rosterEntry && rosterEntry.displayName) || deriveNameFromEmail_(email),
    role: role,
    grade: (rosterEntry && rosterEntry.grade) || '',
    className: (rosterEntry && rosterEntry.className) || ''
  };
}

/**
 * Exact-suffix domain check.
 * Uses '@' + domain rather than a bare `endsWith(domain)` so a lookalike
 * domain such as `notaisa.sch.ae` cannot satisfy it.
 */
function isAllowedDomain_(email) {
  return email.slice(-(CONFIG.ALLOWED_DOMAIN.length + 1)) === '@' + CONFIG.ALLOWED_DOMAIN;
}

/**
 * Role lookup. Anyone on the domain who is not listed in the Staff sheet is a
 * student — staff are the exception that must be granted, not the default.
 *
 * The person who deployed the script is always an admin, so the very first
 * sign-in can bootstrap the Staff sheet without manual spreadsheet editing.
 */
function resolveRole_(email) {
  const owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase().trim();
  if (email === owner) return ROLES.ADMIN;

  const staff = readSheetObjects_(SHEETS.STAFF);
  const match = staff.filter(function (row) {
    return String(row.email || '').toLowerCase().trim() === email;
  })[0];

  if (!match) return ROLES.STUDENT;

  const role = String(match.role || '').toLowerCase().trim();
  return (role === ROLES.ADMIN || role === ROLES.TEACHER) ? role : ROLES.STUDENT;
}

/** True when the user may view other students' data. */
function isStaff_(user) {
  return user.role === ROLES.TEACHER || user.role === ROLES.ADMIN;
}

/** Throws unless the user is staff. Guards every teacher/admin endpoint. */
function requireStaff_(user) {
  if (!isStaff_(user)) {
    logAudit_(user.email, 'FORBIDDEN', 'Attempted staff-only action');
    throw new Error('FORBIDDEN');
  }
}

/** Throws unless the user is an admin. Guards roster and staff management. */
function requireAdmin_(user) {
  if (user.role !== ROLES.ADMIN) {
    logAudit_(user.email, 'FORBIDDEN', 'Attempted admin-only action');
    throw new Error('FORBIDDEN');
  }
}

/** "jane.smith@aisa.sch.ae" -> "Jane Smith". Only used when no roster name exists. */
function deriveNameFromEmail_(email) {
  return email.split('@')[0]
    .split(/[._-]+/)
    .filter(function (part) { return part.length; })
    .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
    .join(' ');
}

/* ==========================================================================
 * Db.gs
 * ========================================================================== */

/**
 * Datastore layer over Google Sheets.
 *
 * Sheets is not a database, so the access patterns here are deliberately narrow:
 * whole-sheet reads (cheap, one API call) filtered in memory, and writes
 * serialised behind a document lock so two students submitting at the same moment
 * cannot interleave and corrupt a row.
 *
 * Row shape is defined once in COLUMNS (Config.gs); everything here works from
 * that, so adding a column is a one-line change plus a migration run.
 */

/** Opens the datastore workbook, creating it on first run. */
function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(CONFIG.PROP_SPREADSHEET_ID);

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      // Stored ID is stale (workbook deleted or access lost). Fall through and rebuild.
      console.warn('Stored spreadsheet ID unusable, creating a new datastore: ' + err.message);
    }
  }

  const ss = SpreadsheetApp.create(CONFIG.APP_NAME + ' — Datastore');
  props.setProperty(CONFIG.PROP_SPREADSHEET_ID, ss.getId());
  ensureSchema_(ss);
  return ss;
}

/** Creates any missing sheet and writes its header row. Safe to call repeatedly. */
function ensureSchema_(ss) {
  ss = ss || getSpreadsheet_();

  Object.keys(SHEETS).forEach(function (key) {
    const name = SHEETS[key];
    const headers = COLUMNS[key];
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#21076C')
        .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
  });

  // Remove the default empty sheet left behind by SpreadsheetApp.create().
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  return ss;
}

/**
 * Reads a whole sheet as an array of objects keyed by header name.
 *
 * @param {string} sheetName
 * @param {boolean=} useCache Cache for CONFIG.CACHE_SECONDS. Only pass true for
 *   slow-changing reference data (Staff, Roster) — never for marks.
 */
function readSheetObjects_(sheetName, useCache) {
  const cacheKey = 'sheet:' + sheetName;
  const cache = CacheService.getScriptCache();

  if (useCache) {
    const hit = cache.get(cacheKey);
    if (hit) {
      try { return JSON.parse(hit); } catch (e) { /* corrupt entry, fall through */ }
    }
  }

  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const row = {};
    let blank = true;
    for (let c = 0; c < headers.length; c++) {
      const v = values[i][c];
      row[headers[c]] = v;
      if (v !== '' && v !== null) blank = false;
    }
    if (!blank) {
      row._rowIndex = i + 1; // 1-based sheet row, for targeted updates
      rows.push(row);
    }
  }

  if (useCache) {
    try {
      cache.put(cacheKey, JSON.stringify(rows), CONFIG.CACHE_SECONDS);
    } catch (e) {
      // Over the 100KB cache ceiling — not fatal, just means we read live next time.
    }
  }
  return rows;
}

/** Drops the cached copy of a sheet after a write that changed it. */
function invalidateCache_(sheetName) {
  CacheService.getScriptCache().remove('sheet:' + sheetName);
}

/** Appends one row, mapping an object onto the sheet's column order. */
function appendRow_(sheetKey, obj) {
  const sheetName = SHEETS[sheetKey];
  const headers = COLUMNS[sheetKey];
  const sheet = getSpreadsheet_().getSheetByName(sheetName) ||
                ensureSchema_().getSheetByName(sheetName);

  const row = headers.map(function (h) {
    return obj[h] === undefined || obj[h] === null ? '' : obj[h];
  });
  sheet.appendRow(row);
  invalidateCache_(sheetName);
}

/** Overwrites one existing row in place, identified by its 1-based sheet index. */
function updateRow_(sheetKey, rowIndex, obj) {
  const sheetName = SHEETS[sheetKey];
  const headers = COLUMNS[sheetKey];
  const sheet = getSpreadsheet_().getSheetByName(sheetName);

  const row = headers.map(function (h) {
    return obj[h] === undefined || obj[h] === null ? '' : obj[h];
  });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
  invalidateCache_(sheetName);
}

/**
 * Runs a write inside a document lock.
 *
 * Without this, thirty students hitting Submit at the end of a lesson can read
 * the same "last row", then each append over the others. The lock makes those
 * writes queue instead. Waits up to 20s, which comfortably covers a class-sized
 * burst; beyond that we surface a retryable error rather than risk a lost mark.
 */
function withLock_(fn) {
  // getScriptLock, NOT getDocumentLock. This is a standalone web app with no container
  // document, so getDocumentLock() yields a lock that cannot be acquired and every write
  // throws — which surfaced as "Something went wrong" on the first student submission.
  // A script lock is also the correct scope: it serialises writes across ALL users of the
  // one shared datastore, which is exactly what we are protecting.
  const lock = LockService.getScriptLock();
  if (!lock) {
    throw new Error('LOCK_UNAVAILABLE');
  }
  if (!lock.tryLock(20000)) {
    throw new Error('BUSY');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Roster lookup for one student. */
function findRosterEntry_(email) {
  const roster = readSheetObjects_(SHEETS.ROSTER, true);
  return roster.filter(function (r) {
    return String(r.email || '').toLowerCase().trim() === email;
  })[0] || null;
}

/** Appends an audit entry. Never throws — logging must not break a lesson. */
function logAudit_(actor, action, detail) {
  try {
    appendRow_('AUDIT', {
      timestamp: new Date(),
      actor: actor || 'unknown',
      action: action,
      detail: detail || ''
    });
  } catch (err) {
    console.error('Audit write failed: ' + err.message);
  }
}

/* ==========================================================================
 * Content.gs
 * ========================================================================== */

/**
 * Curriculum content access.
 *
 * The curriculum itself lives in `curriculum/**` as plain JSON and is compiled
 * into `generated/CurriculumData.gs` by `npm run build`. Apps Script projects can
 * only hold .gs and .html files, so the build wraps the JSON rather than us
 * authoring lessons as code. The JSON stays the source of truth and stays
 * portable if the platform ever moves off Apps Script.
 */

/** Returns the course shell for a grade: units, lesson titles, standards. No answers. */
function getCourse_(gradeKey) {
  const course = getCurriculum_()[gradeKey];
  if (!course) throw new Error('UNKNOWN_GRADE');
  return course;
}

/** Every lesson in a grade, in teaching order. */
function listLessons_(gradeKey) {
  const course = getCourse_(gradeKey);
  const ordered = [];
  (course.units || []).forEach(function (unit) {
    (unit.lessons || []).forEach(function (lessonId) {
      const lesson = course.lessons[lessonId];
      if (lesson) ordered.push(lesson);
    });
  });
  return ordered;
}

/** The authoritative lesson, answer keys intact. Server-side use only. */
function getLessonAuthoritative_(gradeKey, lessonId) {
  const course = getCourse_(gradeKey);
  const lesson = course.lessons[lessonId];
  if (!lesson) throw new Error('UNKNOWN_LESSON');
  return lesson;
}

/**
 * The student-safe copy of a lesson.
 *
 * This is the only version that ever crosses to a browser. Without the stripping
 * below, a student could open devtools and read every answer straight out of the
 * page payload, which would make the marks meaningless.
 */
function getLessonForStudent_(gradeKey, lessonId) {
  const lesson = getLessonAuthoritative_(gradeKey, lessonId);
  return stripAnswerKey_(lesson);
}

/** Deep-copies a lesson, removing every field that reveals or hints at an answer. */
function stripAnswerKey_(lesson) {
  const copy = JSON.parse(JSON.stringify(lesson));

  if (copy.worksheet && copy.worksheet.questions) {
    copy.worksheet.questions = copy.worksheet.questions.map(function (q) {
      const safe = {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        marks: q.marks,
        standards: q.standards || [],
        hint: q.hint || '',
        // The student needs to know this part is read rather than marked.
        // `lookFor` is deliberately NOT carried over: it is the teacher's guidance.
        autoMarked: q.autoMarked !== false
      };
      if (q.stem) safe.stem = q.stem;

      // Presentation data the student legitimately needs in order to answer.
      if (q.options) {
        safe.options = q.options.map(function (o) { return { id: o.id, text: o.text }; });
      }
      if (q.left)  safe.left  = q.left.map(function (o) { return { id: o.id, text: o.text }; });
      if (q.right) safe.right = q.right.map(function (o) { return { id: o.id, text: o.text }; });
      if (q.items) safe.items = shuffle_(q.items.map(function (o) {
        return { id: o.id, text: o.text };
      }));
      if (q.blanks)      safe.blanks = q.blanks;
      if (q.placeholder) safe.placeholder = q.placeholder;
      if (q.maxLength)   safe.maxLength = q.maxLength;

      return safe;
    });
  }
  return copy;
}

/**
 * Fisher-Yates. Ordering questions ship shuffled, otherwise the items arrive in
 * the correct sequence and the question marks itself.
 */
function shuffle_(array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/**
 * The four strand definitions for a grade, keyed by strand code, each carrying
 * the official Emerging / Proficient / Advanced descriptors.
 *
 * This reads the framework catalogue extracted from ADEK's Scope & Sequence, not
 * anything authored locally — the descriptors a teacher judges against must be
 * ADEK's own wording, verbatim.
 */
function getStandardsIndex_(gradeKey) {
  return (FRAMEWORK.grades && FRAMEWORK.grades[gradeKey]) || {};
}

/** One strand's definition, or null. */
function getStrand_(gradeKey, strandCode) {
  return getStandardsIndex_(gradeKey)[String(strandCode).toUpperCase()] || null;
}

/** The published week-by-week sequence for a grade and track ('main'|'bridging'). */
function getSequence_(gradeKey, track) {
  const seq = (typeof SEQUENCES !== 'undefined' && SEQUENCES[gradeKey]) || {};
  return seq[track] || [];
}

/** Total marks available across a whole grade — the denominator for overall progress. */
function getTotalMarksForGrade_(gradeKey) {
  return listLessons_(gradeKey).reduce(function (sum, lesson) {
    const questions = (lesson.worksheet && lesson.worksheet.questions) || [];
    return sum + questions.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0);
  }, 0);
}

/**
 * Where a lesson sits in the programme.
 *
 * The platform originally showed a running lesson number — "Lesson 17" — which appears
 * nowhere in the curriculum. ADEK organises everything by WEEK, and so does a teacher
 * standing in front of a class. Worse, Weeks 7 to 10 of the Main Course are a single
 * continuous project: Week 9 asks students to judge "your signature solution" against
 * "the criteria the class agreed", both established in Weeks 7 and 8. Opened on its own
 * that reads as though something is missing, because something is — the weeks before it.
 *
 * This supplies the context a lesson needs to make sense of itself.
 */
function lessonContext_(gradeKey, lesson) {
  const track = lesson.track || 'main';
  const sequence = getSequence_(gradeKey, track);
  const course = getCourse_(gradeKey);
  const trackMeta = ((course.meta || {}).tracks || {})[track] || {};

  const entry = sequence.filter(function (w) { return w.weekNumber === lesson.week; })[0];
  const phase = entry && entry.phase ? entry.phase.replace(/\s*\d+$/, '').trim() : '';

  // The weeks that form one continuous piece of work, and what each contributes.
  const ARCS = {
    main: { name: 'Signature Solution', weeks: [7, 8, 9, 10],
            steps: { 7: 'planned it', 8: 'built it', 9: 'refined it', 10: 'showcased it' } },
    bridging: { name: 'Integrated mastery task', weeks: [5, 6],
                steps: { 5: 'designed and built it', 6: 'evaluated and presented it' } }
  };
  const arc = ARCS[track];
  const inArc = arc && arc.weeks.indexOf(lesson.week) !== -1;

  let continuesFrom = '';
  if (inArc) {
    const earlier = arc.weeks.filter(function (w) { return w < lesson.week; });
    if (earlier.length) {
      continuesFrom = 'This continues the ' + arc.name + ' you began in Week ' + earlier[0] +
        '. By now you have ' +
        earlier.map(function (w) { return arc.steps[w]; }).join(', then ') + '.';
    }
  }

  return {
    track: track,
    trackTitle: trackMeta.title || (track === 'bridging' ? 'Bridging Program' : 'Main Course'),
    week: lesson.week,
    weeksTotal: sequence.length || null,
    phase: phase,
    strand: entry ? entry.strand : '',
    arcName: inArc ? arc.name : '',
    arcPosition: inArc ? arc.weeks.indexOf(lesson.week) + 1 : null,
    arcTotal: inArc ? arc.weeks.length : null,
    continuesFrom: continuesFrom
  };
}

/* ==========================================================================
 * Marking.gs
 * ========================================================================== */

/**
 * Auto-marking engine.
 *
 * Marking always happens on the server against the authoritative copy of the
 * content. Answer keys are stripped before any lesson is sent to a browser
 * (see stripAnswerKey_ in Content.gs), so a student cannot read the answers out
 * of the page source, and a crafted request cannot award itself marks — the
 * client only ever submits responses, never scores.
 *
 * Supported question types and how each is credited:
 *
 *   mcq        single correct option           all or nothing
 *   truefalse  a boolean                       all or nothing
 *   multi      several correct options         partial credit, penalised for wrong picks
 *   matching   left/right pairs                partial credit per correct pair
 *   ordering   a correct sequence              partial credit per item in the right place
 *   numeric    a value with a tolerance        all or nothing, tolerance-aware
 *   shortText  accepted answers / keywords     normalised comparison
 *   fillBlank  several short answers in a row  partial credit per blank
 *
 * A question may also set `autoMarked: false`. Much of the published curriculum is
 * open sentence stems — "The data problem is ___. So the model learns ___." —
 * whose quality no mark scheme can judge. Those are captured verbatim, carry no
 * marks, are excluded from the worksheet score entirely, and are surfaced to the
 * teacher as product evidence toward their own judgement.
 *
 * Keyword-matching them instead would hand out marks for using the right
 * vocabulary about the wrong thing, and would put a number where the framework
 * puts a judgement.
 */

/**
 * Marks a full worksheet submission.
 *
 * @param {Object} worksheet Authoritative worksheet definition (with answer keys).
 * @param {Object} answers   Map of questionId -> student response.
 * @return {{marksAwarded:number, marksAvailable:number, percent:number, results:Array}}
 */
function markWorksheet_(worksheet, answers) {
  answers = answers || {};
  const results = [];
  let awarded = 0;
  let available = 0;

  let openResponses = 0;

  (worksheet.questions || []).forEach(function (question) {
    const response = answers[question.id];
    const result = markQuestion_(question, response);
    results.push(result);

    // Open responses contribute to neither side of the fraction, so a worksheet
    // that is mostly open does not report a misleadingly small score.
    if (result.needsTeacherReview) { openResponses++; return; }
    awarded += result.marksAwarded;
    available += result.marksAvailable;
  });

  return {
    marksAwarded: round2_(awarded),
    marksAvailable: round2_(available),
    percent: available > 0 ? round2_((awarded / available) * 100) : 0,
    openResponses: openResponses,
    results: results
  };
}

/** Marks a single question, dispatching on its type. */
function markQuestion_(question, response) {
  const marksAvailable = Number(question.marks) || 0;
  let awarded = 0;

  const answered = response !== undefined && response !== null && response !== '' &&
                   !(Array.isArray(response) && response.length === 0);

  // Captured, never scored. The teacher reads it as evidence.
  if (question.autoMarked === false) {
    return {
      questionId: question.id,
      type: question.type,
      answered: answered,
      correct: false,
      partial: false,
      needsTeacherReview: true,
      marksAwarded: 0,
      marksAvailable: 0,
      standards: question.standards || [],
      frameworkRefs: question.frameworkRefs || [],
      response: answered ? response : null,
      // What the published pack tells a teacher to look for, shown beside the response.
      lookFor: question.lookFor || '',
      feedback: answered
        ? 'Your teacher will read this response.'
        : 'You did not answer this part.',
      modelAnswer: ''
    };
  }

  if (answered) {
    switch (question.type) {
      case 'mcq':       awarded = markChoice_(question, response) * marksAvailable; break;
      case 'truefalse': awarded = markTrueFalse_(question, response) * marksAvailable; break;
      case 'multi':     awarded = markMulti_(question, response) * marksAvailable; break;
      case 'matching':  awarded = markMatching_(question, response) * marksAvailable; break;
      case 'ordering':  awarded = markOrdering_(question, response) * marksAvailable; break;
      case 'numeric':   awarded = markNumeric_(question, response) * marksAvailable; break;
      case 'shortText': awarded = markShortText_(question, response) * marksAvailable; break;
      case 'fillBlank': awarded = markFillBlank_(question, response) * marksAvailable; break;
      default:
        console.warn('Unknown question type "' + question.type + '" on ' + question.id);
        awarded = 0;
    }
  }

  awarded = round2_(Math.max(0, Math.min(awarded, marksAvailable)));
  const fraction = marksAvailable > 0 ? awarded / marksAvailable : 0;

  return {
    questionId: question.id,
    type: question.type,
    answered: answered,
    correct: fraction >= 0.999,
    partial: fraction > 0 && fraction < 0.999,
    marksAwarded: awarded,
    marksAvailable: marksAvailable,
    standards: question.standards || [],
    frameworkRefs: question.frameworkRefs || [],
    needsTeacherReview: false,
    feedback: pickFeedback_(question, fraction, answered),
    // The model answer is released only after marking, so students learn from mistakes.
    modelAnswer: describeAnswer_(question)
  };
}

/* ---------------------------------------------------------------------------
 * Per-type markers. Each returns a fraction of the available marks, 0..1.
 * ------------------------------------------------------------------------- */

function markChoice_(question, response) {
  return String(response).trim() === String(question.answer).trim() ? 1 : 0;
}

function markTrueFalse_(question, response) {
  return toBool_(response) === toBool_(question.answer) ? 1 : 0;
}

/**
 * Multi-select.
 *
 * Credit is (proportion of correct options found) minus (proportion of
 * distractors wrongly selected), floored at zero. Scoring the two proportions
 * against their own totals is what makes ticking every box score exactly zero:
 * it earns 1 for finding them all and loses 1 for taking every distractor.
 *
 * A simpler (hits - misses) / correctCount does not hold that property — with
 * three correct options and two distractors, ticking everything would still pay
 * out a third of the marks for pure guessing.
 */
function markMulti_(question, response) {
  const key = (question.answer || []).map(normaliseKey_);
  const given = (Array.isArray(response) ? response : [response]).map(normaliseKey_);
  if (key.length === 0) return 0;

  const distractorCount = Math.max(0, (question.options || []).length - key.length);
  const unique = given.filter(function (v, i) { return given.indexOf(v) === i; });

  let hits = 0, misses = 0;
  unique.forEach(function (v) {
    if (key.indexOf(v) !== -1) hits++; else misses++;
  });

  // With no distractors there is nothing to wrongly select, so no penalty applies.
  const penalty = distractorCount > 0 ? (misses / distractorCount) : 0;
  return Math.max(0, (hits / key.length) - penalty);
}

/** Matching pairs: response is { leftId: rightId }. Credit per correct pair. */
function markMatching_(question, response) {
  const key = question.answer || {};
  const keys = Object.keys(key);
  if (keys.length === 0) return 0;
  if (typeof response !== 'object' || response === null) return 0;

  let hits = 0;
  keys.forEach(function (leftId) {
    if (normaliseKey_(response[leftId]) === normaliseKey_(key[leftId])) hits++;
  });
  return hits / keys.length;
}

/** Ordering: credit for each item sitting in its correct position. */
function markOrdering_(question, response) {
  const key = (question.answer || []).map(normaliseKey_);
  const given = (Array.isArray(response) ? response : []).map(normaliseKey_);
  if (key.length === 0) return 0;

  let hits = 0;
  for (let i = 0; i < key.length; i++) {
    if (given[i] === key[i]) hits++;
  }
  return hits / key.length;
}

/** Numeric with an inclusive tolerance (absolute, defaults to exact). */
function markNumeric_(question, response) {
  const expected = Number(question.answer);
  const given = Number(String(response).replace(/[, ]/g, ''));
  if (isNaN(given) || isNaN(expected)) return 0;

  const tolerance = Number(question.tolerance) || 0;
  return Math.abs(given - expected) <= tolerance + 1e-9 ? 1 : 0;
}

/**
 * Short free text. Three matching strategies, in order of preference:
 *
 *   acceptedAnswers  normalised exact match against any listed answer
 *   keywordsAll      every listed keyword must appear (credit is all-or-nothing)
 *   keywordsAny      credit scales with how many listed keywords appear
 *
 * Normalisation strips case, punctuation and filler words so that
 * "A computer program!" and "computer program" both match.
 */
function markShortText_(question, response) {
  const text = normaliseText_(response);
  if (!text) return 0;

  if (question.acceptedAnswers && question.acceptedAnswers.length) {
    const matched = question.acceptedAnswers.some(function (accepted) {
      return normaliseText_(accepted) === text;
    });
    if (matched) return 1;
    // Fall through: a longer sentence containing an accepted answer still counts.
    const contained = question.acceptedAnswers.some(function (accepted) {
      const norm = normaliseText_(accepted);
      return norm.length > 2 && text.indexOf(norm) !== -1;
    });
    if (contained) return 1;
  }

  if (question.keywordsAll && question.keywordsAll.length) {
    const all = question.keywordsAll.every(function (kw) {
      return text.indexOf(normaliseText_(kw)) !== -1;
    });
    return all ? 1 : 0;
  }

  if (question.keywordsAny && question.keywordsAny.length) {
    const hits = question.keywordsAny.filter(function (kw) {
      return text.indexOf(normaliseText_(kw)) !== -1;
    }).length;
    const needed = Number(question.keywordsNeeded) || 1;
    return Math.min(1, hits / needed);
  }

  return 0;
}

/** A row of blanks: response is an array, credit per blank filled correctly. */
function markFillBlank_(question, response) {
  const blanks = question.answer || [];
  if (blanks.length === 0) return 0;
  const given = Array.isArray(response) ? response : [response];

  let hits = 0;
  blanks.forEach(function (accepted, i) {
    const options = Array.isArray(accepted) ? accepted : [accepted];
    const answer = normaliseText_(given[i]);
    if (answer && options.some(function (o) { return normaliseText_(o) === answer; })) {
      hits++;
    }
  });
  return hits / blanks.length;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

/** Lowercase, strip punctuation and filler words, collapse whitespace. */
function normaliseText_(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\b(a|an|the|is|are|it|that|this|of|to)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identifier comparison — case and whitespace insensitive, punctuation preserved. */
function normaliseKey_(value) {
  if (value === undefined || value === null) return '';
  return String(value).toLowerCase().trim();
}

function toBool_(value) {
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1' || s === 't';
}

/** Chooses the feedback line a student sees for this question after marking. */
function pickFeedback_(question, fraction, answered) {
  const fb = question.feedback || {};
  if (!answered) return fb.unanswered || 'You did not answer this question.';
  if (fraction >= 0.999) return fb.correct || 'Correct.';
  if (fraction > 0) return fb.partial || fb.incorrect || 'Partly right — check the model answer.';
  return fb.incorrect || 'Not quite — check the model answer.';
}

/** Renders the answer key into something readable for post-submission review. */
function describeAnswer_(question) {
  switch (question.type) {
    case 'mcq': {
      const opt = (question.options || []).filter(function (o) {
        return String(o.id) === String(question.answer);
      })[0];
      return opt ? opt.text : String(question.answer);
    }
    case 'truefalse':
      return toBool_(question.answer) ? 'True' : 'False';
    case 'multi': {
      const byId = {};
      (question.options || []).forEach(function (o) { byId[String(o.id)] = o.text; });
      return (question.answer || []).map(function (id) {
        return byId[String(id)] || id;
      }).join('; ');
    }
    case 'matching': {
      const key = question.answer || {};
      const leftText = {}, rightText = {};
      (question.left || []).forEach(function (o) { leftText[String(o.id)] = o.text; });
      (question.right || []).forEach(function (o) { rightText[String(o.id)] = o.text; });
      return Object.keys(key).map(function (l) {
        return (leftText[l] || l) + ' → ' + (rightText[String(key[l])] || key[l]);
      }).join('; ');
    }
    case 'ordering': {
      const text = {};
      (question.items || []).forEach(function (o) { text[String(o.id)] = o.text; });
      return (question.answer || []).map(function (id, i) {
        return (i + 1) + '. ' + (text[String(id)] || id);
      }).join('  ');
    }
    case 'numeric':
      return String(question.answer) +
        (question.tolerance ? ' (±' + question.tolerance + ')' : '');
    case 'fillBlank':
      return (question.answer || []).map(function (a) {
        return Array.isArray(a) ? a[0] : a;
      }).join(', ');
    case 'shortText':
      return question.modelAnswer ||
        (question.acceptedAnswers || []).join(' / ') ||
        (question.keywordsAll || question.keywordsAny || []).join(', ');
    default:
      return '';
  }
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

/* ==========================================================================
 * Attainment.gs
 * ========================================================================== */

/**
 * Attainment against the ADEK AI Fluency Framework.
 *
 * THE RULE THAT GOVERNS THIS FILE
 * ------------------------------
 * A level is awarded by a teacher, against a written descriptor, from triangulated
 * evidence. It is never computed from marks. ADEK publishes no mark-to-tier
 * conversion for any grade, and inventing one is what would make the school's
 * records indefensible.
 *
 * So there is deliberately no function here that turns a percentage into a level.
 * Worksheet marks appear only as `products` evidence — one of the three sources a
 * judgement must draw on — and are always labelled as such.
 *
 * What this module does do is the arithmetic teachers should not have to: apply
 * each grade's published overall-level decision rule consistently, and roll
 * judgements up across a class.
 */

/**
 * Applies a grade's published decision rule to a set of strand levels.
 *
 * Returns the rule text alongside the level so the teacher view can show WHY a
 * student is at a level — which is what makes the record auditable and the
 * published tie-break cases self-evidently handled.
 *
 * @param {Object} strandLevels e.g. { CU: 'emerging', SD: 'proficient', ... }
 * @param {string} gradeKey     e.g. 'grade6'
 * @return {{level: ?string, label: string, rule: string, reason: ?string}}
 */
function overallLevelFrom_(strandLevels, gradeKey) {
  const config = CONFIG.GRADE_RULES[gradeKey];
  if (!config) {
    return { level: null, label: 'No rule published', rule: '', reason: 'no_rule_for_grade' };
  }

  const strands = CONFIG.STRANDS;
  const missing = strands.filter(function (s) {
    return !strandLevels[s] || LEVEL_ORDINAL[strandLevels[s]] === undefined;
  });

  // An overall level before every strand is judged would be a guess. Say so instead.
  if (missing.length) {
    return {
      level: null,
      label: 'Not yet complete',
      rule: '',
      reason: 'incomplete',
      missingStrands: missing
    };
  }

  const ordinalOf = function (s) { return LEVEL_ORDINAL[strandLevels[s]]; };
  const countAtOrAbove = function (levelKey) {
    return strands.filter(function (s) { return ordinalOf(s) >= LEVEL_ORDINAL[levelKey]; }).length;
  };
  const noneBelow = function (levelKey) {
    return levelKey === null ||
      strands.every(function (s) { return ordinalOf(s) >= LEVEL_ORDINAL[levelKey]; });
  };

  for (let i = 0; i < config.rules.length; i++) {
    const rule = config.rules[i];
    if (countAtOrAbove(rule.atOrAbove.level) >= rule.atOrAbove.count && noneBelow(rule.floor)) {
      const def = levelDef_(rule.level);
      return {
        level: rule.level,
        label: def ? def.label : rule.level,
        color: def ? def.color : null,
        rule: rule.text,
        isExpected: rule.level === config.expectedTier,
        reason: null
      };
    }
  }

  const def = levelDef_('working_towards');
  return {
    level: 'working_towards',
    label: def.label,
    color: def.color,
    rule: 'Does not yet meet the ' + gradeKey.replace('grade', 'Grade ') +
          ' rule for Emerging.',
    isExpected: false,
    reason: null
  };
}

/**
 * Builds a student's strand profile from their judgement rows.
 *
 * Judgements are append-only, so the current picture is the most recent row per
 * strand that nothing supersedes. Earlier rows stay as history — a re-check after
 * bridging should be visible as a change, not erase what came before.
 *
 * @param {string} gradeKey
 * @param {Array}  judgements Rows from the Judgements sheet for one student.
 * @param {string=} assessmentEvent Restrict to one event (e.g. 'final').
 */
function buildStrandProfile_(gradeKey, judgements, assessmentEvent) {
  const relevant = (judgements || []).filter(function (row) {
    if (String(row.scale) !== 'summative_tier') return false;
    if (row.supersededBy) return false;
    if (assessmentEvent && String(row.assessmentEvent) !== assessmentEvent) return false;
    return true;
  });

  const latest = {};
  relevant.forEach(function (row) {
    const strand = String(row.strand || '').toUpperCase();
    if (CONFIG.STRANDS.indexOf(strand) === -1) return;
    const at = row.judgedAt ? new Date(row.judgedAt).getTime() : 0;
    if (!latest[strand] || at >= latest[strand]._at) {
      latest[strand] = { row: row, _at: at };
    }
  });

  const standardsIndex = getStandardsIndex_(gradeKey);
  const strandLevels = {};

  const byStrand = CONFIG.STRANDS.map(function (strand) {
    const entry = latest[strand];
    const definition = standardsIndex[strand] || {};
    if (entry) strandLevels[strand] = String(entry.row.level);

    const sources = entry ? [
      entry.row.evidenceProducts ? 'products' : null,
      entry.row.evidenceObservations ? 'observations' : null,
      entry.row.evidenceConversations ? 'conversations' : null
    ].filter(Boolean) : [];

    const levelKey = entry ? String(entry.row.level) : null;
    const def = levelKey ? levelDef_(levelKey) : null;

    return {
      strand: strand,
      label: definition.label || strand,
      descriptors: definition.tiers || null,
      level: levelKey,
      levelLabel: def ? def.label : 'Not yet judged',
      levelColor: def ? def.color : null,
      judged: !!entry,
      note: entry ? String(entry.row.note || '') : '',
      nextStep: entry ? String(entry.row.nextStep || '') : '',
      accessArrangements: entry ? String(entry.row.accessArrangements || '') : '',
      frameworkRefs: entry ? String(entry.row.frameworkRefs || '') : '',
      judgedBy: entry ? String(entry.row.judgedBy || '') : '',
      judgedAt: entry ? entry.row.judgedAt : null,
      evidenceSources: sources,
      // ADEK requires three sources. Flag a thin judgement rather than blocking it.
      singleSource: entry ? sources.length < 2 : false,
      missingSources: entry
        ? CONFIG.EVIDENCE_SOURCES
            .map(function (s) { return s.key; })
            .filter(function (k) { return sources.indexOf(k) === -1; })
        : []
    };
  });

  return {
    byStrand: byStrand,
    overall: overallLevelFrom_(strandLevels, gradeKey),
    expectedTier: (CONFIG.GRADE_RULES[gradeKey] || {}).expectedTier || null,
    judgedCount: byStrand.filter(function (s) { return s.judged; }).length,
    strandsTotal: CONFIG.STRANDS.length
  };
}

/**
 * Summarises worksheet marks as PRODUCT evidence for a strand.
 *
 * This deliberately returns no level and no band. It answers "what has this
 * student produced that bears on this strand", which is what a teacher needs in
 * front of them while judging — not "what level are they".
 *
 * `bestOfAttempts` is surfaced because a correct third attempt is not evidence of
 * independence, which the moderation guidance names as a pitfall.
 */
function worksheetEvidenceByStrand_(gradeKey, submissions) {
  const totals = {};
  CONFIG.STRANDS.forEach(function (s) {
    totals[s] = { marksAwarded: 0, marksAvailable: 0, items: 0, lessons: {}, maxAttempt: 0 };
  });

  (submissions || []).forEach(function (submission) {
    let results;
    try {
      results = JSON.parse(submission.resultsJson || '[]');
    } catch (err) {
      console.warn('Unparseable resultsJson for ' + submission.lessonId);
      return;
    }
    const attempt = Number(submission.attempt) || 1;

    results.forEach(function (result) {
      strandsOfResult_(result).forEach(function (strand) {
        if (!totals[strand]) return;
        totals[strand].marksAwarded += Number(result.marksAwarded) || 0;
        totals[strand].marksAvailable += Number(result.marksAvailable) || 0;
        totals[strand].items += 1;
        totals[strand].lessons[submission.lessonId] = true;
        totals[strand].maxAttempt = Math.max(totals[strand].maxAttempt, attempt);
      });
    });
  });

  return CONFIG.STRANDS.map(function (strand) {
    const t = totals[strand];
    return {
      strand: strand,
      evidenceType: 'products',
      marksAwarded: round2_(t.marksAwarded),
      marksAvailable: round2_(t.marksAvailable),
      // A score on the worksheet, not an attainment figure. Named so it reads that way.
      worksheetScore: t.marksAvailable > 0
        ? round2_((t.marksAwarded / t.marksAvailable) * 100) : null,
      itemsMarked: t.items,
      lessonsCovered: Object.keys(t.lessons).length,
      highestAttemptUsed: t.maxAttempt,
      notIndependent: t.maxAttempt > 1
    };
  });
}

/** Reads the strand code(s) a marked result bears on, tolerating both tag shapes. */
function strandsOfResult_(result) {
  const refs = result.frameworkRefs || result.standards || [];
  const out = [];
  (Array.isArray(refs) ? refs : [refs]).forEach(function (ref) {
    const code = typeof ref === 'string' ? ref : (ref && ref.code) || '';
    const strand = typeof ref === 'object' && ref && ref.strand
      ? String(ref.strand).toUpperCase()
      : (/AIF·([A-Z]{2})·/.exec(String(code)) || [, ''])[1];
    if (strand && out.indexOf(strand) === -1) out.push(strand);
  });
  return out;
}

/**
 * Class rollup: for each strand, how many students sit at each level.
 *
 * This replaces the old cohort-average-then-band, which averaged marks across
 * students and strands and banded the result — a halo by construction, and the
 * pitfall the moderation guidance names first. A count per level is what actually
 * tells a teacher which strand to reteach.
 */
function computeClassProfile_(gradeKey, studentProfiles) {
  const standardsIndex = getStandardsIndex_(gradeKey);

  const byStrand = CONFIG.STRANDS.map(function (strand) {
    const counts = {};
    CONFIG.ATTAINMENT_LEVELS.forEach(function (l) { counts[l.key] = 0; });
    let notJudged = 0;

    studentProfiles.forEach(function (student) {
      const row = (student.profile.byStrand || []).filter(function (r) {
        return r.strand === strand;
      })[0];
      if (!row || !row.judged) { notJudged++; return; }
      if (counts[row.level] !== undefined) counts[row.level]++;
    });

    const definition = standardsIndex[strand] || {};
    return {
      strand: strand,
      label: definition.label || strand,
      descriptors: definition.tiers || null,
      notJudged: notJudged,
      distribution: CONFIG.ATTAINMENT_LEVELS.map(function (l) {
        return { level: l.key, label: l.label, color: l.color, count: counts[l.key] };
      })
    };
  });

  const overallCounts = {};
  CONFIG.ATTAINMENT_LEVELS.forEach(function (l) { overallCounts[l.key] = 0; });
  let incomplete = 0;

  studentProfiles.forEach(function (student) {
    const level = student.profile.overall.level;
    if (!level) incomplete++;
    else if (overallCounts[level] !== undefined) overallCounts[level]++;
  });

  return {
    byStrand: byStrand,
    overall: {
      incomplete: incomplete,
      distribution: CONFIG.ATTAINMENT_LEVELS.map(function (l) {
        return { level: l.key, label: l.label, color: l.color, count: overallCounts[l.key] };
      })
    },
    expectedTier: (CONFIG.GRADE_RULES[gradeKey] || {}).expectedTier || null
  };
}

// round2_ lives in Marking.gs; Apps Script shares one global scope across files.

/**
 * Proposes a level per strand from the auto-marked evidence.
 *
 * A PROPOSAL, never a judgement. ADEK awards levels by matching performance to a written
 * descriptor and publishes no conversion from marks; this mapping is the school's own,
 * adopted so that no staff time goes on correcting. A teacher confirms it in a short
 * conversation before it is recorded, and the record keeps which of the two happened.
 *
 * Returns nothing for a strand with too little marked work behind it — an unsupported
 * suggestion is worse than none, because it looks equally confident.
 */
function suggestLevelsFromEvidence_(gradeKey, submissions) {
  const evidence = worksheetEvidenceByStrand_(gradeKey, submissions);
  const standardsIndex = getStandardsIndex_(gradeKey);

  return evidence.map(function (row) {
    const enough = row.itemsMarked >= CONFIG.SUGGESTION_MIN_ITEMS && row.marksAvailable > 0;
    const percent = row.worksheetScore;

    let suggested = null;
    if (enough && percent !== null) {
      const band = CONFIG.SUGGESTION_THRESHOLDS.filter(function (t) {
        return percent >= t.min;
      })[0];
      suggested = band ? band.level : 'working_towards';
    }
    const def = suggested ? levelDef_(suggested) : null;
    const definition = standardsIndex[row.strand] || {};

    return {
      strand: row.strand,
      label: definition.label || row.strand,
      suggested: suggested,
      suggestedLabel: def ? def.label : null,
      suggestedColor: def ? def.color : null,
      percent: percent,
      itemsMarked: row.itemsMarked,
      marksAwarded: row.marksAwarded,
      marksAvailable: row.marksAvailable,
      enoughEvidence: enough,
      // Surfaced so a teacher can see when a score came from repeated attempts.
      notIndependent: row.notIndependent,
      reason: !enough
        ? 'Only ' + row.itemsMarked + ' marked item(s) so far \u2014 too little to suggest from.'
        : Math.round(percent) + '% across ' + row.itemsMarked + ' marked items.'
    };
  });
}

/** Interview prompts for a strand, pitched at each tier so the answer places the student. */
function interviewPrompts_(gradeKey, strandCode) {
  const strand = getStrand_(gradeKey, strandCode);
  if (!strand) return [];
  const prompts = (INTERVIEW_PROMPTS[gradeKey] || {})[strandCode] || {};

  return CONFIG.ATTAINMENT_LEVELS.filter(function (l) { return l.isTier; }).map(function (level) {
    return {
      level: level.key,
      levelLabel: level.label,
      descriptor: strand.tiers[level.key].descriptor,
      ask: prompts[level.key] || ''
    };
  });
}

/* ==========================================================================
 * Api.gs
 * ========================================================================== */

/**
 * Client-callable API.
 *
 * Everything the browser can invoke lives here and nowhere else. Each endpoint
 * re-resolves the caller from the Google session rather than trusting anything
 * sent by the page, so a student cannot ask for another student's data by
 * editing a request.
 *
 * Every function returns an envelope — { ok: true, data } or { ok: false, error } —
 * because google.script.run's failure handler loses stack detail, and a student
 * mid-worksheet needs a usable message rather than a silent failure.
 */

/**
 * Makes a value safe to send across google.script.run.
 *
 * The client boundary accepts primitives, plain objects and arrays — and nothing else.
 * A Date anywhere in the payload makes the ENTIRE reply arrive as undefined, silently:
 * no exception, no entry in the execution log, and the browser's success handler simply
 * receives nothing. It is invisible from the server too, because JSON.stringify handles
 * Dates perfectly well, so a payload can serialise fine in the editor and still vanish
 * in transit.
 *
 * That is what broke Class Tracking and Admin: both read sheets that hold timestamps, and
 * both only started failing once those sheets had rows in them. Endpoints that returned
 * no Dates kept working, which made it look like a permissions problem.
 *
 * Dates become ISO strings, which the UI already parses. undefined becomes null, since it
 * is dropped in transit and a missing key is harder to reason about than an explicit null.
 */
function toClientSafe_(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toClientSafe_);
  }
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(function (key) {
      out[key] = toClientSafe_(value[key]);
    });
    return out;
  }
  if (typeof value === 'number' && !isFinite(value)) return null;
  return value;
}

/** Wraps an endpoint with auth, error handling and a consistent envelope. */
function handle_(fn) {
  try {
    const user = getCurrentUser();
    // Every reply goes through this. Individual endpoints must not have to remember.
    return { ok: true, data: toClientSafe_(fn(user)) };
  } catch (err) {
    const code = err && err.message ? err.message : 'UNKNOWN';
    console.error(code + (err && err.stack ? '\n' + err.stack : ''));
    return { ok: false, error: code, message: friendlyError_(code) };
  }
}

function friendlyError_(code) {
  switch (code) {
    case 'NOT_SIGNED_IN':
      return 'We could not confirm your Google sign-in. Close the tab and open the link again.';
    case 'DOMAIN_NOT_ALLOWED':
      return 'This platform is only available to AISA accounts. Please sign in with your @' +
             CONFIG.ALLOWED_DOMAIN + ' account.';
    case 'FORBIDDEN':
      return 'You do not have permission to view that.';
    case 'BUSY':
      return 'The system is handling a lot of submissions right now. Please try again in a moment.';
    case 'LOCK_UNAVAILABLE':
      return 'The system could not save safely just now. Please try again; tell your teacher ' +
             'if it keeps happening.';
    case 'UNKNOWN_LESSON':
      return 'That lesson could not be found.';
    case 'MAX_ATTEMPTS_REACHED':
      return 'You have used all your attempts at this worksheet.';
    case 'INVALID_STRAND':
      return 'That is not one of the four framework strands.';
    case 'INVALID_LEVEL':
      return 'That is not a valid attainment level.';
    case 'NOTHING_TO_RECORD':
      return 'No levels were chosen, so nothing was recorded.';
    default:
      return 'Something went wrong. Please tell your teacher if this keeps happening.';
  }
}

/* ---------------------------------------------------------------------------
 * Student endpoints
 * ------------------------------------------------------------------------- */

/** Everything the app needs on first paint: who you are, your course, your progress. */
function api_getBootstrap() {
  return handle_(function (user) {
    const gradeKey = gradeKeyFor_(user);
    const course = getCourse_(gradeKey);
    const lessons = listLessons_(gradeKey);
    const best = bestSubmissionsByLesson_(user.email);

    const lessonCards = lessons.map(function (lesson) {
      const submission = best[lesson.id];
      return {
        id: lesson.id,
        number: lesson.number,
        type: lesson.type,
        track: lesson.track || 'main',
        week: lesson.week || null,
        title: lesson.title,
        summary: lesson.summary || '',
        duration: lesson.duration || '',
        context: lessonContext_(gradeKey, lesson),
        marksAvailable: worksheetTotal_(lesson),
        attempts: countAttempts_(user.email, lesson.id),
        maxAttempts: CONFIG.MAX_ATTEMPTS,
        // Status reflects what the student DID, not whether an outcome was secured.
        // Only a teacher can judge the latter, so nothing here implies a pass.
        status: submission ? 'submitted' : 'not-started',
        worksheetScore: submission ? Number(submission.percent) : null,
        marksAwarded: submission ? Number(submission.marksAwarded) : null
      };
    });

    return {
      user: user,
      app: {
        name: CONFIG.APP_NAME,
        school: CONFIG.SCHOOL_NAME,
        domain: CONFIG.ALLOWED_DOMAIN,
        switchAccountUrl: switchAccountUrl_()
      },
      course: { key: gradeKey, title: course.meta.title, grade: course.meta.grade,
                tracks: (course.meta || {}).tracks || {} },
      units: (course.units || []).map(function (unit) {
        return { id: unit.id, title: unit.title, summary: unit.summary || '',
                 track: unit.track || 'main', week: unit.week, lessons: unit.lessons };
      }),
      lessons: lessonCards,
      levels: CONFIG.ATTAINMENT_LEVELS,
      profile: buildStrandProfile_(gradeKey, judgementsFor_(user.email))
    };
  });
}

/** Lesson content for study. Answer keys are stripped before this leaves the server. */
function api_getLesson(lessonId) {
  return handle_(function (user) {
    const gradeKey = gradeKeyFor_(user);
    const lesson = getLessonForStudent_(gradeKey, String(lessonId));
    const attempts = countAttempts_(user.email, lesson.id);
    const best = bestSubmissionsByLesson_(user.email)[lesson.id] || null;

    markLessonStarted_(user.email, lesson);

    return {
      lesson: lesson,
      context: lessonContext_(gradeKey, lesson),
      attempts: attempts,
      maxAttempts: CONFIG.MAX_ATTEMPTS,
      canAttempt: attempts < CONFIG.MAX_ATTEMPTS,
      best: best ? {
        worksheetScore: Number(best.percent),
        marksAwarded: Number(best.marksAwarded),
        marksAvailable: Number(best.marksAvailable),
        submittedAt: best.submittedAt,
        results: safeParse_(best.resultsJson, []),
        answers: safeParse_(best.answersJson, {})
      } : null
    };
  });
}

/**
 * Marks a worksheet and records the attempt.
 *
 * The client sends only its answers. Scoring happens here against the
 * authoritative content, so the marks stored are ones this server computed.
 *
 * Deliberately returns no pass/fail: the marks are product evidence toward a
 * judgement a teacher will make, and telling a student they "passed" would
 * assert an outcome nobody has yet assessed.
 */
function api_submitWorksheet(lessonId, answers) {
  return handle_(function (user) {
    const gradeKey = gradeKeyFor_(user);
    const lesson = getLessonAuthoritative_(gradeKey, String(lessonId));

    return withLock_(function () {
      const attempts = countAttempts_(user.email, lesson.id);
      if (attempts >= CONFIG.MAX_ATTEMPTS) throw new Error('MAX_ATTEMPTS_REACHED');

      const marked = markWorksheet_(lesson.worksheet || { questions: [] }, answers || {});
      const now = new Date();

      appendRow_('SUBMISSIONS', {
        email: user.email,
        lessonId: lesson.id,
        track: lesson.track || 'main',
        attempt: attempts + 1,
        submittedAt: now,
        marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        percent: marked.percent,
        answersJson: JSON.stringify(answers || {}),
        resultsJson: JSON.stringify(marked.results)
      });

      recordProgress_(user.email, lesson, 'submitted', now);
      logAudit_(user.email, 'SUBMIT', lesson.id + ' attempt ' + (attempts + 1) +
                ' scored ' + marked.percent + '%');

      return {
        worksheetScore: marked.percent,
        marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        results: marked.results,
        attempt: attempts + 1,
        attemptsRemaining: CONFIG.MAX_ATTEMPTS - (attempts + 1)
      };
    });
  });
}

/** The student's own strand profile and worksheet history. */
function api_getMyResults() {
  return handle_(function (user) {
    const gradeKey = gradeKeyFor_(user);
    const best = bestSubmissionsByLesson_(user.email);
    return {
      profile: buildStrandProfile_(gradeKey, judgementsFor_(user.email)),
      evidence: worksheetEvidenceByStrand_(gradeKey, valuesOf_(best)),
      levels: CONFIG.ATTAINMENT_LEVELS,
      lessons: listLessons_(gradeKey).map(function (lesson) {
        const s = best[lesson.id];
        return {
          id: lesson.id, number: lesson.number, title: lesson.title,
          type: lesson.type, track: lesson.track || 'main',
          worksheetScore: s ? Number(s.percent) : null,
          marksAwarded: s ? Number(s.marksAwarded) : null,
          marksAvailable: worksheetTotal_(lesson),
          submittedAt: s ? s.submittedAt : null
        };
      })
    };
  });
}

/* ---------------------------------------------------------------------------
 * Teacher endpoints
 * ------------------------------------------------------------------------- */

/** Cohort overview: one strand profile per student. No averages, no bands. */
function api_getClassOverview(className) {
  return handle_(function (user) {
    requireStaff_(user);
    const gradeKey = 'grade6';
    const roster = readSheetObjects_(SHEETS.ROSTER, true).filter(function (r) {
      if (String(r.active).toLowerCase() === 'false') return false;
      return !className || String(r.className) === String(className);
    });

    const judgementsByEmail = groupBy_(readSheetObjects_(SHEETS.JUDGEMENTS), function (row) {
      return String(row.email || '').toLowerCase().trim();
    });
    const submissionsByEmail = groupBy_(readSheetObjects_(SHEETS.SUBMISSIONS), function (row) {
      return String(row.email || '').toLowerCase().trim();
    });

    const students = roster.map(function (entry) {
      const email = String(entry.email || '').toLowerCase().trim();
      const rows = submissionsByEmail[email] || [];
      return {
        email: email,
        displayName: entry.displayName || deriveNameFromEmail_(email),
        className: entry.className || '',
        bridgingStrands: parseStrandList_(entry.bridgingStrands),
        profile: buildStrandProfile_(gradeKey, judgementsByEmail[email] || []),
        worksheetsSubmitted: distinct_(rows.map(function (r) { return r.lessonId; })).length,
        lastActive: latestDate_(rows)
      };
    });

    return {
      students: students,
      classProfile: computeClassProfile_(gradeKey, students),
      levels: CONFIG.ATTAINMENT_LEVELS,
      strands: getStandardsIndex_(gradeKey),
      expectedTier: (CONFIG.GRADE_RULES[gradeKey] || {}).expectedTier || null,
      lessonsTotal: listLessons_(gradeKey).length,
      classes: distinct_(readSheetObjects_(SHEETS.ROSTER, true).map(function (r) {
        return r.className;
      })).filter(Boolean)
    };
  });
}

/**
 * Everything a teacher needs to judge one student: the ADEK descriptors verbatim,
 * the current judgement if any, and the evidence gathered so far, each labelled
 * with which of the three sources it is.
 */
function api_getStudentDetail(email) {
  return handle_(function (user) {
    requireStaff_(user);
    const target = normaliseEmail_(email);
    const gradeKey = 'grade6';

    const submissions = readSheetObjects_(SHEETS.SUBMISSIONS).filter(function (row) {
      return normaliseEmail_(row.email) === target;
    });
    const judgements = judgementsFor_(target);
    const best = bestByLesson_(submissions);
    const rosterEntry = findRosterEntry_(target);
    logAudit_(user.email, 'VIEW_STUDENT', target);

    return {
      student: {
        email: target,
        displayName: (rosterEntry && rosterEntry.displayName) || deriveNameFromEmail_(target),
        className: (rosterEntry && rosterEntry.className) || '',
        bridgingStrands: parseStrandList_(rosterEntry && rosterEntry.bridgingStrands)
      },
      profile: buildStrandProfile_(gradeKey, judgements),
      evidence: worksheetEvidenceByStrand_(gradeKey, valuesOf_(best)),
      // A proposal from the marked work, for a teacher to confirm or override.
      suggestions: suggestLevelsFromEvidence_(gradeKey, valuesOf_(best)),
      interview: CONFIG.STRANDS.reduce(function (acc, code) {
        acc[code] = interviewPrompts_(gradeKey, code);
        return acc;
      }, {}),
      levels: CONFIG.ATTAINMENT_LEVELS,
      evidenceSources: CONFIG.EVIDENCE_SOURCES,
      history: judgements
        .filter(function (j) { return String(j.scale) === 'summative_tier'; })
        .map(stripRowMeta_)
        .sort(function (a, b) { return new Date(b.judgedAt) - new Date(a.judgedAt); }),
      readiness: readSheetObjects_(SHEETS.READINESS)
        .filter(function (r) { return normaliseEmail_(r.email) === target; })
        .map(stripRowMeta_),
      lessons: listLessons_(gradeKey).map(function (lesson) {
        const s = best[lesson.id];
        return {
          id: lesson.id, number: lesson.number, title: lesson.title,
          type: lesson.type, track: lesson.track || 'main', strand: lesson.strand || null,
          marksAvailable: worksheetTotal_(lesson),
          worksheetScore: s ? Number(s.percent) : null,
          marksAwarded: s ? Number(s.marksAwarded) : null,
          submittedAt: s ? s.submittedAt : null,
          attempts: submissions.filter(function (r) { return r.lessonId === lesson.id; }).length,
          results: s ? attachTeacherGuidance_(gradeKey, lesson.id, safeParse_(s.resultsJson, [])) : []
        };
      })
    };
  });
}

/** Turns whatever the client called the grade into a curriculum key. */
function gradeKeyOf_(grade) {
  return 'grade' + (String(grade || '6').replace(/[^0-9]/g, '') || '6');
}

/**
 * Checks one judgement and puts it in the shape the sheet wants.
 *
 * Kept separate from writing it so the confirmation panel can check all four strands
 * BEFORE it writes any of them. Sheets have no transaction to roll back, so validating
 * first is the only way a rejected fourth strand does not leave three already recorded
 * and the teacher told the whole thing failed.
 *
 * Throws on anything invalid; callers are inside handle_, which turns the throw into a
 * message the teacher actually sees.
 */
function normaliseJudgement_(payload) {
  payload = payload || {};

  const target = normaliseEmail_(payload.email);
  if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

  const strand = String(payload.strand || '').toUpperCase();
  if (CONFIG.STRANDS.indexOf(strand) === -1) throw new Error('INVALID_STRAND');

  const level = String(payload.level || '');
  if (CONFIG.SCALES.summative_tier.indexOf(level) === -1) throw new Error('INVALID_LEVEL');

  const gradeKey = gradeKeyOf_(payload.grade);
  const strandDef = getStrand_(gradeKey, strand);

  return {
    target: target,
    strand: strand,
    level: level,
    gradeKey: gradeKey,
    track: payload.track === 'bridging' ? 'bridging' : 'main',
    event: String(payload.assessmentEvent || 'final'),
    frameworkRefs: strandDef
      ? strandDef.tiers[level === 'working_towards' ? 'emerging' : level].code : '',
    source: String(payload.source || 'teacher'),
    suggestedLevel: String(payload.suggestedLevel || ''),
    evidenceProducts: String(payload.evidenceProducts || ''),
    evidenceObservations: String(payload.evidenceObservations || ''),
    evidenceConversations: String(payload.evidenceConversations || ''),
    note: String(payload.note || ''),
    accessArrangements: String(payload.accessArrangements || ''),
    nextStep: String(payload.nextStep || ''),
    bridgingRef: String(payload.bridgingRef || '')
  };
}

/**
 * Writes one validated judgement, superseding whatever currently stands for that strand.
 *
 * Assumes the caller has checked staff access and holds the script lock, so confirming
 * four strands costs one lock rather than four.
 */
function writeJudgement_(user, j) {
  const id = Utilities.getUuid();
  const existing = judgementsFor_(j.target).filter(function (row) {
    return String(row.strand).toUpperCase() === j.strand &&
           String(row.scale) === 'summative_tier' &&
           String(row.assessmentEvent) === j.event &&
           !row.supersededBy;
  });
  existing.forEach(function (row) {
    const updated = stripRowMeta_(row);
    updated.supersededBy = id;
    updateRow_('JUDGEMENTS', row._rowIndex, updated);
  });

  appendRow_('JUDGEMENTS', {
    id: id,
    email: j.target,
    grade: j.gradeKey.replace('grade', ''),
    track: j.track,
    strand: j.strand,
    level: j.level,
    scale: 'summative_tier',
    assessmentEvent: j.event,
    frameworkRefs: j.frameworkRefs,
    // Provenance. A record that hides how a level was reached is not defensible.
    source: j.source,
    suggestedLevel: j.suggestedLevel,
    evidenceProducts: j.evidenceProducts,
    evidenceObservations: j.evidenceObservations,
    evidenceConversations: j.evidenceConversations,
    note: j.note,
    accessArrangements: j.accessArrangements,
    nextStep: j.nextStep,
    bridgingRef: j.bridgingRef,
    judgedBy: user.email,
    judgedAt: new Date(),
    supersededBy: ''
  });

  return id;
}

/**
 * Records a teacher's judgement of one strand.
 *
 * Append-only: a re-check after bridging supersedes the earlier row rather than
 * overwriting it, so the record shows the change. Nothing here derives a level —
 * the level arrives from the teacher.
 */
function api_recordJudgement(payload) {
  return handle_(function (user) {
    requireStaff_(user);
    const j = normaliseJudgement_(payload);
    return withLock_(function () {
      writeJudgement_(user, j);
      logAudit_(user.email, 'JUDGE', j.target + ' ' + j.strand + ' -> ' + j.level);
      return buildStrandProfile_(j.gradeKey, judgementsFor_(j.target));
    });
  });
}

/**
 * Confirms suggested levels for several strands in one go.
 *
 * The teacher has just had the conversation; this is the click at the end of it. Each
 * strand still becomes its own judgement row, marked as a confirmed suggestion rather
 * than an independent judgement, so the record shows what actually happened.
 *
 * All four are checked before any is written, and all four are written under one lock.
 * A panel that reported four levels recorded when two were written would put wrong
 * attainment in front of the next person to open the student.
 */
function api_confirmSuggestions(payload) {
  return handle_(function (user) {
    requireStaff_(user);
    payload = payload || {};
    const target = normaliseEmail_(payload.email);
    if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

    const decisions = payload.decisions || {};
    const gradeKey = gradeKeyOf_(payload.grade);

    // Check everything first. A throw here has written nothing.
    const pending = CONFIG.STRANDS.map(function (strand) {
      const decision = decisions[strand];
      if (!decision || !decision.level) return null;
      return normaliseJudgement_({
        email: target,
        grade: payload.grade || '6',
        track: payload.track,
        strand: strand,
        level: decision.level,
        assessmentEvent: payload.assessmentEvent || 'final',
        source: decision.level === decision.suggested ? 'suggestion_confirmed' : 'teacher_override',
        suggestedLevel: decision.suggested || '',
        evidenceProducts: decision.evidenceProducts || 'Auto-marked worksheets',
        evidenceConversations: decision.evidenceConversations || '',
        evidenceObservations: decision.evidenceObservations || '',
        note: decision.note || '',
        nextStep: decision.nextStep || ''
      });
    }).filter(Boolean);

    if (!pending.length) throw new Error('NOTHING_TO_RECORD');

    return withLock_(function () {
      pending.forEach(function (j) { writeJudgement_(user, j); });
      logAudit_(user.email, 'CONFIRM_SUGGESTIONS', target + ' ' +
        pending.map(function (j) { return j.strand; }).join(','));
      return buildStrandProfile_(gradeKey, judgementsFor_(target));
    });
  });
}

/** Records a start-of-year diagnostic result for one strand. */
function api_recordReadiness(payload) {
  return handle_(function (user) {
    requireStaff_(user);
    payload = payload || {};
    const target = normaliseEmail_(payload.email);
    if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

    const strand = String(payload.strand || '').toUpperCase();
    if (CONFIG.STRANDS.indexOf(strand) === -1) throw new Error('INVALID_STRAND');

    const result = String(payload.result || '');
    if (CONFIG.SCALES.bridging_readiness.indexOf(result) === -1) throw new Error('INVALID_LEVEL');

    withLock_(function () {
      appendRow_('READINESS', {
        email: target,
        grade: String(payload.grade || '6'),
        strand: strand,
        probeCode: String(payload.probeCode || ''),
        result: result,
        action: String(payload.action || ''),
        recheckAfterWeek: String(payload.recheckAfterWeek || ''),
        recordedBy: user.email,
        recordedAt: new Date()
      });
    });

    logAudit_(user.email, 'READINESS', target + ' ' + strand + ' = ' + result);
    return { email: target, strand: strand, result: result };
  });
}

/**
 * The cohort as ADEK's observation record, field for field.
 *
 * This is the artefact that leaves the building, so it carries levels and notes
 * rather than scores, and names the decision rule that produced each overall.
 */
function api_exportCsv() {
  return handle_(function (user) {
    requireStaff_(user);
    const gradeKey = 'grade6';
    const roster = readSheetObjects_(SHEETS.ROSTER, true);
    const judgementsByEmail = groupBy_(readSheetObjects_(SHEETS.JUDGEMENTS), function (r) {
      return normaliseEmail_(r.email);
    });
    const strands = getStandardsIndex_(gradeKey);

    const header = ['Email', 'Name', 'Class'];
    CONFIG.STRANDS.forEach(function (s) {
      header.push((strands[s] ? strands[s].label : s), s + ' note');
    });
    header.push('Overall level', 'Decision rule', 'How levels were set',
                'Access arrangements', 'Next step', 'Judged by', 'Judged at');

    const rows = roster.map(function (entry) {
      const email = normaliseEmail_(entry.email);
      const profile = buildStrandProfile_(gradeKey, judgementsByEmail[email] || []);
      const row = [email, entry.displayName || '', entry.className || ''];

      CONFIG.STRANDS.forEach(function (code) {
        const s = profile.byStrand.filter(function (r) { return r.strand === code; })[0];
        row.push(s && s.judged ? s.levelLabel : '', s ? s.note : '');
      });

      const judged = profile.byStrand.filter(function (s) { return s.judged; });
      row.push(profile.overall.level ? profile.overall.label : 'Not yet complete');
      row.push(profile.overall.rule || '');
      row.push(describeSources_(judgementsByEmail[email] || []));
      row.push(judged.map(function (s) { return s.accessArrangements; }).filter(Boolean)[0] || '');
      row.push(judged.map(function (s) { return s.nextStep; }).filter(Boolean).join('; '));
      row.push(judged.map(function (s) { return s.judgedBy; }).filter(Boolean)[0] || '');
      row.push(judged.map(function (s) { return s.judgedAt; }).filter(Boolean)[0] || '');
      return row;
    });

    logAudit_(user.email, 'EXPORT_CSV', rows.length + ' students');
    return { csv: [header].concat(rows).map(toCsvLine_).join('\n') };
  });
}

/* ---------------------------------------------------------------------------
 * Admin endpoints
 * ------------------------------------------------------------------------- */

function api_getAdminData() {
  return handle_(function (user) {
    requireAdmin_(user);
    return {
      roster: readSheetObjects_(SHEETS.ROSTER).map(stripRowMeta_),
      staff: readSheetObjects_(SHEETS.STAFF).map(stripRowMeta_),
      spreadsheetUrl: getSpreadsheet_().getUrl(),
      audit: readSheetObjects_(SHEETS.AUDIT).slice(-100).reverse().map(stripRowMeta_)
    };
  });
}

/** Adds or updates roster entries from pasted text: one "email, name, class" per line. */
function api_importRoster(text) {
  return handle_(function (user) {
    requireAdmin_(user);
    const lines = String(text || '').split(/\r?\n/)
      .map(function (l) { return l.trim(); })
      .filter(Boolean);

    const existing = readSheetObjects_(SHEETS.ROSTER);
    const indexByEmail = {};
    existing.forEach(function (r) { indexByEmail[normaliseEmail_(r.email)] = r; });

    let added = 0, updated = 0;
    const rejected = [];

    withLock_(function () {
      lines.forEach(function (line) {
        const parts = line.split(/\s*,\s*/);
        const email = normaliseEmail_(parts[0]);

        if (!email || !isAllowedDomain_(email)) {
          rejected.push(line + '  — not an @' + CONFIG.ALLOWED_DOMAIN + ' address');
          return;
        }
        const previous = indexByEmail[email];
        const row = {
          email: email,
          displayName: parts[1] || deriveNameFromEmail_(email),
          grade: parts[3] || '6',
          className: parts[2] || '',
          active: true,
          // Preserve per-strand bridging routing across a re-import.
          bridgingStrands: previous ? (previous.bridgingStrands || '') : ''
        };

        if (previous) { updateRow_('ROSTER', previous._rowIndex, row); updated++; }
        else { appendRow_('ROSTER', row); added++; }
      });
    });

    logAudit_(user.email, 'IMPORT_ROSTER', added + ' added, ' + updated + ' updated');
    return { added: added, updated: updated, rejected: rejected };
  });
}

/** Grants or revokes a staff role. Admin only. */
function api_setStaffRole(email, role) {
  return handle_(function (user) {
    requireAdmin_(user);
    const target = normaliseEmail_(email);
    if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

    const valid = [ROLES.STUDENT, ROLES.TEACHER, ROLES.ADMIN];
    const newRole = String(role || '').toLowerCase().trim();
    if (valid.indexOf(newRole) === -1) throw new Error('INVALID_ROLE');

    withLock_(function () {
      const match = readSheetObjects_(SHEETS.STAFF).filter(function (r) {
        return normaliseEmail_(r.email) === target;
      })[0];

      const row = {
        email: target, role: newRole, displayName: deriveNameFromEmail_(target),
        addedAt: new Date(), addedBy: user.email
      };
      if (match) updateRow_('STAFF', match._rowIndex, row);
      else appendRow_('STAFF', row);
    });

    invalidateCache_(SHEETS.STAFF);
    logAudit_(user.email, 'SET_ROLE', target + ' -> ' + newRole);
    return { email: target, role: newRole };
  });
}

/* ---------------------------------------------------------------------------
 * Internal helpers
 * ------------------------------------------------------------------------- */

/**
 * Re-attaches the question prompt and the published look-for to marked results,
 * for staff viewing only.
 *
 * Neither is stored on the submission: the prompt would duplicate content that
 * already lives in the lesson, and the look-for is the teacher's guidance and must
 * never be served to a student. Both are read back from the authoritative lesson
 * at the moment a teacher opens the record.
 */
function attachTeacherGuidance_(gradeKey, lessonId, results) {
  let questions;
  try {
    questions = (getLessonAuthoritative_(gradeKey, lessonId).worksheet || {}).questions || [];
  } catch (err) {
    return results;   // lesson has since been removed; show the marks without guidance
  }
  const byId = {};
  questions.forEach(function (q) { byId[q.id] = q; });

  return results.map(function (result) {
    const question = byId[result.questionId];
    if (!question) return result;
    const enriched = {};
    Object.keys(result).forEach(function (k) { enriched[k] = result[k]; });
    enriched.prompt = question.prompt || '';
    if (result.needsTeacherReview) enriched.lookFor = question.lookFor || '';
    return enriched;
  });
}

/**
 * A link that lets someone re-pick which Google account opens the app.
 *
 * Google resolves a web app against whichever account the browser treats as default,
 * so with several accounts signed in it can serve a different person than expected.
 * There is no sign-out inside an Apps Script web app, so the honest fix is to show the
 * address that was authenticated and offer the account chooser.
 */
function switchAccountUrl_() {
  try {
    const url = ScriptApp.getService().getUrl();
    return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(url);
  } catch (err) {
    return 'https://accounts.google.com/AccountChooser';
  }
}

/** Plain-English summary of how a student's levels were arrived at, for the export. */
function describeSources_(judgements) {
  const counts = {};
  judgements.filter(function (j) {
    return String(j.scale) === 'summative_tier' && !j.supersededBy;
  }).forEach(function (j) {
    const src = String(j.source || 'teacher');
    counts[src] = (counts[src] || 0) + 1;
  });

  const wording = {
    teacher: 'teacher judgement',
    suggestion_confirmed: 'auto-suggested, teacher confirmed',
    teacher_override: 'auto-suggested, teacher overrode'
  };
  return Object.keys(counts).map(function (k) {
    return counts[k] + ' ' + (wording[k] || k);
  }).join('; ');
}

function normaliseEmail_(value) {
  return String(value || '').toLowerCase().trim();
}

function gradeKeyFor_(user) {
  const grade = String(user.grade || '6').replace(/[^0-9]/g, '') || '6';
  const key = 'grade' + grade;
  return getCurriculum_()[key] ? key : 'grade6';
}

function judgementsFor_(email) {
  const target = normaliseEmail_(email);
  return readSheetObjects_(SHEETS.JUDGEMENTS).filter(function (r) {
    return normaliseEmail_(r.email) === target;
  });
}

/** "CE,GE" -> ['CE','GE'] */
function parseStrandList_(value) {
  return String(value || '').split(/[,;\s]+/)
    .map(function (s) { return s.toUpperCase().trim(); })
    .filter(function (s) { return CONFIG.STRANDS.indexOf(s) !== -1; });
}

function worksheetTotal_(lesson) {
  const questions = (lesson.worksheet && lesson.worksheet.questions) || [];
  return questions.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0);
}

function bestSubmissionsByLesson_(email) {
  const target = normaliseEmail_(email);
  return bestByLesson_(readSheetObjects_(SHEETS.SUBMISSIONS).filter(function (r) {
    return normaliseEmail_(r.email) === target;
  }));
}

function bestByLesson_(rows) {
  const best = {};
  rows.forEach(function (row) {
    const id = row.lessonId;
    if (!best[id] || Number(row.percent) > Number(best[id].percent)) best[id] = row;
  });
  return best;
}

function countAttempts_(email, lessonId) {
  const target = normaliseEmail_(email);
  return readSheetObjects_(SHEETS.SUBMISSIONS).filter(function (r) {
    return normaliseEmail_(r.email) === target && r.lessonId === lessonId;
  }).length;
}

function markLessonStarted_(email, lesson) {
  const match = findProgressRow_(email, lesson.id);
  if (match) return; // already tracked; don't reset the start time
  appendRow_('PROGRESS', {
    email: normaliseEmail_(email), lessonId: lesson.id,
    track: lesson.track || 'main', weekNumber: lesson.week || '',
    status: 'in-progress', startedAt: new Date(), updatedAt: new Date(), submittedAt: ''
  });
}

function recordProgress_(email, lesson, status, submittedAt) {
  const match = findProgressRow_(email, lesson.id);
  const row = {
    email: normaliseEmail_(email), lessonId: lesson.id,
    track: lesson.track || 'main', weekNumber: lesson.week || '',
    status: status,
    startedAt: match ? match.startedAt : new Date(),
    updatedAt: new Date(),
    submittedAt: submittedAt || (match ? match.submittedAt : '')
  };
  if (match) updateRow_('PROGRESS', match._rowIndex, row);
  else appendRow_('PROGRESS', row);
}

function findProgressRow_(email, lessonId) {
  const target = normaliseEmail_(email);
  return readSheetObjects_(SHEETS.PROGRESS).filter(function (r) {
    return normaliseEmail_(r.email) === target && r.lessonId === lessonId;
  })[0] || null;
}

function groupBy_(rows, keyFn) {
  const out = {};
  rows.forEach(function (row) {
    const key = keyFn(row);
    if (!out[key]) out[key] = [];
    out[key].push(row);
  });
  return out;
}

function valuesOf_(obj) {
  return Object.keys(obj).map(function (k) { return obj[k]; });
}

function distinct_(arr) {
  return arr.filter(function (v, i) { return arr.indexOf(v) === i; });
}

function latestDate_(rows) {
  let latest = null;
  rows.forEach(function (r) {
    const d = r.submittedAt ? new Date(r.submittedAt) : null;
    if (d && !isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
  });
  return latest;
}

function safeParse_(json, fallback) {
  try { return JSON.parse(json); } catch (err) { return fallback; }
}

function stripRowMeta_(row) {
  const copy = {};
  Object.keys(row).forEach(function (k) { if (k !== '_rowIndex') copy[k] = row[k]; });
  return copy;
}

function toCsvLine_(values) {
  return values.map(function (v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',');
}

/* ==========================================================================
 * Code.gs
 * ========================================================================== */

/**
 * Web app entry point.
 *
 * Google enforces the domain restriction before this runs (access: DOMAIN in
 * appsscript.json), but we re-check here so that a misconfigured deployment
 * fails closed with an explanation rather than silently serving the app to
 * someone it should not.
 */

function doGet() {
  let user = null;
  try {
    user = getCurrentUser();
  } catch (err) {
    return renderAccessDenied_(err && err.message);
  }

  ensureSchema_();

  const template = HtmlService.createTemplateFromFile('Index');
  template.bootstrapUser = JSON.stringify(user);
  template.appName = CONFIG.APP_NAME;

  return template.evaluate()
    .setTitle(CONFIG.APP_NAME + ' — ' + CONFIG.SCHOOL_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Lets one HTML file pull in another — how Apps Script does partials. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Standalone page shown when the caller is not a valid AISA account. */
function renderAccessDenied_(code) {
  const message = code === 'DOMAIN_NOT_ALLOWED'
    ? 'This platform is only for AISA accounts. Please sign out and sign in again with your <strong>@' +
      CONFIG.ALLOWED_DOMAIN + '</strong> account.'
    : 'We could not confirm your Google sign-in. Close this tab, then open the link again.';

  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">' +
    '<style>' +
    'body{font-family:"DM Sans",sans-serif;background:#fff;color:#1A1A1A;margin:0;' +
    'display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem}' +
    '.card{max-width:32rem;border:1px solid #C8BEE8;border-left:4px solid #D8B664;' +
    'border-radius:8px;padding:2rem}' +
    'h1{color:#21076C;font-size:1.5rem;margin:0 0 .75rem}' +
    'p{line-height:1.6;color:#555;margin:0}' +
    '</style></head><body><div class="card">' +
    '<h1>Sign-in required</h1><p>' + message + '</p>' +
    '</div></body></html>'
  ).setTitle('Sign-in required');
}

/**
 * One-time setup, run from the Apps Script editor by the deploying admin.
 * Creates the datastore workbook and reports where it lives.
 */
function setup() {
  const ss = ensureSchema_(getSpreadsheet_());
  const url = ss.getUrl();
  console.log('Datastore ready: ' + url);
  console.log('Keep this spreadsheet private — it holds every student mark.');
  return url;
}

/**
 * Checks the installation is complete and intact.
 *
 * Run this from the editor straight after pasting the files in. A large paste can
 * truncate silently, and the symptom is a parse error pointing at a line that is
 * perfectly fine — the parser simply ran out of input. This reports what is actually
 * missing instead, in plain language.
 */
function verifyInstall() {
  const problems = [];
  const ok = [];

  function need(label, test) {
    let present = false;
    try { present = !!test(); } catch (err) { present = false; }
    (present ? ok : problems).push(label);
  }

  need('Config loaded', function () { return CONFIG && CONFIG.ALLOWED_DOMAIN; });
  need('Attainment levels loaded', function () { return CONFIG.ATTAINMENT_LEVELS.length === 4; });
  need('Grade decision rules loaded', function () { return CONFIG.GRADE_RULES.grade6; });
  // The curriculum ships in chunks so no single paste is large enough to truncate.
  // Check each one arrived: a missing chunk means lessons silently absent, not an error.
  need('Curriculum index loaded', function () { return CURRICULUM_CHUNKS > 0; });
  for (let i = 1; i <= (typeof CURRICULUM_CHUNKS === 'number' ? CURRICULUM_CHUNKS : 0); i++) {
    need('Curriculum chunk ' + i + ' of ' + CURRICULUM_CHUNKS, (function (n) {
      return function () { return typeof globalThis['curriculumChunk' + n + '_'] === 'function'; };
    })(i));
  }
  need('Curriculum assembles', function () { return getCurriculum_().grade6; });
  need('All lessons present', function () {
    return Object.keys(getCurriculum_().grade6.lessons).length === CURRICULUM_MANIFEST.length;
  });
  need('Framework catalogue loaded', function () { return FRAMEWORK && FRAMEWORK.grades.grade6; });
  need('Identity code loaded', function () { return typeof getCurrentUser === 'function'; });
  need('Datastore code loaded', function () { return typeof ensureSchema_ === 'function'; });
  need('Marking engine loaded', function () { return typeof markWorksheet_ === 'function'; });
  need('Attainment engine loaded', function () { return typeof overallLevelFrom_ === 'function'; });
  // Check EVERY endpoint, not just one. A paste cut short leaves the early functions
  // present and the later ones missing, so the page renders and then individual
  // features fail — which is far harder to diagnose than a file that will not parse.
  [
    'api_getBootstrap', 'api_getLesson', 'api_submitWorksheet', 'api_getMyResults',
    'api_getClassOverview', 'api_getStudentDetail', 'api_recordJudgement', 'api_confirmSuggestions',
    'api_recordReadiness', 'api_exportCsv', 'api_getAdminData', 'api_importRoster',
    'api_setStaffRole'
  ].forEach(function (name) {
    need('Endpoint ' + name, function () { return typeof globalThis[name] === 'function'; });
  });

  // The helpers those endpoints depend on, in the order the bundle concatenates them.
  [
    'requireStaff_', 'requireAdmin_', 'withLock_', 'appendRow_', 'updateRow_',
    'readSheetObjects_', 'buildStrandProfile_', 'computeClassProfile_',
    'overallLevelFrom_', 'worksheetEvidenceByStrand_', 'getStandardsIndex_',
    'markWorksheet_', 'stripAnswerKey_', 'normaliseJudgement_', 'writeJudgement_',
    'suggestLevelsFromEvidence_', 'interviewPrompts_'
  ].forEach(function (name) {
    need('Helper ' + name, function () { return typeof globalThis[name] === 'function'; });
  });

  ['Index', 'Styles', 'App'].forEach(function (name) {
    need('HTML file "' + name + '" present', function () {
      return HtmlService.createHtmlOutputFromFile(name).getContent().length > 0;
    });
  });

  const lines = [];
  lines.push(problems.length ? '\u2717 INSTALLATION INCOMPLETE' : '\u2713 Installation looks complete');
  lines.push('');

  if (problems.length) {
    lines.push('Missing or broken:');
    problems.forEach(function (p) { lines.push('  \u2717 ' + p); });
    lines.push('');
    lines.push('Most likely a paste was cut short, or an HTML file was saved under the');
    lines.push('wrong name. The three HTML files must be named exactly Index, Styles and App.');
    lines.push('Re-paste the file covering whatever is listed above, then run this again.');
  } else {
    const lessons = Object.keys(getCurriculum_().grade6.lessons).length;
    const expected = CURRICULUM_MANIFEST.length;
    const grades = Object.keys(FRAMEWORK.grades).length;
    lines.push('  Curriculum: ' + lessons + ' of ' + expected + ' lesson(s) for Grade 6');
    lines.push('  Framework:  ' + grades + ' grade(s) of descriptors');
    lines.push('  Domain:     ' + CONFIG.ALLOWED_DOMAIN);
    lines.push('');
    lines.push('Next: run setup() to create the datastore, then Deploy \u2192 New deployment');
    lines.push('\u2192 Web app, with Execute as: Me and Who has access: your school.');
  }

  ok.forEach(function (o) { lines.push('  \u2713 ' + o); });
  const report = lines.join('\n');
  console.log(report);
  return report;
}

/**
 * Calls every endpoint server-side and reports what each one returns.
 *
 * "Request failed." in the browser means google.script.run handed the page nothing,
 * which happens when a return value cannot be serialised across the boundary — the
 * server code ran fine, so nothing appears in the normal error log. Running the same
 * endpoints here, where exceptions and sizes are visible, is the only way to see it.
 *
 * Run this from the editor and paste the log.
 */
function diagnose() {
  const lines = [];
  const user = (function () {
    try { return getCurrentUser(); } catch (err) { return null; }
  })();

  lines.push('Signed in as: ' + (user ? user.email + ' (' + user.role + ')' : 'UNRESOLVED'));
  lines.push('');

  const endpoints = [
    ['api_getBootstrap', function () { return api_getBootstrap(); }],
    ['api_getMyResults', function () { return api_getMyResults(); }],
    ['api_getClassOverview', function () { return api_getClassOverview(''); }],
    ['api_getAdminData', function () { return api_getAdminData(); }],
    ['api_exportCsv', function () { return api_exportCsv(); }]
  ];

  endpoints.forEach(function (pair) {
    const name = pair[0];
    let result;
    try {
      result = pair[1]();
    } catch (err) {
      lines.push('\u2717 ' + name + ' THREW: ' + err.message);
      if (err.stack) lines.push('    ' + String(err.stack).split('\n').slice(0, 3).join('\n    '));
      return;
    }

    if (!result) { lines.push('\u2717 ' + name + ' returned nothing'); return; }
    if (!result.ok) { lines.push('\u2717 ' + name + ' returned error: ' + result.error); return; }

    // The payload has to survive JSON, and has to fit. Both fail silently at the boundary.
    let json;
    try {
      json = JSON.stringify(result);
    } catch (err) {
      lines.push('\u2717 ' + name + ' CANNOT BE SERIALISED: ' + err.message);
      return;
    }
    const kb = Math.round(json.length / 1024);

    // JSON.stringify happily serialises a Date; google.script.run does not, and a single
    // one makes the whole reply arrive as undefined in the browser. Checking the payload
    // with JSON alone therefore reports healthy for a call that cannot reach the page.
    const hazards = findHazards_(result.data, name, []);
    lines.push((hazards.length ? '\u2717 ' : '\u2713 ') + name + '  ' + kb + ' KB' +
      (kb > 900 ? '  \u26A0 LARGE' : '') +
      (hazards.length ? '  \u2014 ' + hazards.length + ' value(s) the client cannot receive' : ''));
    hazards.slice(0, 6).forEach(function (h) { lines.push('    \u26A0 ' + h); });
  });

  const report = lines.join('\n');
  console.log(report);
  return report;
}

/**
 * Walks a value for anything google.script.run cannot carry to the browser.
 *
 * Only primitives, plain objects and arrays survive. A Date, an undefined or a
 * non-finite number anywhere in the tree makes the entire reply arrive as undefined.
 */
function findHazards_(value, label, found) {
  if (found.length > 20) return found;
  if (value === undefined) { found.push('undefined at ' + label); return found; }
  if (value instanceof Date) { found.push('Date at ' + label); return found; }
  if (typeof value === 'number' && !isFinite(value)) {
    found.push('non-finite number at ' + label); return found;
  }
  if (value === null || typeof value !== 'object') return found;
  if (typeof value === 'function') { found.push('function at ' + label); return found; }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length && found.length <= 20; i++) {
      findHazards_(value[i], label + '[' + i + ']', found);
    }
    return found;
  }
  Object.keys(value).forEach(function (k) {
    findHazards_(value[k], label + '.' + k, found);
  });
  return found;
}

// --- END OF Code.gs --- if you cannot see this line, the paste was cut short.
