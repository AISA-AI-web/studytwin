#!/usr/bin/env node
/**
 * Tests the endpoints that write attainment.
 *
 * These are the only calls in the platform that put a level on a student's record, and
 * a teacher confirming four strands has no way to tell from the screen whether all four
 * landed. So the guarantees are worth pinning down: what gets written, what supersedes
 * what, how a change away from the proposal is recorded, and — above all — that a
 * rejected strand writes nothing at all rather than half a profile.
 *
 * Apps Script services are stubbed with an in-memory datastore. The code under test is
 * the real Api.gs, loaded unmodified.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/** A sandbox holding Api.gs over an in-memory sheet, reset for each scenario. */
function makeSandbox(opts) {
  opts = opts || {};
  const rows = { JUDGEMENTS: [], AUDIT: [] };
  let uuid = 0;
  let lockHeld = 0, maxLockDepth = 0;

  const sandbox = {
    // handle_ logs every caught error. Several cases below deliberately fail, and the
    // stack traces bury the results, so the sandbox keeps log and drops error.
    console: { log: console.log, error: function () {} },
    JSON, Math, Number, String, Object, Array, Boolean,
    isNaN, isFinite, Date, Error, RegExp,
    Utilities: { getUuid: () => 'uuid-' + (++uuid) },
    Session: {
      getActiveUser: () => ({ getEmail: () => opts.email || 'f.mansour@aisa.sch.ae' })
    },
    __rows: rows,
    __locks: () => ({ maxLockDepth })
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const files = [
    'src/Config.gs',
    ...fs.readdirSync(path.join(root, 'src/generated'))
      .filter((f) => f.endsWith('.gs')).map((f) => `src/generated/${f}`),
    'src/Marking.gs', 'src/Content.gs', 'src/Attainment.gs', 'src/Api.gs'
  ];
  files.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
  });

  // The Apps Script layer (Auth.gs, Db.gs) talks to Google services, so it is replaced
  // here rather than loaded. Every function the endpoints reach for is stubbed once.
  vm.runInContext(`
    function getCurrentUser() {
      return { email: ${JSON.stringify(opts.email || 'f.mansour@aisa.sch.ae')},
               displayName: 'F. Mansour',
               role: ${JSON.stringify(opts.role || 'teacher')} };
    }
    function requireStaff_(user) {
      if (user.role !== 'teacher' && user.role !== 'admin') throw new Error('FORBIDDEN');
    }
    function normaliseEmail_(v) { return String(v || '').trim().toLowerCase(); }
    function isAllowedDomain_(email) {
      return email.slice(-('@' + CONFIG.ALLOWED_DOMAIN).length) === '@' + CONFIG.ALLOWED_DOMAIN;
    }
    function withLock_(fn) {
      __lockEnter();
      try { return fn(); } finally { __lockExit(); }
    }
    function judgementsFor_(email) {
      return __rows.JUDGEMENTS
        .filter(function (r) { return r.email === email; })
        .map(function (r, i) { var c = Object.assign({}, r); c._rowIndex = r.__i; return c; });
    }
    function appendRow_(sheet, row) {
      row.__i = __rows[sheet].length + 2;
      __rows[sheet].push(row);
    }
    function updateRow_(sheet, rowIndex, values) {
      var target = __rows[sheet].filter(function (r) { return r.__i === rowIndex; })[0];
      if (!target) throw new Error('NO_SUCH_ROW');
      Object.keys(values).forEach(function (k) { target[k] = values[k]; });
    }
    function stripRowMeta_(row) {
      var out = Object.assign({}, row);
      delete out._rowIndex;
      delete out.__i;
      return out;
    }
    function logAudit_(actor, action, detail) {
      __rows.AUDIT.push({ actor: actor, action: action, detail: detail });
    }
  `, sandbox);

  // Lock depth is observed, not just tolerated: a nested acquire would deadlock on a
  // real script lock, and the whole point of writing four strands together is one lock.
  sandbox.__lockEnter = () => { lockHeld++; maxLockDepth = Math.max(maxLockDepth, lockHeld); };
  sandbox.__lockExit = () => { lockHeld--; };

  return {
    rows,
    maxLockDepth: () => maxLockDepth,
    call: (name, arg) => vm.runInContext(name, sandbox)(arg),
    live: () => rows.JUDGEMENTS.filter((r) => !r.supersededBy),
    audit: () => rows.AUDIT
  };
}

const STUDENT = 'amina.hassan@aisa.sch.ae';
const ALL_FOUR = {
  CU: { level: 'advanced',        suggested: 'advanced' },
  SD: { level: 'proficient',      suggested: 'proficient' },
  CE: { level: 'emerging',        suggested: 'proficient', note: 'Could not explain the plan' },
  GE: { level: 'working_towards', suggested: 'working_towards' }
};

