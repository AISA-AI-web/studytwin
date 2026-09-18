/**
 * Attainment against the ADEK AI Fluency Framework.
 *
 * THE RULE THAT GOVERNS THIS FILE
 * ------------------------------
 * A level is awarded by a teacher, against a written descriptor, from triangulated
 * evidence. It is never computed from marks. ADEK publishes no mark-to-tier
 * conversion for any grade, and inventing one is what would make the school's
 * records indefensible.
 *
 * So there is deliberately no function here that turns a percentage into a level.
 * Worksheet marks appear only as `products` evidence — one of the three sources a
 * judgement must draw on — and are always labelled as such.
 *
 * What this module does do is the arithmetic teachers should not have to: apply
 * each grade's published overall-level decision rule consistently, and roll
 * judgements up across a class.
 */

/**
 * Applies a grade's published decision rule to a set of strand levels.
 *
 * Returns the rule text alongside the level so the teacher view can show WHY a
 * student is at a level — which is what makes the record auditable and the
 * published tie-break cases self-evidently handled.
 *
 * @param {Object} strandLevels e.g. { CU: 'emerging', SD: 'proficient', ... }
 * @param {string} gradeKey     e.g. 'grade6'
 * @return {{level: ?string, label: string, rule: string, reason: ?string}}
 */
function overallLevelFrom_(strandLevels, gradeKey) {
  const config = CONFIG.GRADE_RULES[gradeKey];
  if (!config) {
    return { level: null, label: 'No rule published', rule: '', reason: 'no_rule_for_grade' };
  }

  const strands = CONFIG.STRANDS;
  const missing = strands.filter(function (s) {
    return !strandLevels[s] || LEVEL_ORDINAL[strandLevels[s]] === undefined;
  });

  // An overall level before every strand is judged would be a guess. Say so instead.
  if (missing.length) {
    return {
      level: null,
      label: 'Not yet complete',
      rule: '',
      reason: 'incomplete',
      missingStrands: missing
    };
  }

  const ordinalOf = function (s) { return LEVEL_ORDINAL[strandLevels[s]]; };
  const countAtOrAbove = function (levelKey) {
    return strands.filter(function (s) { return ordinalOf(s) >= LEVEL_ORDINAL[levelKey]; }).length;
  };
  const noneBelow = function (levelKey) {
    return levelKey === null ||
      strands.every(function (s) { return ordinalOf(s) >= LEVEL_ORDINAL[levelKey]; });
  };

  for (let i = 0; i < config.rules.length; i++) {
    const rule = config.rules[i];
    if (countAtOrAbove(rule.atOrAbove.level) >= rule.atOrAbove.count && noneBelow(rule.floor)) {
      const def = levelDef_(rule.level);
      return {
        level: rule.level,
        label: def ? def.label : rule.level,
        color: def ? def.color : null,
        rule: rule.text,
        isExpected: rule.level === config.expectedTier,
        reason: null
      };
    }
  }

  const def = levelDef_('working_towards');
  return {
    level: 'working_towards',
    label: def.label,
    color: def.color,
    rule: 'Does not yet meet the ' + gradeKey.replace('grade', 'Grade ') +
          ' rule for Emerging.',
    isExpected: false,
    reason: null
  };
}

/**
 * Builds a student's strand profile from their judgement rows.
 *
 * Judgements are append-only, so the current picture is the most recent row per
 * strand that nothing supersedes. Earlier rows stay as history — a re-check after
 * bridging should be visible as a change, not erase what came before.
 *
 * @param {string} gradeKey
 * @param {Array}  judgements Rows from the Judgements sheet for one student.
 * @param {string=} assessmentEvent Restrict to one event (e.g. 'final').
 */
