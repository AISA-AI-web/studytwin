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

/** Wraps an endpoint with auth, error handling and a consistent envelope. */
function handle_(fn) {
  try {
    const user = getCurrentUser();
    return { ok: true, data: fn(user) };
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
    case 'UNKNOWN_LESSON':
      return 'That lesson could not be found.';
    case 'MAX_ATTEMPTS_REACHED':
      return 'You have used all your attempts at this worksheet.';
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
        title: lesson.title,
        summary: lesson.summary || '',
        duration: lesson.duration || '',
        standards: lesson.standards || [],
        marksAvailable: worksheetTotal_(lesson),
        attempts: countAttempts_(user.email, lesson.id),
        maxAttempts: CONFIG.MAX_ATTEMPTS,
        status: submission
          ? (Number(submission.percent) >= CONFIG.PASS_PERCENT ? 'complete' : 'attempted')
          : 'not-started',
        percent: submission ? Number(submission.percent) : null,
        marksAwarded: submission ? Number(submission.marksAwarded) : null
      };
    });

    return {
      user: user,
      app: { name: CONFIG.APP_NAME, school: CONFIG.SCHOOL_NAME, domain: CONFIG.ALLOWED_DOMAIN },
      course: { key: gradeKey, title: course.meta.title, grade: course.meta.grade },
      units: (course.units || []).map(function (unit) {
        return { id: unit.id, title: unit.title, summary: unit.summary || '', lessons: unit.lessons };
      }),
      lessons: lessonCards,
      bands: CONFIG.ATTAINMENT_BANDS,
      attainment: computeAttainment_(gradeKey, valuesOf_(best))
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

    markLessonStarted_(user.email, lesson.id);

    return {
      lesson: lesson,
      attempts: attempts,
      maxAttempts: CONFIG.MAX_ATTEMPTS,
      canAttempt: attempts < CONFIG.MAX_ATTEMPTS,
      best: best ? {
        percent: Number(best.percent),
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
        attempt: attempts + 1,
        submittedAt: now,
        marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        percent: marked.percent,
        answersJson: JSON.stringify(answers || {}),
        resultsJson: JSON.stringify(marked.results)
      });

      const passed = marked.percent >= CONFIG.PASS_PERCENT;
      recordProgress_(user.email, lesson.id, passed ? 'complete' : 'attempted', passed ? now : null);
      logAudit_(user.email, 'SUBMIT', lesson.id + ' attempt ' + (attempts + 1) +
                ' scored ' + marked.percent + '%');

      return {
        percent: marked.percent,
        marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        passed: passed,
        results: marked.results,
        attempt: attempts + 1,
        attemptsRemaining: CONFIG.MAX_ATTEMPTS - (attempts + 1)
      };
    });
  });
}

/** The student's own results and attainment. */
function api_getMyResults() {
  return handle_(function (user) {
    const gradeKey = gradeKeyFor_(user);
    const best = bestSubmissionsByLesson_(user.email);
    return {
      attainment: computeAttainment_(gradeKey, valuesOf_(best)),
      lessons: listLessons_(gradeKey).map(function (lesson) {
        const s = best[lesson.id];
        return {
          id: lesson.id, number: lesson.number, title: lesson.title, type: lesson.type,
          percent: s ? Number(s.percent) : null,
          marksAwarded: s ? Number(s.marksAwarded) : null,
          marksAvailable: worksheetTotal_(lesson),
          submittedAt: s ? s.submittedAt : null
        };
      })
    };
  });
}

/* ---------------------------------------------------------------------------
 * Teacher and admin endpoints
 * ------------------------------------------------------------------------- */

