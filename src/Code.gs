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

  const template = HtmlService.createTemplateFromFile('ui/Index');
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
    'api_getClassOverview', 'api_getStudentDetail', 'api_recordJudgement',
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
    'markWorksheet_', 'stripAnswerKey_'
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
