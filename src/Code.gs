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