/** Cohort overview: one row per student with progress and attainment. */
function api_getClassOverview(className) {
  return handle_(function (user) {
    requireStaff_(user);
    const gradeKey = 'grade6';
    const lessons = listLessons_(gradeKey);
    const roster = readSheetObjects_(SHEETS.ROSTER, true).filter(function (r) {
      if (String(r.active).toLowerCase() === 'false') return false;
      return !className || String(r.className) === String(className);
    });

    const allSubmissions = readSheetObjects_(SHEETS.SUBMISSIONS);
    const byEmail = groupBy_(allSubmissions, function (row) {
      return String(row.email || '').toLowerCase().trim();
    });

    const students = roster.map(function (entry) {
      const email = String(entry.email || '').toLowerCase().trim();
      const best = bestByLesson_(byEmail[email] || []);
      const attainment = computeAttainment_(gradeKey, valuesOf_(best));
      const completed = lessons.filter(function (l) {
        return best[l.id] && Number(best[l.id].percent) >= CONFIG.PASS_PERCENT;
      }).length;

      return {
        email: email,
        displayName: entry.displayName || deriveNameFromEmail_(email),
        className: entry.className || '',
        lessonsCompleted: completed,
        lessonsTotal: lessons.length,
        percentComplete: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
        overallPercent: attainment.overall.percent,
        band: attainment.overall.band,
        bandLabel: attainment.overall.bandLabel,
        bandColor: attainment.overall.bandColor,
        lastActive: latestDate_(byEmail[email] || []),
        attainment: attainment
      };
    });

    return {
      students: students,
      classAttainment: computeClassAttainment_(gradeKey, students),
      lessons: lessons.map(function (l) {
        return { id: l.id, number: l.number, title: l.title, type: l.type };
      }),
      classes: distinct_(readSheetObjects_(SHEETS.ROSTER, true).map(function (r) {
        return r.className;
      })).filter(Boolean),
      bands: CONFIG.ATTAINMENT_BANDS
    };
  });
}

/** One student in full, including per-lesson breakdown. Staff only. */
function api_getStudentDetail(email) {
  return handle_(function (user) {
    requireStaff_(user);
    const target = String(email || '').toLowerCase().trim();
    if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

    const gradeKey = 'grade6';
    const submissions = readSheetObjects_(SHEETS.SUBMISSIONS).filter(function (row) {
      return String(row.email || '').toLowerCase().trim() === target;
    });
    const best = bestByLesson_(submissions);
    const rosterEntry = findRosterEntry_(target);
    logAudit_(user.email, 'VIEW_STUDENT', target);

    return {
      student: {
        email: target,
        displayName: (rosterEntry && rosterEntry.displayName) || deriveNameFromEmail_(target),
        className: (rosterEntry && rosterEntry.className) || ''
      },
      attainment: computeAttainment_(gradeKey, valuesOf_(best)),
      lessons: listLessons_(gradeKey).map(function (lesson) {
        const s = best[lesson.id];
        return {
          id: lesson.id, number: lesson.number, title: lesson.title, type: lesson.type,
          marksAvailable: worksheetTotal_(lesson),
          percent: s ? Number(s.percent) : null,
          marksAwarded: s ? Number(s.marksAwarded) : null,
          submittedAt: s ? s.submittedAt : null,
          attempts: submissions.filter(function (r) { return r.lessonId === lesson.id; }).length,
          results: s ? safeParse_(s.resultsJson, []) : []
        };
      })
    };
  });
}