console.log('\nConfirming suggested levels');
{
  const s = makeSandbox();
  const res = s.call('api_confirmSuggestions',
    { email: STUDENT, grade: '6', decisions: ALL_FOUR });

  check('the call succeeds', res.ok === true, res.error);
  check('one row per strand is written', s.rows.JUDGEMENTS.length === 4,
        `wrote ${s.rows.JUDGEMENTS.length}`);
  check('all four strands are covered',
        ['CU', 'SD', 'CE', 'GE'].every((c) => s.live().some((r) => r.strand === c)));
  check('all four are written under a single lock', s.maxLockDepth() === 1,
        `depth ${s.maxLockDepth()}`);
  check('the returned profile is complete',
        res.data.byStrand.filter((r) => r.judged).length === 4);

  const cu = s.live().filter((r) => r.strand === 'CU')[0];
  const ce = s.live().filter((r) => r.strand === 'CE')[0];
  check('a level left as proposed is recorded as a confirmed suggestion',
        cu.source === 'suggestion_confirmed', cu.source);
  check('a level the teacher changed is recorded as an override',
        ce.source === 'teacher_override', ce.source);
  check('the proposal is kept alongside the level actually recorded',
        ce.suggestedLevel === 'proficient' && ce.level === 'emerging');
  check('the teacher’s note survives', ce.note === 'Could not explain the plan');
  check('products evidence defaults to the marked work',
        cu.evidenceProducts === 'Auto-marked worksheets');
  check('the framework code matches the level recorded',
        /·CU·G6·A$/.test(cu.frameworkRefs), cu.frameworkRefs);
  check('working towards is filed against the emerging descriptor',
        /·GE·G6·E$/.test(s.live().filter((r) => r.strand === 'GE')[0].frameworkRefs));
  check('one audit entry is written for the whole confirmation',
        s.audit().filter((a) => a.action === 'CONFIRM_SUGGESTIONS').length === 1);
}

console.log('\nA rejected strand writes nothing at all');
{
  const s = makeSandbox();
  const res = s.call('api_confirmSuggestions', {
    email: STUDENT, grade: '6',
    decisions: {
      CU: { level: 'advanced',   suggested: 'advanced' },
      SD: { level: 'proficient', suggested: 'proficient' },
      // Not on the scale. Anything already written by this point would be a partial
      // profile the teacher was told had failed.
      CE: { level: 'mastery',    suggested: 'proficient' },
      GE: { level: 'emerging',   suggested: 'emerging' }
    }
  });

  check('the call fails', res.ok === false);
  check('the failure names the invalid level', res.error === 'INVALID_LEVEL', res.error);
  check('NOT ONE row was written', s.rows.JUDGEMENTS.length === 0,
        `wrote ${s.rows.JUDGEMENTS.length}`);
  check('nothing is claimed in the audit log',
        s.audit().filter((a) => a.action === 'CONFIRM_SUGGESTIONS').length === 0);
  check('the teacher gets a usable message', /valid attainment level/.test(res.message));
}

console.log('\nEmpty and hostile input');
{
  const s = makeSandbox();
  const empty = s.call('api_confirmSuggestions', { email: STUDENT, grade: '6', decisions: {} });
  check('confirming nothing is refused rather than silently succeeding',
        empty.ok === false && empty.error === 'NOTHING_TO_RECORD', empty.error);
  check('a strand with no level chosen is skipped, not defaulted',
        s.call('api_confirmSuggestions', {
          email: STUDENT, grade: '6',
          decisions: { CU: { level: 'emerging', suggested: 'emerging' }, SD: { level: '' } }
        }).ok === true && s.rows.JUDGEMENTS.length === 1);

  const outside = makeSandbox().call('api_confirmSuggestions',
    { email: 'someone@gmail.com', grade: '6', decisions: ALL_FOUR });
  check('a student outside the school domain is refused',
        outside.ok === false && outside.error === 'DOMAIN_NOT_ALLOWED', outside.error);

  const student = makeSandbox({ role: 'student' }).call('api_confirmSuggestions',
    { email: STUDENT, grade: '6', decisions: ALL_FOUR });
  check('a student cannot record their own levels',
        student.ok === false && student.error === 'FORBIDDEN', student.error);
}

console.log('\nRe-confirming supersedes rather than overwrites');
{
  const s = makeSandbox();
  s.call('api_confirmSuggestions', { email: STUDENT, grade: '6', decisions: ALL_FOUR });
  const res = s.call('api_confirmSuggestions', {
    email: STUDENT, grade: '6',
    decisions: { CE: { level: 'proficient', suggested: 'proficient', note: 'Re-checked after bridging' } }
  });

  check('the re-check succeeds', res.ok === true, res.error);
  check('the earlier row is kept, not edited away', s.rows.JUDGEMENTS.length === 5);
  check('exactly one CE row still stands',
        s.live().filter((r) => r.strand === 'CE').length === 1);
  check('the level that stands is the new one',
        s.live().filter((r) => r.strand === 'CE')[0].level === 'proficient');
  check('the superseded row points at the one that replaced it',
        s.rows.JUDGEMENTS.filter((r) => r.strand === 'CE' && r.supersededBy)[0].supersededBy ===
        s.live().filter((r) => r.strand === 'CE')[0].id);
  check('the other three strands are untouched',
        s.live().filter((r) => r.strand !== 'CE').length === 3);
}

console.log('\nThe single-strand form still works the same way');
{
  const s = makeSandbox();
  const res = s.call('api_recordJudgement', {
    email: STUDENT, grade: '6', strand: 'CU', level: 'proficient',
    evidenceProducts: 'Worksheet', evidenceConversations: 'Part 4 probe'
  });

  check('it records the judgement', res.ok === true && s.live().length === 1, res.error);
  check('it is marked as a teacher judgement, not a confirmed suggestion',
        s.live()[0].source === 'teacher', s.live()[0].source);
  check('it carries no proposal', s.live()[0].suggestedLevel === '');
  check('it takes the lock exactly once', s.maxLockDepth() === 1, `depth ${s.maxLockDepth()}`);
  check('an invalid strand is refused',
        s.call('api_recordJudgement',
          { email: STUDENT, grade: '6', strand: 'XX', level: 'emerging' }).error === 'INVALID_STRAND');
  check('a refused judgement writes nothing', s.rows.JUDGEMENTS.length === 1);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
process.exit(failed ? 1 : 0);