function buildStrandProfile_(gradeKey, judgements, assessmentEvent) {
  const relevant = (judgements || []).filter(function (row) {
    if (String(row.scale) !== 'summative_tier') return false;
    if (row.supersededBy) return false;
    if (assessmentEvent && String(row.assessmentEvent) !== assessmentEvent) return false;
    return true;
  });

  const latest = {};
  relevant.forEach(function (row) {
    const strand = String(row.strand || '').toUpperCase();
    if (CONFIG.STRANDS.indexOf(strand) === -1) return;
    const at = row.judgedAt ? new Date(row.judgedAt).getTime() : 0;
    if (!latest[strand] || at >= latest[strand]._at) {
      latest[strand] = { row: row, _at: at };
    }
  });

  const standardsIndex = getStandardsIndex_(gradeKey);
  const strandLevels = {};

  const byStrand = CONFIG.STRANDS.map(function (strand) {
    const entry = latest[strand];
    const definition = standardsIndex[strand] || {};
    if (entry) strandLevels[strand] = String(entry.row.level);

    const sources = entry ? [
      entry.row.evidenceProducts ? 'products' : null,
      entry.row.evidenceObservations ? 'observations' : null,
      entry.row.evidenceConversations ? 'conversations' : null
    ].filter(Boolean) : [];

    const levelKey = entry ? String(entry.row.level) : null;
    const def = levelKey ? levelDef_(levelKey) : null;

    return {
      strand: strand,
      label: definition.label || strand,
      descriptors: definition.tiers || null,
      level: levelKey,
      levelLabel: def ? def.label : 'Not yet judged',
      levelColor: def ? def.color : null,
      judged: !!entry,
      note: entry ? String(entry.row.note || '') : '',
      nextStep: entry ? String(entry.row.nextStep || '') : '',
      accessArrangements: entry ? String(entry.row.accessArrangements || '') : '',
      frameworkRefs: entry ? String(entry.row.frameworkRefs || '') : '',
      judgedBy: entry ? String(entry.row.judgedBy || '') : '',
      judgedAt: entry ? entry.row.judgedAt : null,
      evidenceSources: sources,
      // ADEK requires three sources. Flag a thin judgement rather than blocking it.
      singleSource: entry ? sources.length < 2 : false,
      missingSources: entry
        ? CONFIG.EVIDENCE_SOURCES
            .map(function (s) { return s.key; })
            .filter(function (k) { return sources.indexOf(k) === -1; })
        : []
    };
  });

  return {
    byStrand: byStrand,
    overall: overallLevelFrom_(strandLevels, gradeKey),
    expectedTier: (CONFIG.GRADE_RULES[gradeKey] || {}).expectedTier || null,
    judgedCount: byStrand.filter(function (s) { return s.judged; }).length,
    strandsTotal: CONFIG.STRANDS.length
  };
}

/**
 * Summarises worksheet marks as PRODUCT evidence for a strand.
 *
 * This deliberately returns no level and no band. It answers "what has this
 * student produced that bears on this strand", which is what a teacher needs in
 * front of them while judging — not "what level are they".
 *
 * `bestOfAttempts` is surfaced because a correct third attempt is not evidence of
 * independence, which the moderation guidance names as a pitfall.
 */
function worksheetEvidenceByStrand_(gradeKey, submissions) {
  const totals = {};
  CONFIG.STRANDS.forEach(function (s) {
    totals[s] = { marksAwarded: 0, marksAvailable: 0, items: 0, lessons: {}, maxAttempt: 0 };
  });

  (submissions || []).forEach(function (submission) {
    let results;
    try {
      results = JSON.parse(submission.resultsJson || '[]');
    } catch (err) {
      console.warn('Unparseable resultsJson for ' + submission.lessonId);
      return;
    }
    const attempt = Number(submission.attempt) || 1;

    results.forEach(function (result) {
      strandsOfResult_(result).forEach(function (strand) {
        if (!totals[strand]) return;
        totals[strand].marksAwarded += Number(result.marksAwarded) || 0;
        totals[strand].marksAvailable += Number(result.marksAvailable) || 0;
        totals[strand].items += 1;
        totals[strand].lessons[submission.lessonId] = true;
        totals[strand].maxAttempt = Math.max(totals[strand].maxAttempt, attempt);
      });
    });
  });

  return CONFIG.STRANDS.map(function (strand) {
    const t = totals[strand];
    return {
      strand: strand,
      evidenceType: 'products',
      marksAwarded: round2_(t.marksAwarded),
      marksAvailable: round2_(t.marksAvailable),
      // A score on the worksheet, not an attainment figure. Named so it reads that way.
      worksheetScore: t.marksAvailable > 0
        ? round2_((t.marksAwarded / t.marksAvailable) * 100) : null,
      itemsMarked: t.items,
      lessonsCovered: Object.keys(t.lessons).length,
      highestAttemptUsed: t.maxAttempt,
      notIndependent: t.maxAttempt > 1
    };
  });
}

/** Reads the strand code(s) a marked result bears on, tolerating both tag shapes. */
function strandsOfResult_(result) {
  const refs = result.frameworkRefs || result.standards || [];
  const out = [];
  (Array.isArray(refs) ? refs : [refs]).forEach(function (ref) {
    const code = typeof ref === 'string' ? ref : (ref && ref.code) || '';
    const strand = typeof ref === 'object' && ref && ref.strand
      ? String(ref.strand).toUpperCase()
      : (/AIF·([A-Z]{2})·/.exec(String(code)) || [, ''])[1];
    if (strand && out.indexOf(strand) === -1) out.push(strand);
  });
  return out;
}

/**
 * Class rollup: for each strand, how many students sit at each level.
 *
 * This replaces the old cohort-average-then-band, which averaged marks across
 * students and strands and banded the result — a halo by construction, and the
 * pitfall the moderation guidance names first. A count per level is what actually
 * tells a teacher which strand to reteach.
 */