/** Roster and staff management. Admin only. */
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
    existing.forEach(function (r) {
      indexByEmail[String(r.email || '').toLowerCase().trim()] = r;
    });

    let added = 0, updated = 0;
    const rejected = [];

    withLock_(function () {
      lines.forEach(function (line) {
        const parts = line.split(/\s*,\s*/);
        const email = String(parts[0] || '').toLowerCase().trim();

        if (!email || !isAllowedDomain_(email)) {
          rejected.push(line + '  — not an @' + CONFIG.ALLOWED_DOMAIN + ' address');
          return;
        }
        const row = {
          email: email,
          displayName: parts[1] || deriveNameFromEmail_(email),
          grade: parts[3] || '6',
          className: parts[2] || '',
          active: true
        };

        if (indexByEmail[email]) {
          updateRow_('ROSTER', indexByEmail[email]._rowIndex, row);
          updated++;
        } else {
          appendRow_('ROSTER', row);
          added++;
        }
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
    const target = String(email || '').toLowerCase().trim();
    if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

    const valid = [ROLES.STUDENT, ROLES.TEACHER, ROLES.ADMIN];
    const newRole = String(role || '').toLowerCase().trim();
    if (valid.indexOf(newRole) === -1) throw new Error('INVALID_ROLE');

    withLock_(function () {
      const staff = readSheetObjects_(SHEETS.STAFF);
      const match = staff.filter(function (r) {
        return String(r.email || '').toLowerCase().trim() === target;
      })[0];

      const row = {
        email: target,
        role: newRole,
        displayName: deriveNameFromEmail_(target),
        addedAt: new Date(),
        addedBy: user.email
      };
      if (match) updateRow_('STAFF', match._rowIndex, row);
      else appendRow_('STAFF', row);
    });

    invalidateCache_(SHEETS.STAFF);
    logAudit_(user.email, 'SET_ROLE', target + ' -> ' + newRole);
    return { email: target, role: newRole };
  });
}

/** Cohort marks as CSV, for reporting or upload elsewhere. Staff only. */
function api_exportCsv() {
  return handle_(function (user) {
    requireStaff_(user);
    const gradeKey = 'grade6';
    const lessons = listLessons_(gradeKey);
    const roster = readSheetObjects_(SHEETS.ROSTER, true);
    const byEmail = groupBy_(readSheetObjects_(SHEETS.SUBMISSIONS), function (r) {
      return String(r.email || '').toLowerCase().trim();
    });

    const header = ['Email', 'Name', 'Class']
      .concat(lessons.map(function (l) { return 'L' + l.number + ' %'; }))
      .concat(['Overall %', 'Band']);

    const rows = roster.map(function (entry) {
      const email = String(entry.email || '').toLowerCase().trim();
      const best = bestByLesson_(byEmail[email] || []);
      const attainment = computeAttainment_(gradeKey, valuesOf_(best));
      return [email, entry.displayName || '', entry.className || '']
        .concat(lessons.map(function (l) {
          return best[l.id] ? Number(best[l.id].percent) : '';
        }))
        .concat([attainment.overall.percent, attainment.overall.bandLabel]);
    });

    logAudit_(user.email, 'EXPORT_CSV', rows.length + ' students');
    return { csv: [header].concat(rows).map(toCsvLine_).join('\n') };
  });
}

/* ---------------------------------------------------------------------------
 * Internal helpers
 * ------------------------------------------------------------------------- */

function gradeKeyFor_(user) {
  const grade = String(user.grade || '6').replace(/[^0-9]/g, '') || '6';
  const key = 'grade' + grade;
  return CURRICULUM[key] ? key : 'grade6';
}

function worksheetTotal_(lesson) {
  const questions = (lesson.worksheet && lesson.worksheet.questions) || [];
  return questions.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0);
}

/** All submissions for one student, reduced to their best attempt per lesson. */
function bestSubmissionsByLesson_(email) {
  const rows = readSheetObjects_(SHEETS.SUBMISSIONS).filter(function (r) {
    return String(r.email || '').toLowerCase().trim() === email;
  });
  return bestByLesson_(rows);
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
  return readSheetObjects_(SHEETS.SUBMISSIONS).filter(function (r) {
    return String(r.email || '').toLowerCase().trim() === email && r.lessonId === lessonId;
  }).length;
}

function markLessonStarted_(email, lessonId) {
  const rows = readSheetObjects_(SHEETS.PROGRESS);
  const match = rows.filter(function (r) {
    return String(r.email || '').toLowerCase().trim() === email && r.lessonId === lessonId;
  })[0];
  if (match) return; // already tracked; don't reset the start time
  appendRow_('PROGRESS', {
    email: email, lessonId: lessonId, status: 'in-progress',
    startedAt: new Date(), updatedAt: new Date(), completedAt: ''
  });
}

function recordProgress_(email, lessonId, status, completedAt) {
  const rows = readSheetObjects_(SHEETS.PROGRESS);
  const match = rows.filter(function (r) {
    return String(r.email || '').toLowerCase().trim() === email && r.lessonId === lessonId;
  })[0];

  const row = {
    email: email, lessonId: lessonId, status: status,
    startedAt: match ? match.startedAt : new Date(),
    updatedAt: new Date(),
    completedAt: completedAt || (match ? match.completedAt : '')
  };
  if (match) updateRow_('PROGRESS', match._rowIndex, row);
  else appendRow_('PROGRESS', row);
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
