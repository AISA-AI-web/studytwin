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
  const lock = LockService.getDocumentLock();
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
