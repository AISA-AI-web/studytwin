/**
 * Auto-marking engine.
 *
 * Marking always happens on the server against the authoritative copy of the
 * content. Answer keys are stripped before any lesson is sent to a browser
 * (see stripAnswerKey_ in Content.gs), so a student cannot read the answers out
 * of the page source, and a crafted request cannot award itself marks — the
 * client only ever submits responses, never scores.
 *
 * Supported question types and how each is credited:
 *
 *   mcq        single correct option           all or nothing
 *   truefalse  a boolean                       all or nothing
 *   multi      several correct options         partial credit, penalised for wrong picks
 *   matching   left/right pairs                partial credit per correct pair
 *   ordering   a correct sequence              partial credit per item in the right place
 *   numeric    a value with a tolerance        all or nothing, tolerance-aware
 *   shortText  accepted answers / keywords     normalised comparison
 *   fillBlank  several short answers in a row  partial credit per blank
 *
 * A question may also set `autoMarked: false`. Much of the published curriculum is
 * open sentence stems — "The data problem is ___. So the model learns ___." —
 * whose quality no mark scheme can judge. Those are captured verbatim, carry no
 * marks, are excluded from the worksheet score entirely, and are surfaced to the
 * teacher as product evidence toward their own judgement.
 *
 * Keyword-matching them instead would hand out marks for using the right
 * vocabulary about the wrong thing, and would put a number where the framework
 * puts a judgement.
 */

/**
 * Marks a full worksheet submission.
 *
 * @param {Object} worksheet Authoritative worksheet definition (with answer keys).
 * @param {Object} answers   Map of questionId -> student response.
 * @return {{marksAwarded:number, marksAvailable:number, percent:number, results:Array}}
 */
function markWorksheet_(worksheet, answers) {
  answers = answers || {};
  const results = [];
  let awarded = 0;
  let available = 0;

  let openResponses = 0;

  (worksheet.questions || []).forEach(function (question) {
    const response = answers[question.id];
    const result = markQuestion_(question, response);
    results.push(result);

    // Open responses contribute to neither side of the fraction, so a worksheet
    // that is mostly open does not report a misleadingly small score.
    if (result.needsTeacherReview) { openResponses++; return; }
    awarded += result.marksAwarded;
    available += result.marksAvailable;
  });

  return {
    marksAwarded: round2_(awarded),
    marksAvailable: round2_(available),
    percent: available > 0 ? round2_((awarded / available) * 100) : 0,
    openResponses: openResponses,
    results: results
  };
}

/** Marks a single question, dispatching on its type. */
function markQuestion_(question, response) {
  const marksAvailable = Number(question.marks) || 0;
  let awarded = 0;

  const answered = response !== undefined && response !== null && response !== '' &&
                   !(Array.isArray(response) && response.length === 0);

  // Captured, never scored. The teacher reads it as evidence.
  if (question.autoMarked === false) {
    return {
      questionId: question.id,
      type: question.type,
      answered: answered,
      correct: false,
      partial: false,
      needsTeacherReview: true,
      marksAwarded: 0,
      marksAvailable: 0,
      standards: question.standards || [],
      frameworkRefs: question.frameworkRefs || [],
      response: answered ? response : null,
      // What the published pack tells a teacher to look for, shown beside the response.
      lookFor: question.lookFor || '',
      feedback: answered
        ? 'Your teacher will read this response.'
        : 'You did not answer this part.',
      modelAnswer: ''
    };
  }

  if (answered) {
    switch (question.type) {
      case 'mcq':       awarded = markChoice_(question, response) * marksAvailable; break;
      case 'truefalse': awarded = markTrueFalse_(question, response) * marksAvailable; break;
      case 'multi':     awarded = markMulti_(question, response) * marksAvailable; break;
      case 'matching':  awarded = markMatching_(question, response) * marksAvailable; break;
      case 'ordering':  awarded = markOrdering_(question, response) * marksAvailable; break;
      case 'numeric':   awarded = markNumeric_(question, response) * marksAvailable; break;
      case 'shortText': awarded = markShortText_(question, response) * marksAvailable; break;
      case 'fillBlank': awarded = markFillBlank_(question, response) * marksAvailable; break;
      default:
        console.warn('Unknown question type "' + question.type + '" on ' + question.id);
        awarded = 0;
    }
  }

  awarded = round2_(Math.max(0, Math.min(awarded, marksAvailable)));
  const fraction = marksAvailable > 0 ? awarded / marksAvailable : 0;

  return {
    questionId: question.id,
    type: question.type,
    answered: answered,
    correct: fraction >= 0.999,
    partial: fraction > 0 && fraction < 0.999,
    marksAwarded: awarded,
    marksAvailable: marksAvailable,
    standards: question.standards || [],
    frameworkRefs: question.frameworkRefs || [],
    needsTeacherReview: false,
    feedback: pickFeedback_(question, fraction, answered),
    // The model answer is released only after marking, so students learn from mistakes.
    modelAnswer: describeAnswer_(question)
  };
}

