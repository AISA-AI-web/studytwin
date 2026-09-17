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
        strand: lesson.strand || null,
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
      course: { key: gradeKey, title: course.meta.title, grade: course.meta.grade },
      units: (course.units || []).map(function (unit) {
        return { id: unit.id, title: unit.title, summary: unit.summary || '',
                 track: unit.track || 'main', lessons: unit.lessons };
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
    payload = payload || {};

    const target = normaliseEmail_(payload.email);
    if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

    const strand = String(payload.strand || '').toUpperCase();
    if (CONFIG.STRANDS.indexOf(strand) === -1) throw new Error('INVALID_STRAND');

    const level = String(payload.level || '');
    if (CONFIG.SCALES.summative_tier.indexOf(level) === -1) throw new Error('INVALID_LEVEL');

    const gradeKey = 'grade' + (String(payload.grade || '6').replace(/[^0-9]/g, '') || '6');
    const track = payload.track === 'bridging' ? 'bridging' : 'main';
    const strandDef = getStrand_(gradeKey, strand);

    return withLock_(function () {
      // Supersede whatever currently stands for this strand and event.
      const id = Utilities.getUuid();
      const existing = judgementsFor_(target).filter(function (j) {
        return String(j.strand).toUpperCase() === strand &&
               String(j.scale) === 'summative_tier' &&
               String(j.assessmentEvent) === String(payload.assessmentEvent || 'final') &&
               !j.supersededBy;
      });
      existing.forEach(function (row) {
        const updated = stripRowMeta_(row);
        updated.supersededBy = id;
        updateRow_('JUDGEMENTS', row._rowIndex, updated);
      });

      appendRow_('JUDGEMENTS', {
        id: id,
        email: target,
        grade: gradeKey.replace('grade', ''),
        track: track,
        strand: strand,
        level: level,
        scale: 'summative_tier',
        assessmentEvent: String(payload.assessmentEvent || 'final'),
        frameworkRefs: strandDef ? strandDef.tiers[level === 'working_towards' ? 'emerging' : level].code : '',
        evidenceProducts: String(payload.evidenceProducts || ''),
        evidenceObservations: String(payload.evidenceObservations || ''),
        evidenceConversations: String(payload.evidenceConversations || ''),
        note: String(payload.note || ''),
        accessArrangements: String(payload.accessArrangements || ''),
        nextStep: String(payload.nextStep || ''),
        bridgingRef: String(payload.bridgingRef || ''),
        judgedBy: user.email,
        judgedAt: new Date(),
        supersededBy: ''
      });

      logAudit_(user.email, 'JUDGE', target + ' ' + strand + ' -> ' + level);
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
    header.push('Overall level', 'Decision rule', 'Access arrangements', 'Next step',
                'Judged by', 'Judged at');

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

function normaliseEmail_(value) {
  return String(value || '').toLowerCase().trim();
}

function gradeKeyFor_(user) {
  const grade = String(user.grade || '6').replace(/[^0-9]/g, '') || '6';
  const key = 'grade' + grade;
  return CURRICULUM[key] ? key : 'grade6';
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