function computeClassProfile_(gradeKey, studentProfiles) {
  const standardsIndex = getStandardsIndex_(gradeKey);

  const byStrand = CONFIG.STRANDS.map(function (strand) {
    const counts = {};
    CONFIG.ATTAINMENT_LEVELS.forEach(function (l) { counts[l.key] = 0; });
    let notJudged = 0;

    studentProfiles.forEach(function (student) {
      const row = (student.profile.byStrand || []).filter(function (r) {
        return r.strand === strand;
      })[0];
      if (!row || !row.judged) { notJudged++; return; }
      if (counts[row.level] !== undefined) counts[row.level]++;
    });

    const definition = standardsIndex[strand] || {};
    return {
      strand: strand,
      label: definition.label || strand,
      descriptors: definition.tiers || null,
      notJudged: notJudged,
      distribution: CONFIG.ATTAINMENT_LEVELS.map(function (l) {
        return { level: l.key, label: l.label, color: l.color, count: counts[l.key] };
      })
    };
  });

  const overallCounts = {};
  CONFIG.ATTAINMENT_LEVELS.forEach(function (l) { overallCounts[l.key] = 0; });
  let incomplete = 0;

  studentProfiles.forEach(function (student) {
    const level = student.profile.overall.level;
    if (!level) incomplete++;
    else if (overallCounts[level] !== undefined) overallCounts[level]++;
  });

  return {
    byStrand: byStrand,
    overall: {
      incomplete: incomplete,
      distribution: CONFIG.ATTAINMENT_LEVELS.map(function (l) {
        return { level: l.key, label: l.label, color: l.color, count: overallCounts[l.key] };
      })
    },
    expectedTier: (CONFIG.GRADE_RULES[gradeKey] || {}).expectedTier || null
  };
}

// round2_ lives in Marking.gs; Apps Script shares one global scope across files.

/**
 * Proposes a level per strand from the auto-marked evidence.
 *
 * A PROPOSAL, never a judgement. ADEK awards levels by matching performance to a written
 * descriptor and publishes no conversion from marks; this mapping is the school's own,
 * adopted so that no staff time goes on correcting. A teacher confirms it in a short
 * conversation before it is recorded, and the record keeps which of the two happened.
 *
 * Returns nothing for a strand with too little marked work behind it — an unsupported
 * suggestion is worse than none, because it looks equally confident.
 */
function suggestLevelsFromEvidence_(gradeKey, submissions) {
  const evidence = worksheetEvidenceByStrand_(gradeKey, submissions);
  const standardsIndex = getStandardsIndex_(gradeKey);

  return evidence.map(function (row) {
    const enough = row.itemsMarked >= CONFIG.SUGGESTION_MIN_ITEMS && row.marksAvailable > 0;
    const percent = row.worksheetScore;

    let suggested = null;
    if (enough && percent !== null) {
      const band = CONFIG.SUGGESTION_THRESHOLDS.filter(function (t) {
        return percent >= t.min;
      })[0];
      suggested = band ? band.level : 'working_towards';
    }
    const def = suggested ? levelDef_(suggested) : null;
    const definition = standardsIndex[row.strand] || {};

    return {
      strand: row.strand,
      label: definition.label || row.strand,
      suggested: suggested,
      suggestedLabel: def ? def.label : null,
      suggestedColor: def ? def.color : null,
      percent: percent,
      itemsMarked: row.itemsMarked,
      marksAwarded: row.marksAwarded,
      marksAvailable: row.marksAvailable,
      enoughEvidence: enough,
      // Surfaced so a teacher can see when a score came from repeated attempts. The
      // proposal is NOT lowered for it: ADEK says heavy scaffolding means Emerging
      // rather than Proficient, but that is a judgement about what the student needed,
      // which the platform cannot see. Lowering it here would be a second invented rule
      // on top of the thresholds. The panel puts the fact in front of the teacher and
      // asks them to decide, which is where ADEK puts it too.
      notIndependent: row.notIndependent,
      highestAttemptUsed: row.highestAttemptUsed,
      // True where the attempts could have lifted the proposal above the expected tier.
      attemptsCouldInflate: row.notIndependent &&
        (suggested === 'proficient' || suggested === 'advanced'),
      reason: !enough
        ? 'Only ' + row.itemsMarked + ' marked item(s) so far \u2014 too little to suggest from.'
        : Math.round(percent) + '% across ' + row.itemsMarked + ' marked items.'
    };
  });
}

/** Interview prompts for a strand, pitched at each tier so the answer places the student. */
function interviewPrompts_(gradeKey, strandCode) {
  const strand = getStrand_(gradeKey, strandCode);
  if (!strand) return [];
  const prompts = (INTERVIEW_PROMPTS[gradeKey] || {})[strandCode] || {};

  // Every level the teacher can select, not just the three framework tiers. Working
  // towards is selectable in the panel, and a missing prompt for it meant the panel
  // showed the Emerging question instead — on the one decision that routes a student
  // into bridging.
  return CONFIG.ATTAINMENT_LEVELS.map(function (level) {
    const tier = level.isTier ? level.key : 'emerging';
    return {
      level: level.key,
      levelLabel: level.label,
      // Working towards has no descriptor of its own; it is defined by not yet meeting
      // Emerging, so that is the descriptor to show beside it.
      descriptor: strand.tiers[tier].descriptor,
      isTier: !!level.isTier,
      ask: prompts[level.key] || ''
    };
  });
}
