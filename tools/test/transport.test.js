#!/usr/bin/env node
/**
 * Tests that every API reply can actually cross the google.script.run boundary.
 *
 * That boundary accepts primitives, plain objects and arrays — and nothing else. A Date
 * anywhere in a reply makes the WHOLE reply arrive as undefined in the browser: no
 * exception, nothing in the execution log, and the page's success handler simply gets
 * nothing. It is invisible server-side too, because JSON.stringify serialises Dates
 * perfectly happily.
 *
 * That combination cost a full debugging cycle on a live deployment, so it is worth a
 * test of its own rather than a line in another file.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const sandbox = { console, JSON, Math, Number, String, Object, Array, isNaN, isFinite, Date };
vm.createContext(sandbox);
['src/Config.gs', 'src/generated/CurriculumData.gs', 'src/Marking.gs',
 'src/Content.gs', 'src/Attainment.gs', 'src/Api.gs'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});
const api = vm.runInContext('({ toClientSafe_ })', sandbox);

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/** Mirrors what google.script.run accepts: primitives, plain objects, arrays. */
function findHazards(value, label, found) {
  found = found || [];
  if (value === undefined) { found.push(`undefined at ${label}`); return found; }
  if (value instanceof Date) { found.push(`Date at ${label}`); return found; }
  if (typeof value === 'function') { found.push(`function at ${label}`); return found; }
  if (typeof value === 'number' && !isFinite(value)) { found.push(`non-finite at ${label}`); return found; }
  if (value === null || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((v, i) => findHazards(v, `${label}[${i}]`, found));
    return found;
  }
  Object.keys(value).forEach((k) => findHazards(value[k], `${label}.${k}`, found));
  return found;
}

console.log('\nDates are converted, not passed through');

const now = new Date('2026-09-17T12:00:00.000Z');
check('a bare Date becomes an ISO string',
  api.toClientSafe_(now) === '2026-09-17T12:00:00.000Z', String(api.toClientSafe_(now)));
check('a nested Date is converted',
  api.toClientSafe_({ a: { b: [{ when: now }] } }).a.b[0].when === '2026-09-17T12:00:00.000Z');
check('an invalid Date becomes null rather than "Invalid Date"',
  api.toClientSafe_(new Date('nonsense')) === null);
check('undefined becomes null, since it is dropped in transit',
  api.toClientSafe_({ a: undefined }).a === null);
check('a non-finite number becomes null',
  api.toClientSafe_({ a: 1 / 0, b: NaN }).a === null && api.toClientSafe_({ b: NaN }).b === null);

console.log('\nOrdinary values survive unchanged');

const payload = { s: 'text', n: 42, b: true, nul: null, arr: [1, 'two', { three: 3 }],
                  nested: { deep: { deeper: ['x'] } } };
check('strings, numbers, booleans, null, arrays and objects are untouched',
  JSON.stringify(api.toClientSafe_(payload)) === JSON.stringify(payload));
check('an empty object and empty array survive',
  JSON.stringify(api.toClientSafe_({ o: {}, a: [] })) === JSON.stringify({ o: {}, a: [] }));

console.log('\nRealistic replies carry no hazards after conversion');

// Shapes matching what the endpoints actually return from sheet reads.
const classOverview = {
  students: [{
    email: 'a@aisa.sch.ae', displayName: 'A', className: '6A',
    lastActive: now,                                   // the one that broke Class Tracking
    profile: { byStrand: [{ strand: 'CU', judgedAt: now, level: 'emerging' }],
               overall: { level: 'emerging' } },
    worksheetsSubmitted: 2
  }],
  classProfile: { byStrand: [] }, levels: [], strands: {}, lessonsTotal: 2
};
const adminData = {
  roster: [{ email: 'a@aisa.sch.ae', active: true }],
  staff: [{ email: 'b@aisa.sch.ae', role: 'teacher', addedAt: now }],
  spreadsheetUrl: 'https://example.com',
  audit: [{ timestamp: now, actor: 'b@aisa.sch.ae', action: 'EXPORT_CSV', detail: '' }]
};

[['api_getClassOverview', classOverview], ['api_getAdminData', adminData]].forEach(([name, reply]) => {
  const before = findHazards(reply, name);
  check(`${name}: the raw reply WOULD have failed in transit`,
    before.length > 0, 'test fixture no longer reproduces the bug');
  const after = findHazards(api.toClientSafe_(reply), name);
  check(`${name}: converted reply carries nothing the client cannot receive`,
    after.length === 0, after.join('; '));
});

console.log('\nEvery endpoint routes through the conversion');

const apiSource = fs.readFileSync(path.join(root, 'src/Api.gs'), 'utf8');
check('handle_ converts before returning',
  /return \{ ok: true, data: toClientSafe_\(fn\(user\)\) \}/.test(apiSource),
  'every reply must pass through toClientSafe_, so endpoints need not remember');

const endpoints = [...apiSource.matchAll(/^function (api_\w+)/gm)].map((m) => m[1]);
check('all endpoints found for checking', endpoints.length >= 10, `found ${endpoints.length}`);

// Each endpoint must delegate to handle_ rather than returning a payload directly.
const bypassing = endpoints.filter((name) => {
  const start = apiSource.indexOf(`function ${name}(`);
  const body = apiSource.slice(start, start + 400);
  return !/return handle_\(/.test(body);
});
check('no endpoint returns a payload without going through handle_',
  bypassing.length === 0, bypassing.join(', '));

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
