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