/* ---------------------------------------------------------------------------
 * Per-type markers. Each returns a fraction of the available marks, 0..1.
 * ------------------------------------------------------------------------- */

function markChoice_(question, response) {
  return String(response).trim() === String(question.answer).trim() ? 1 : 0;
}

function markTrueFalse_(question, response) {
  return toBool_(response) === toBool_(question.answer) ? 1 : 0;
}

/**
 * Multi-select.
 *
 * Credit is (proportion of correct options found) minus (proportion of
 * distractors wrongly selected), floored at zero. Scoring the two proportions
 * against their own totals is what makes ticking every box score exactly zero:
 * it earns 1 for finding them all and loses 1 for taking every distractor.
 *
 * A simpler (hits - misses) / correctCount does not hold that property — with
 * three correct options and two distractors, ticking everything would still pay
 * out a third of the marks for pure guessing.
 */
function markMulti_(question, response) {
  const key = (question.answer || []).map(normaliseKey_);
  const given = (Array.isArray(response) ? response : [response]).map(normaliseKey_);
  if (key.length === 0) return 0;

  const distractorCount = Math.max(0, (question.options || []).length - key.length);
  const unique = given.filter(function (v, i) { return given.indexOf(v) === i; });

  let hits = 0, misses = 0;
  unique.forEach(function (v) {
    if (key.indexOf(v) !== -1) hits++; else misses++;
  });

  // With no distractors there is nothing to wrongly select, so no penalty applies.
  const penalty = distractorCount > 0 ? (misses / distractorCount) : 0;
  return Math.max(0, (hits / key.length) - penalty);
}

/** Matching pairs: response is { leftId: rightId }. Credit per correct pair. */
function markMatching_(question, response) {
  const key = question.answer || {};
  const keys = Object.keys(key);
  if (keys.length === 0) return 0;
  if (typeof response !== 'object' || response === null) return 0;

  let hits = 0;
  keys.forEach(function (leftId) {
    if (normaliseKey_(response[leftId]) === normaliseKey_(key[leftId])) hits++;
  });
  return hits / keys.length;
}

/** Ordering: credit for each item sitting in its correct position. */
function markOrdering_(question, response) {
  const key = (question.answer || []).map(normaliseKey_);
  const given = (Array.isArray(response) ? response : []).map(normaliseKey_);
  if (key.length === 0) return 0;

  let hits = 0;
  for (let i = 0; i < key.length; i++) {
    if (given[i] === key[i]) hits++;
  }
  return hits / key.length;
}

/** Numeric with an inclusive tolerance (absolute, defaults to exact). */
function markNumeric_(question, response) {
  const expected = Number(question.answer);
  const given = Number(String(response).replace(/[, ]/g, ''));
  if (isNaN(given) || isNaN(expected)) return 0;

  const tolerance = Number(question.tolerance) || 0;
  return Math.abs(given - expected) <= tolerance + 1e-9 ? 1 : 0;
}

/**
 * Short free text. Three matching strategies, in order of preference:
 *
 *   acceptedAnswers  normalised exact match against any listed answer
 *   keywordsAll      every listed keyword must appear (credit is all-or-nothing)
 *   keywordsAny      credit scales with how many listed keywords appear
 *
 * Normalisation strips case, punctuation and filler words so that
 * "A computer program!" and "computer program" both match.
 */
