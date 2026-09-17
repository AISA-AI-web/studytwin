#!/usr/bin/env node
/**
 * Builds a standalone, clickable preview of the platform.
 *
 * The preview inlines the real Config, Marking, Content and Attainment modules
 * and the real curriculum, then stubs `google.script.run` with an in-memory
 * server. That means worksheets are genuinely marked by the same code that runs
 * in production — this is a working demo, not a mockup, so what you see is what
 * students get.
 *
 * Output: preview/index.html (open it directly in a browser).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const generated = path.join(root, 'src/generated/CurriculumData.gs');
if (!fs.existsSync(generated)) {
  console.error('Run `npm run build` first — curriculum data has not been compiled.');
  process.exit(1);
}

// Server modules that are pure logic (no Apps Script services) and so run as-is.
const serverLogic = [
  'src/Config.gs',
  'src/generated/CurriculumData.gs',
  'src/Marking.gs',
  'src/Content.gs',
  'src/Attainment.gs'
].map(read).join('\n\n');

const styles = read('src/ui/Styles.html');

// The SPA reads its identity from window.BOOTSTRAP_USER, exactly as the server injects it.
const app = read('src/ui/App.html');

const mock = `
<script>
/**
 * In-memory stand-in for Api.gs. Mirrors the same envelopes and shapes, backed
 * by the real marking and attainment code inlined above.
 */
