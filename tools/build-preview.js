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
 * by the real marking, content and attainment code inlined above — including the
 * real per-grade decision rule, so the overall levels shown here are computed the
 * same way they will be in production.
 */
(function () {
  var GRADE = 'grade6';
  var DEMO_CLASSES = ['6A', '6B'];

  // Demo cohort. \`levels\` are teacher judgements, exactly as they would be
  // recorded in the real system — nothing here is derived from marks.
  var DEMO_STUDENTS = [
    { email: 'amina.hassan@aisa.sch.ae',  displayName: 'Amina Hassan',     className: '6A', skill: 0.95,
      levels: { CU: 'advanced',   SD: 'proficient', CE: 'proficient', GE: 'advanced' } },
    { email: 'omar.khalid@aisa.sch.ae',   displayName: 'Omar Khalid',      className: '6A', skill: 0.80,
      levels: { CU: 'proficient', SD: 'proficient', CE: 'proficient', GE: 'emerging' } },
    { email: 'layla.ahmed@aisa.sch.ae',   displayName: 'Layla Ahmed',      className: '6A', skill: 0.70,
      levels: { CU: 'emerging',   SD: 'emerging',   CE: 'proficient', GE: 'emerging' } },
    { email: 'yusuf.rahman@aisa.sch.ae',  displayName: 'Yusuf Rahman',     className: '6A', skill: 0.40,
      levels: { CU: 'emerging',   SD: 'working_towards', CE: 'emerging', GE: 'emerging' } },
    { email: 'sara.mansoori@aisa.sch.ae', displayName: 'Sara Al Mansoori', className: '6B', skill: 0.92,
      levels: { CU: 'advanced',   SD: 'advanced',   CE: 'advanced',   GE: 'proficient' } },
    { email: 'khalid.saeed@aisa.sch.ae',  displayName: 'Khalid Saeed',     className: '6B', skill: 0.75,
      levels: { CU: 'proficient', SD: 'emerging',   CE: 'emerging',   GE: 'emerging' } },
    // Part-judged: shows the "incomplete" state rather than a defaulted level.
    { email: 'noor.jassim@aisa.sch.ae',   displayName: 'Noor Al Jassim',   className: '6B', skill: 0.55,
      levels: { CU: 'emerging', SD: 'emerging' } },
    // Not judged at all.
    { email: 'hamad.zaabi@aisa.sch.ae',   displayName: 'Hamad Al Zaabi',   className: '6B', skill: 0.30,
      levels: {} }
  ];

  var submissions = [];
  var judgements = [];
  var auditLog = [];
  var uid = 0;

  function seeded(seed) { var x = Math.sin(seed) * 10000; return x - Math.floor(x); }
  function lessonsInOrder() { return listLessons_(GRADE); }

  function simulate(student, lesson, seedBase) {
    var answers = {};
    (lesson.worksheet.questions || []).forEach(function (q, qi) {
      if (seeded(seedBase + qi * 7.13) > student.skill) return;
      switch (q.type) {
        case 'mcq': case 'truefalse': answers[q.id] = q.answer; break;
        case 'multi': answers[q.id] = q.answer.slice(); break;
        case 'matching': answers[q.id] = JSON.parse(JSON.stringify(q.answer)); break;
        case 'ordering': answers[q.id] = q.answer.slice(); break;
        case 'numeric': answers[q.id] = q.answer; break;
        case 'fillBlank':
          answers[q.id] = q.answer.map(function (a) { return Array.isArray(a) ? a[0] : a; }); break;
        case 'shortText': answers[q.id] = q.modelAnswer; break;
      }
    });
    return markWorksheet_(lesson.worksheet, answers);
  }

  DEMO_STUDENTS.forEach(function (student, si) {
    lessonsInOrder().forEach(function (lesson, li) {
      if (seeded(si * 3.7 + li * 11.9) > student.skill + 0.3) return;
      var marked = simulate(student, lesson, si * 100 + li * 17);
      submissions.push({
        email: student.email, lessonId: lesson.id, track: 'main', attempt: 1,
        percent: marked.percent, marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        resultsJson: JSON.stringify(marked.results),
        submittedAt: new Date(2026, 8, 1 + si + li * 2)
      });
    });
    Object.keys(student.levels).forEach(function (strand, i) {
      judgements.push({
        id: 'j' + (++uid), email: student.email, grade: '6', track: 'main',
        strand: strand, level: student.levels[strand], scale: 'summative_tier',
        assessmentEvent: 'final',
        evidenceProducts: 'Worksheet + solution plan',
        evidenceObservations: i % 3 === 2 ? '' : 'Card sort, W2 Lab',
        evidenceConversations: i % 2 === 0 ? 'Part 4 probe' : '',
        note: '', accessArrangements: '',
        nextStep: student.levels[strand] === 'working_towards'
          ? 'Bridging primer, then re-check' : '',
        judgedBy: 'f.mansour@aisa.sch.ae', judgedAt: new Date(2026, 8, 12), supersededBy: ''
      });
    });
  });

  function mine(email) { return submissions.filter(function (s) { return s.email === email; }); }
  function judgedFor(email) { return judgements.filter(function (j) { return j.email === email; }); }
  function bestByLesson(rows) {
    var best = {};
    rows.forEach(function (r) {
      if (!best[r.lessonId] || r.percent > best[r.lessonId].percent) best[r.lessonId] = r;
    });
    return best;
  }
  function values(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
  function totalMarks(l) {
    return ((l.worksheet && l.worksheet.questions) || [])
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
            id: lesson.id, number: lesson.number, type: lesson.type,
            track: lesson.track || 'main', title: lesson.title,
            summary: lesson.summary || '', duration: lesson.duration || '',
            marksAvailable: totalMarks(lesson),
            attempts: mine(user.email).filter(function (r) { return r.lessonId === lesson.id; }).length,
            maxAttempts: CONFIG.MAX_ATTEMPTS,
            status: s ? 'submitted' : 'not-started',
            worksheetScore: s ? s.percent : null,
            marksAwarded: s ? s.marksAwarded : null
          };
        }),
        levels: CONFIG.ATTAINMENT_LEVELS,
        profile: buildStrandProfile_(GRADE, judgedFor(user.email))
      };
    },

    api_getLesson: function (lessonId) {
      var user = window.CURRENT_USER;
      var attempts = mine(user.email).filter(function (r) { return r.lessonId === lessonId; }).length;
      var best = bestByLesson(mine(user.email))[lessonId];
      return {
        lesson: getLessonForStudent_(GRADE, lessonId),
        attempts: attempts, maxAttempts: CONFIG.MAX_ATTEMPTS,
        canAttempt: attempts < CONFIG.MAX_ATTEMPTS,
        best: best ? { worksheetScore: best.percent, marksAwarded: best.marksAwarded,
                       marksAvailable: best.marksAvailable, submittedAt: best.submittedAt,
                       results: JSON.parse(best.resultsJson), answers: {} } : null
      };
    },

    api_submitWorksheet: function (lessonId, answers) {
      var user = window.CURRENT_USER;
      var lesson = getLessonAuthoritative_(GRADE, lessonId);
      var attempts = mine(user.email).filter(function (r) { return r.lessonId === lessonId; }).length;
      var marked = markWorksheet_(lesson.worksheet, answers || {});
      submissions.push({
        email: user.email, lessonId: lessonId, track: 'main', attempt: attempts + 1,
        percent: marked.percent, marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        resultsJson: JSON.stringify(marked.results), submittedAt: new Date(2026, 8, 17)
      });
      auditLog.push({ timestamp: new Date(2026, 8, 17), actor: user.email, action: 'SUBMIT',
                      detail: lessonId + ' scored ' + marked.percent + '%' });
      return {
        worksheetScore: marked.percent, marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable, results: marked.results,
        attempt: attempts + 1, attemptsRemaining: CONFIG.MAX_ATTEMPTS - (attempts + 1)
      };
    },

    api_getMyResults: function () {
      var user = window.CURRENT_USER;
      var best = bestByLesson(mine(user.email));
      return {
        profile: buildStrandProfile_(GRADE, judgedFor(user.email)),
        evidence: worksheetEvidenceByStrand_(GRADE, values(best)),
        levels: CONFIG.ATTAINMENT_LEVELS,
        lessons: lessonsInOrder().map(function (lesson) {
          var s = best[lesson.id];
          return {
            id: lesson.id, number: lesson.number, title: lesson.title,
            type: lesson.type, track: lesson.track || 'main',
            worksheetScore: s ? s.percent : null, marksAwarded: s ? s.marksAwarded : null,
            marksAvailable: totalMarks(lesson), submittedAt: s ? s.submittedAt : null
          };
        })
      };
    },

    api_getClassOverview: function (className) {
      var roster = DEMO_STUDENTS.filter(function (s) {
        return !className || s.className === className;
      });
      var students = roster.map(function (entry) {
        var rows = mine(entry.email);
        return {
          email: entry.email, displayName: entry.displayName, className: entry.className,
          bridgingStrands: [],
          profile: buildStrandProfile_(GRADE, judgedFor(entry.email)),
          worksheetsSubmitted: Object.keys(bestByLesson(rows)).length,
          lastActive: rows.length ? rows[rows.length - 1].submittedAt : null
        };
      });
      return {
        students: students,
        classProfile: computeClassProfile_(GRADE, students),
        levels: CONFIG.ATTAINMENT_LEVELS,
        strands: getStandardsIndex_(GRADE),
        expectedTier: CONFIG.GRADE_RULES[GRADE].expectedTier,
        lessonsTotal: lessonsInOrder().length,
        classes: DEMO_CLASSES
      };
    },

    api_getStudentDetail: function (email) {
      var entry = DEMO_STUDENTS.filter(function (s) { return s.email === email; })[0] ||
                  { email: email, displayName: email, className: '' };
      var rows = mine(email);
      var best = bestByLesson(rows);
      return {
        student: { email: entry.email, displayName: entry.displayName,
                   className: entry.className, bridgingStrands: [] },
        profile: buildStrandProfile_(GRADE, judgedFor(email)),
        evidence: worksheetEvidenceByStrand_(GRADE, values(best)),
        levels: CONFIG.ATTAINMENT_LEVELS,
        evidenceSources: CONFIG.EVIDENCE_SOURCES,
        history: judgedFor(email).slice().reverse(),
        readiness: [],
        lessons: lessonsInOrder().map(function (lesson) {
          var s = best[lesson.id];
          return {
            id: lesson.id, number: lesson.number, title: lesson.title,
            type: lesson.type, track: lesson.track || 'main',
            marksAvailable: totalMarks(lesson),
            worksheetScore: s ? s.percent : null, marksAwarded: s ? s.marksAwarded : null,
            submittedAt: s ? s.submittedAt : null,
            attempts: rows.filter(function (r) { return r.lessonId === lesson.id; }).length,
            results: s ? JSON.parse(s.resultsJson) : []
          };
        })
      };
    },

    api_recordJudgement: function (payload) {
      judgements.filter(function (j) {
        return j.email === payload.email && j.strand === payload.strand && !j.supersededBy;
      }).forEach(function (j) { j.supersededBy = 'superseded'; });

      judgements.push({
        id: 'j' + (++uid), email: payload.email, grade: '6', track: 'main',
        strand: payload.strand, level: payload.level, scale: 'summative_tier',
        assessmentEvent: payload.assessmentEvent || 'final',
        evidenceProducts: payload.evidenceProducts || '',
        evidenceObservations: payload.evidenceObservations || '',
        evidenceConversations: payload.evidenceConversations || '',
        note: payload.note || '', accessArrangements: payload.accessArrangements || '',
        nextStep: payload.nextStep || '',
        judgedBy: window.CURRENT_USER.email, judgedAt: new Date(2026, 8, 17), supersededBy: ''
      });
      return buildStrandProfile_(GRADE, judgedFor(payload.email));
    },

    api_getAdminData: function () {
      return {
        roster: DEMO_STUDENTS.map(function (s) {
          return { email: s.email, displayName: s.displayName, grade: '6',
                   className: s.className, active: true, bridgingStrands: '' };
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
        .map(function (l) { return l + '  \u2014 not an @aisa.sch.ae address'; });
      return { added: lines.length - rejected.length, updated: 0, rejected: rejected };
    },

    api_setStaffRole: function (email, role) { return { email: email, role: role }; },

    api_exportCsv: function () {
      var strands = getStandardsIndex_(GRADE);
      var header = ['Email', 'Name', 'Class'];
      CONFIG.STRANDS.forEach(function (s) {
        header.push(strands[s] ? strands[s].label : s, s + ' note');
      });
      header.push('Overall level', 'Decision rule');
      var rows = DEMO_STUDENTS.map(function (st) {
        var p = buildStrandProfile_(GRADE, judgedFor(st.email));
        var row = [st.email, st.displayName, st.className];
        CONFIG.STRANDS.forEach(function (code) {
          var r = p.byStrand.filter(function (x) { return x.strand === code; })[0];
          row.push(r && r.judged ? r.levelLabel : '', r ? r.note : '');
        });
        row.push(p.overall.level ? p.overall.label : 'Not yet complete', p.overall.rule || '');
        return row;
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
        setTimeout(function () {
          try { onSuccess({ ok: true, data: API[name].apply(null, args) }); }
          catch (err) { console.error(err); if (onFailure) onFailure(err); }
        }, 120);
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