function markShortText_(question, response) {
  const text = normaliseText_(response);
  if (!text) return 0;

  if (question.acceptedAnswers && question.acceptedAnswers.length) {
    const matched = question.acceptedAnswers.some(function (accepted) {
      return normaliseText_(accepted) === text;
    });
    if (matched) return 1;
    // Fall through: a longer sentence containing an accepted answer still counts.
    const contained = question.acceptedAnswers.some(function (accepted) {
      const norm = normaliseText_(accepted);
      return norm.length > 2 && text.indexOf(norm) !== -1;
    });
    if (contained) return 1;
  }

  if (question.keywordsAll && question.keywordsAll.length) {
    const all = question.keywordsAll.every(function (kw) {
      return text.indexOf(normaliseText_(kw)) !== -1;
    });
    return all ? 1 : 0;
  }

  if (question.keywordsAny && question.keywordsAny.length) {
    const hits = question.keywordsAny.filter(function (kw) {
      return text.indexOf(normaliseText_(kw)) !== -1;
    }).length;
    const needed = Number(question.keywordsNeeded) || 1;
    return Math.min(1, hits / needed);
  }

  return 0;
}

/** A row of blanks: response is an array, credit per blank filled correctly. */
function markFillBlank_(question, response) {
  const blanks = question.answer || [];
  if (blanks.length === 0) return 0;
  const given = Array.isArray(response) ? response : [response];

  let hits = 0;
  blanks.forEach(function (accepted, i) {
    const options = Array.isArray(accepted) ? accepted : [accepted];
    const answer = normaliseText_(given[i]);
    if (answer && options.some(function (o) { return normaliseText_(o) === answer; })) {
      hits++;
    }
  });
  return hits / blanks.length;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

/** Lowercase, strip punctuation and filler words, collapse whitespace. */
function normaliseText_(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\b(a|an|the|is|are|it|that|this|of|to)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identifier comparison — case and whitespace insensitive, punctuation preserved. */
function normaliseKey_(value) {
  if (value === undefined || value === null) return '';
  return String(value).toLowerCase().trim();
}

function toBool_(value) {
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1' || s === 't';
}

/** Chooses the feedback line a student sees for this question after marking. */
function pickFeedback_(question, fraction, answered) {
  const fb = question.feedback || {};
  if (!answered) return fb.unanswered || 'You did not answer this question.';
  if (fraction >= 0.999) return fb.correct || 'Correct.';
  if (fraction > 0) return fb.partial || fb.incorrect || 'Partly right — check the model answer.';
  return fb.incorrect || 'Not quite — check the model answer.';
}

/** Renders the answer key into something readable for post-submission review. */
function describeAnswer_(question) {
  switch (question.type) {
    case 'mcq': {
      const opt = (question.options || []).filter(function (o) {
        return String(o.id) === String(question.answer);
      })[0];
      return opt ? opt.text : String(question.answer);
    }
    case 'truefalse':
      return toBool_(question.answer) ? 'True' : 'False';
    case 'multi': {
      const byId = {};
      (question.options || []).forEach(function (o) { byId[String(o.id)] = o.text; });
      return (question.answer || []).map(function (id) {
        return byId[String(id)] || id;
      }).join('; ');
    }
    case 'matching': {
      const key = question.answer || {};
      const leftText = {}, rightText = {};
      (question.left || []).forEach(function (o) { leftText[String(o.id)] = o.text; });
      (question.right || []).forEach(function (o) { rightText[String(o.id)] = o.text; });
      return Object.keys(key).map(function (l) {
        return (leftText[l] || l) + ' → ' + (rightText[String(key[l])] || key[l]);
      }).join('; ');
    }
    case 'ordering': {
      const text = {};
      (question.items || []).forEach(function (o) { text[String(o.id)] = o.text; });
      return (question.answer || []).map(function (id, i) {
        return (i + 1) + '. ' + (text[String(id)] || id);
      }).join('  ');
    }
    case 'numeric':
      return String(question.answer) +
        (question.tolerance ? ' (±' + question.tolerance + ')' : '');
    case 'fillBlank':
      return (question.answer || []).map(function (a) {
        return Array.isArray(a) ? a[0] : a;
      }).join(', ');
    case 'shortText':
      return question.modelAnswer ||
        (question.acceptedAnswers || []).join(' / ') ||
        (question.keywordsAll || question.keywordsAny || []).join(', ');
    default:
      return '';
  }
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}
