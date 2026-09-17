/**
 * Attainment against the AI Standards.
 *
 * Every worksheet question is tagged with the standard(s) it evidences. A
 * student's attainment against a standard is the marks they earned on questions
 * carrying that tag, over the marks available on those questions — counting only
 * their best attempt at each lesson.
 *
 * Marks a question carries are credited in full to each standard it is tagged
 * with rather than split between them. A question tagged with two standards is
 * evidence for both; halving it would understate attainment in each.
 */

/**
 * Builds the attainment picture for one student.
 *
 * @param {string} gradeKey
 * @param {Array}  submissions Best-attempt submission rows for this student.
 * @return {{byStandard: Array, overall: Object}}
 */
function computeAttainment_(gradeKey, submissions) {
  const standardsIndex = getStandardsIndex_(gradeKey);
  const totals = {}; // code -> { awarded, available, questions }

  submissions.forEach(function (submission) {
    let results;
    try {
      results = JSON.parse(submission.resultsJson || '[]');
    } catch (err) {
      console.warn('Unparseable resultsJson on submission for ' + submission.lessonId);
      return;
    }

    results.forEach(function (result) {
      (result.standards || []).forEach(function (code) {
        if (!totals[code]) totals[code] = { awarded: 0, available: 0, questions: 0 };
        totals[code].awarded   += Number(result.marksAwarded)   || 0;
        totals[code].available += Number(result.marksAvailable) || 0;
        totals[code].questions += 1;
      });
    });
  });

  const byStandard = Object.keys(totals).map(function (code) {
    const t = totals[code];
    const percent = t.available > 0 ? (t.awarded / t.available) * 100 : 0;
    const definition = standardsIndex[code] || {};
    const band = bandFor_(percent);

    return {
      code: code,
      strand: definition.strand || '',
      descriptor: definition.descriptor || '',
      marksAwarded: round2_(t.awarded),
      marksAvailable: round2_(t.available),
      questionsAttempted: t.questions,
      percent: round2_(percent),
      band: band.key,
      bandLabel: band.label,
      bandColor: band.color
    };
  });

  byStandard.sort(function (a, b) { return a.code.localeCompare(b.code); });

  const awarded   = byStandard.reduce(function (s, r) { return s + r.marksAwarded; }, 0);
  const available = byStandard.reduce(function (s, r) { return s + r.marksAvailable; }, 0);
  const overallPercent = available > 0 ? (awarded / available) * 100 : 0;
  const overallBand = bandFor_(overallPercent);

  return {
    byStandard: byStandard,
    overall: {
      marksAwarded: round2_(awarded),
      marksAvailable: round2_(available),
      percent: round2_(overallPercent),
      band: overallBand.key,
      bandLabel: overallBand.label,
      bandColor: overallBand.color,
      standardsEvidenced: byStandard.length,
      standardsTotal: Object.keys(standardsIndex).length
    }
  };
}

/** First band whose threshold the percentage meets. Bands are ordered high to low. */
function bandFor_(percent) {
  const bands = CONFIG.ATTAINMENT_BANDS;
  for (let i = 0; i < bands.length; i++) {
    if (percent >= bands[i].min) return bands[i];
  }
  return bands[bands.length - 1];
}

/**
 * Class-level rollup: one row per standard with the cohort average and a
 * distribution across bands, so a teacher can see at a glance which standards
 * the class as a whole is weak on rather than reading 30 individual reports.
 */
function computeClassAttainment_(gradeKey, studentAttainments) {
  const standardsIndex = getStandardsIndex_(gradeKey);
  const agg = {}; // code -> { awarded, available, bands: {} , students: 0 }

  studentAttainments.forEach(function (student) {
    (student.attainment.byStandard || []).forEach(function (row) {
      if (!agg[row.code]) {
        agg[row.code] = { awarded: 0, available: 0, students: 0, bands: {} };
      }
      const a = agg[row.code];
      a.awarded   += row.marksAwarded;
      a.available += row.marksAvailable;
      a.students  += 1;
      a.bands[row.band] = (a.bands[row.band] || 0) + 1;
    });
  });

  return Object.keys(agg).map(function (code) {
    const a = agg[code];
    const percent = a.available > 0 ? (a.awarded / a.available) * 100 : 0;
    const band = bandFor_(percent);
    const definition = standardsIndex[code] || {};

    return {
      code: code,
      strand: definition.strand || '',
      descriptor: definition.descriptor || '',
      studentsAssessed: a.students,
      averagePercent: round2_(percent),
      band: band.key,
      bandLabel: band.label,
      bandColor: band.color,
      distribution: CONFIG.ATTAINMENT_BANDS.map(function (b) {
        return { band: b.key, label: b.label, color: b.color, count: a.bands[b.key] || 0 };
      })
    };
  }).sort(function (x, y) { return x.averagePercent - y.averagePercent; }); // weakest first
}