(function () {
  var DEMO_CLASSES = ['6A', '6B'];
  var DEMO_STUDENTS = [
    { email: 'amina.hassan@aisa.sch.ae',  displayName: 'Amina Hassan',  className: '6A', skill: 0.95 },
    { email: 'omar.khalid@aisa.sch.ae',   displayName: 'Omar Khalid',   className: '6A', skill: 0.78 },
    { email: 'layla.ahmed@aisa.sch.ae',   displayName: 'Layla Ahmed',   className: '6A', skill: 0.62 },
    { email: 'yusuf.rahman@aisa.sch.ae',  displayName: 'Yusuf Rahman',  className: '6A', skill: 0.44 },
    { email: 'sara.mansoori@aisa.sch.ae', displayName: 'Sara Al Mansoori', className: '6B', skill: 0.88 },
    { email: 'khalid.saeed@aisa.sch.ae',  displayName: 'Khalid Saeed',  className: '6B', skill: 0.71 },
    { email: 'noor.jassim@aisa.sch.ae',   displayName: 'Noor Al Jassim', className: '6B', skill: 0.55 },
    { email: 'hamad.zaabi@aisa.sch.ae',   displayName: 'Hamad Al Zaabi', className: '6B', skill: 0.30 }
  ];

  var GRADE = 'grade6';
  var submissions = [];   // { email, lessonId, attempt, percent, marksAwarded, marksAvailable, resultsJson, submittedAt }
  var auditLog = [];

  function lessonsInOrder() { return listLessons_(GRADE); }

  /** Deterministic pseudo-random so the demo looks the same on every reload. */
  function seeded(seed) {
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  /**
   * Generates a plausible attempt for a demo student by answering each question
   * correctly with probability = their skill, then marking it for real.
   */
  function simulate(student, lesson, seedBase) {
    var answers = {};
    (lesson.worksheet.questions || []).forEach(function (q, qi) {
      var roll = seeded(seedBase + qi * 7.13);
      if (roll > student.skill) return;  // leaves it blank or wrong

      switch (q.type) {
        case 'mcq': case 'truefalse': answers[q.id] = q.answer; break;
        case 'multi': answers[q.id] = q.answer.slice(); break;
        case 'matching': answers[q.id] = JSON.parse(JSON.stringify(q.answer)); break;
        case 'ordering': answers[q.id] = q.answer.slice(); break;
        case 'numeric': answers[q.id] = q.answer; break;
        case 'fillBlank':
          answers[q.id] = q.answer.map(function (a) { return Array.isArray(a) ? a[0] : a; });
          break;
        case 'shortText': answers[q.id] = q.modelAnswer; break;
      }
    });
    return markWorksheet_(lesson.worksheet, answers);
  }

  // Seed the cohort so the teacher view has something real to show.
  DEMO_STUDENTS.forEach(function (student, si) {
    lessonsInOrder().forEach(function (lesson, li) {
      // Weaker students have not reached the later lessons yet.
      if (seeded(si * 3.7 + li * 11.9) > student.skill + 0.25) return;
      var marked = simulate(student, lesson, si * 100 + li * 17);
      submissions.push({
        email: student.email, lessonId: lesson.id, attempt: 1,
        percent: marked.percent, marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        resultsJson: JSON.stringify(marked.results),
        submittedAt: new Date(Date.now() - (si + li) * 86400000 * 1.5)
      });
    });
  });

  function mine(email) {
    return submissions.filter(function (s) { return s.email === email; });
  }
  function bestByLesson(rows) {
    var best = {};
    rows.forEach(function (r) {
      if (!best[r.lessonId] || r.percent > best[r.lessonId].percent) best[r.lessonId] = r;
    });
    return best;
  }
  function values(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
  function totalMarks(lesson) {
    return ((lesson.worksheet && lesson.worksheet.questions) || [])
      .reduce(function (s, q) { return s + (q.marks || 0); }, 0);
  }

  var API = {
    api_getBootstrap: function () {
      var user = window.CURRENT_USER;
      var best = bestByLesson(mine(user.email));
      return {
        user: user,
        app: { name: 'StudyTwin', school: 'American International School in Abu Dhabi',
               domain: 'aisa.sch.ae' },
        course: { key: GRADE, title: CURRICULUM[GRADE].meta.title, grade: 6 },
        units: CURRICULUM[GRADE].units,
        lessons: lessonsInOrder().map(function (lesson) {
          var s = best[lesson.id];
          return {
            id: lesson.id, number: lesson.number, type: lesson.type, title: lesson.title,
            summary: lesson.summary || '', duration: lesson.duration || '',
            standards: lesson.standards || [], marksAvailable: totalMarks(lesson),
            attempts: mine(user.email).filter(function (r) { return r.lessonId === lesson.id; }).length,
            maxAttempts: CONFIG.MAX_ATTEMPTS,
            status: s ? (s.percent >= CONFIG.PASS_PERCENT ? 'complete' : 'attempted') : 'not-started',
            percent: s ? s.percent : null,
            marksAwarded: s ? s.marksAwarded : null
          };
        }),
        bands: CONFIG.ATTAINMENT_BANDS,
        attainment: computeAttainment_(GRADE, values(best))
      };
    },

    api_getLesson: function (lessonId) {
      var user = window.CURRENT_USER;
      var attempts = mine(user.email).filter(function (r) { return r.lessonId === lessonId; }).length;
      var best = bestByLesson(mine(user.email))[lessonId];
      return {
        lesson: getLessonForStudent_(GRADE, lessonId),
        attempts: attempts,
        maxAttempts: CONFIG.MAX_ATTEMPTS,
        canAttempt: attempts < CONFIG.MAX_ATTEMPTS,
        best: best ? {
          percent: best.percent, marksAwarded: best.marksAwarded,
          marksAvailable: best.marksAvailable, submittedAt: best.submittedAt,
          results: JSON.parse(best.resultsJson), answers: {}
        } : null
      };
    },

    api_submitWorksheet: function (lessonId, answers) {
      var user = window.CURRENT_USER;
      var lesson = getLessonAuthoritative_(GRADE, lessonId);
      var attempts = mine(user.email).filter(function (r) { return r.lessonId === lessonId; }).length;
      var marked = markWorksheet_(lesson.worksheet, answers || {});

      submissions.push({
        email: user.email, lessonId: lessonId, attempt: attempts + 1,
        percent: marked.percent, marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        resultsJson: JSON.stringify(marked.results), submittedAt: new Date()
      });
      auditLog.push({ timestamp: new Date(), actor: user.email, action: 'SUBMIT',
                      detail: lessonId + ' scored ' + marked.percent + '%' });

      return {
        percent: marked.percent, marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        passed: marked.percent >= CONFIG.PASS_PERCENT,
        results: marked.results, attempt: attempts + 1,
        attemptsRemaining: CONFIG.MAX_ATTEMPTS - (attempts + 1)
      };
    },

    api_getMyResults: function () {
      var user = window.CURRENT_USER;
      var best = bestByLesson(mine(user.email));
      return {
        attainment: computeAttainment_(GRADE, values(best)),
        lessons: lessonsInOrder().map(function (lesson) {
          var s = best[lesson.id];
          return {
            id: lesson.id, number: lesson.number, title: lesson.title, type: lesson.type,
            percent: s ? s.percent : null, marksAwarded: s ? s.marksAwarded : null,
            marksAvailable: totalMarks(lesson), submittedAt: s ? s.submittedAt : null
          };
        })
      };
    },

    api_getClassOverview: function (className) {
      var lessons = lessonsInOrder();
      var roster = DEMO_STUDENTS.filter(function (s) {
        return !className || s.className === className;
      });
      var students = roster.map(function (entry) {
        var best = bestByLesson(mine(entry.email));
        var attainment = computeAttainment_(GRADE, values(best));
        var completed = lessons.filter(function (l) {
          return best[l.id] && best[l.id].percent >= CONFIG.PASS_PERCENT;
        }).length;
        var dates = mine(entry.email).map(function (r) { return r.submittedAt; }).sort();
        return {
          email: entry.email, displayName: entry.displayName, className: entry.className,
          lessonsCompleted: completed, lessonsTotal: lessons.length,
          percentComplete: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
          overallPercent: attainment.overall.percent,
          band: attainment.overall.band, bandLabel: attainment.overall.bandLabel,
          bandColor: attainment.overall.bandColor,
          lastActive: dates.length ? dates[dates.length - 1] : null,
          attainment: attainment
        };
      });
      return {
        students: students,
        classAttainment: computeClassAttainment_(GRADE, students),
        lessons: lessons.map(function (l) {
          return { id: l.id, number: l.number, title: l.title, type: l.type };
        }),
        classes: DEMO_CLASSES,
        bands: CONFIG.ATTAINMENT_BANDS
      };
    },

    api_getStudentDetail: function (email) {
      var entry = DEMO_STUDENTS.filter(function (s) { return s.email === email; })[0] ||
                  { email: email, displayName: email, className: '' };
      var rows = mine(email);
      var best = bestByLesson(rows);
      return {
        student: { email: entry.email, displayName: entry.displayName, className: entry.className },
        attainment: computeAttainment_(GRADE, values(best)),
        lessons: lessonsInOrder().map(function (lesson) {
          var s = best[lesson.id];
          return {
            id: lesson.id, number: lesson.number, title: lesson.title, type: lesson.type,
            marksAvailable: totalMarks(lesson),
            percent: s ? s.percent : null, marksAwarded: s ? s.marksAwarded : null,
            submittedAt: s ? s.submittedAt : null,
            attempts: rows.filter(function (r) { return r.lessonId === lesson.id; }).length,
            results: s ? JSON.parse(s.resultsJson) : []
          };
        })
      };
    },

    api_getAdminData: function () {
      return {
        roster: DEMO_STUDENTS.map(function (s) {
          return { email: s.email, displayName: s.displayName, grade: '6',
                   className: s.className, active: true };
        }),
        staff: [
          { email: 'b.abaki@aisa.sch.ae', role: 'admin', addedBy: 'deployment' },
          { email: 'f.mansour@aisa.sch.ae', role: 'teacher', addedBy: 'b.abaki@aisa.sch.ae' }
        ],
        spreadsheetUrl: '#preview-no-spreadsheet',
        audit: auditLog.slice().reverse()
      };
    },

    api_importRoster: function (text) {
      var lines = String(text || '').split(/\\r?\\n/).filter(function (l) { return l.trim(); });
      var rejected = lines.filter(function (l) { return l.indexOf('@aisa.sch.ae') === -1; })
        .map(function (l) { return l + '  — not an @aisa.sch.ae address'; });
      return { added: lines.length - rejected.length, updated: 0, rejected: rejected };
    },

    api_setStaffRole: function (email, role) { return { email: email, role: role }; },

    api_exportCsv: function () {
      var lessons = lessonsInOrder();
      var header = ['Email', 'Name', 'Class']
        .concat(lessons.map(function (l) { return 'L' + l.number + ' %'; }))
        .concat(['Overall %', 'Band']);
      var rows = DEMO_STUDENTS.map(function (s) {
        var best = bestByLesson(mine(s.email));
        var a = computeAttainment_(GRADE, values(best));
        return [s.email, s.displayName, s.className]
          .concat(lessons.map(function (l) { return best[l.id] ? best[l.id].percent : ''; }))
          .concat([a.overall.percent, a.overall.bandLabel]);
      });
      return { csv: [header].concat(rows).map(function (r) { return r.join(','); }).join('\\n') };
    }
  };

  /** Stub of google.script.run, including the success/failure handler chaining. */
  window.google = { script: { run: {} } };
  function makeRunner(onSuccess, onFailure) {
    var runner = {
      withSuccessHandler: function (fn) { return makeRunner(fn, onFailure); },
      withFailureHandler: function (fn) { return makeRunner(onSuccess, fn); }
    };
    Object.keys(API).forEach(function (name) {
      runner[name] = function () {
        var args = arguments;
        setTimeout(function () {      // mimic the network hop
          try {
            onSuccess({ ok: true, data: API[name].apply(null, args) });
          } catch (err) {
            console.error(err);
            if (onFailure) onFailure(err);
          }
        }, 140);
      };
    });
    return runner;
  }
  window.google.script.run = makeRunner(function () {}, function () {});
})();
</script>`;

const roleSwitcher = `
<div id="previewBar" style="background:#1A1A1A;color:#fff;padding:.5rem 1.5rem;
     font-family:'DM Sans',sans-serif;font-size:.8rem;display:flex;gap:.75rem;
     align-items:center;flex-wrap:wrap">
  <strong style="color:#D8B664">PREVIEW</strong>
  <span style="opacity:.7">Demo data. Worksheets are marked by the real engine.</span>
  <span style="flex:1"></span>
  <span style="opacity:.7">View as:</span>
  <button data-role="student" class="pv">Student</button>
  <button data-role="teacher" class="pv">Teacher</button>
  <button data-role="admin" class="pv">Admin</button>
</div>
<style>
  .pv { font-family:'DM Sans',sans-serif; font-size:.78rem; cursor:pointer;
        background:transparent; color:#fff; border:1px solid rgba(255,255,255,.35);
        border-radius:999px; padding:.25rem .8rem; }
  .pv:hover { background:rgba(255,255,255,.14); }
  .pv.active { background:#D8B664; color:#21076C; font-weight:700; border-color:#D8B664; }
</style>
<script>
  var PREVIEW_USERS = {
    student: { email: 'amina.hassan@aisa.sch.ae', displayName: 'Amina Hassan',
               role: 'student', grade: '6', className: '6A' },
    teacher: { email: 'f.mansour@aisa.sch.ae', displayName: 'Fatima Mansour',
               role: 'teacher', grade: '6', className: '' },
    admin:   { email: 'b.abaki@aisa.sch.ae', displayName: 'Brandon Abaki',
               role: 'admin', grade: '6', className: '' }
  };
  var saved = null;
  try { saved = localStorage.getItem('studytwin-preview-role'); } catch (e) {}
  var startRole = PREVIEW_USERS[saved] ? saved : 'student';
  window.CURRENT_USER = PREVIEW_USERS[startRole];
  window.BOOTSTRAP_USER = window.CURRENT_USER;

  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.getElementById('previewBar');
    Array.prototype.forEach.call(bar.querySelectorAll('[data-role]'), function (btn) {
      var role = btn.getAttribute('data-role');
      if (role === startRole) btn.classList.add('active');
      btn.onclick = function () {
        try { localStorage.setItem('studytwin-preview-role', role); } catch (e) {}
        location.reload();
      };
    });
  });
</script>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StudyTwin — Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
${styles}
</head>
<body>
${roleSwitcher}

  <header class="app-header">
    <div class="brand">StudyTwin<span></span></div>
    <div class="school">American International School in Abu Dhabi</div>
    <div class="header-spacer"></div>
    <nav class="nav" id="nav"></nav>
    <div class="user-chip" id="userChip"></div>
  </header>

  <main id="view"><div class="spinner" role="status" aria-label="Loading"></div></main>

  <script>
${serverLogic}
  </script>
${mock}
${app}
</body>
</html>
`;

fs.mkdirSync(path.join(root, 'preview'), { recursive: true });
const out = path.join(root, 'preview', 'index.html');
fs.writeFileSync(out, html);
console.log(`Wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);
