/**
 * Curriculum content access.
 *
 * The curriculum itself lives in `curriculum/**` as plain JSON and is compiled
 * into `generated/CurriculumData.gs` by `npm run build`. Apps Script projects can
 * only hold .gs and .html files, so the build wraps the JSON rather than us
 * authoring lessons as code. The JSON stays the source of truth and stays
 * portable if the platform ever moves off Apps Script.
 */

/** Returns the course shell for a grade: units, lesson titles, standards. No answers. */
function getCourse_(gradeKey) {
  const course = getCurriculum_()[gradeKey];
  if (!course) throw new Error('UNKNOWN_GRADE');
  return course;
}

/** Every lesson in a grade, in teaching order. */
function listLessons_(gradeKey) {
  const course = getCourse_(gradeKey);
  const ordered = [];
  (course.units || []).forEach(function (unit) {
    (unit.lessons || []).forEach(function (lessonId) {
      const lesson = course.lessons[lessonId];
      if (lesson) ordered.push(lesson);
    });
  });
  return ordered;
}

/** The authoritative lesson, answer keys intact. Server-side use only. */
function getLessonAuthoritative_(gradeKey, lessonId) {
  const course = getCourse_(gradeKey);
  const lesson = course.lessons[lessonId];
  if (!lesson) throw new Error('UNKNOWN_LESSON');
  return lesson;
}

/**
 * The student-safe copy of a lesson.
 *
 * This is the only version that ever crosses to a browser. Without the stripping
 * below, a student could open devtools and read every answer straight out of the
 * page payload, which would make the marks meaningless.
 */
function getLessonForStudent_(gradeKey, lessonId) {
  const lesson = getLessonAuthoritative_(gradeKey, lessonId);
  return stripAnswerKey_(lesson);
}

/** Deep-copies a lesson, removing every field that reveals or hints at an answer. */
function stripAnswerKey_(lesson) {
  const copy = JSON.parse(JSON.stringify(lesson));

  if (copy.worksheet && copy.worksheet.questions) {
    copy.worksheet.questions = copy.worksheet.questions.map(function (q) {
      const safe = {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        marks: q.marks,
        standards: q.standards || [],
        hint: q.hint || '',
        // The student needs to know this part is read rather than marked.
        // `lookFor` is deliberately NOT carried over: it is the teacher's guidance.
        autoMarked: q.autoMarked !== false
      };
      if (q.stem) safe.stem = q.stem;

      // Presentation data the student legitimately needs in order to answer.
      if (q.options) {
        safe.options = q.options.map(function (o) { return { id: o.id, text: o.text }; });
      }
      if (q.left)  safe.left  = q.left.map(function (o) { return { id: o.id, text: o.text }; });
      // Shuffled for the same reason `items` is, and it matters more here than it looks.
      // A matching key is most naturally written down the diagonal — the first row pairs
      // with the first option, and so on — and two thirds of the Grade 6 set was written
      // that way. Served in the authored order, a student who pairs row 1 with option 1
      // and row 2 with option 2 scores full marks having read nothing. Shuffling here
      // fixes every matching question at once, however its key was written.
      if (q.right) safe.right = shuffle_(q.right.map(function (o) {
        return { id: o.id, text: o.text };
      }));
      if (q.items) safe.items = shuffle_(q.items.map(function (o) {
        return { id: o.id, text: o.text };
      }));
      if (q.blanks)      safe.blanks = q.blanks;
      if (q.placeholder) safe.placeholder = q.placeholder;
      if (q.maxLength)   safe.maxLength = q.maxLength;

      return safe;
    });
  }

  // The pack's formative block is mostly teacher planning language — "Grade 5 Advanced:
  // explains how data quality affects AI outputs" means nothing to a student and gives
  // away how they are being levelled. Only the success criteria, which the pack writes
  // for students, crosses to the browser.
  if (copy.formative) {
    copy.formative = { successCriteria: copy.formative.successCriteria || '' };
  }

  return copy;
}

/**
 * Fisher-Yates. Ordering questions ship shuffled, otherwise the items arrive in
 * the correct sequence and the question marks itself.
 */
function shuffle_(array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/**
 * The four strand definitions for a grade, keyed by strand code, each carrying
 * the official Emerging / Proficient / Advanced descriptors.
 *
 * This reads the framework catalogue extracted from ADEK's Scope & Sequence, not
 * anything authored locally — the descriptors a teacher judges against must be
 * ADEK's own wording, verbatim.
 */
function getStandardsIndex_(gradeKey) {
  return (FRAMEWORK.grades && FRAMEWORK.grades[gradeKey]) || {};
}

/** One strand's definition, or null. */
function getStrand_(gradeKey, strandCode) {
  return getStandardsIndex_(gradeKey)[String(strandCode).toUpperCase()] || null;
}

/** The published week-by-week sequence for a grade and track ('main'|'bridging'). */
function getSequence_(gradeKey, track) {
  const seq = (typeof SEQUENCES !== 'undefined' && SEQUENCES[gradeKey]) || {};
  return seq[track] || [];
}

/** Total marks available across a whole grade — the denominator for overall progress. */
function getTotalMarksForGrade_(gradeKey) {
  return listLessons_(gradeKey).reduce(function (sum, lesson) {
    const questions = (lesson.worksheet && lesson.worksheet.questions) || [];
    return sum + questions.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0);
  }, 0);
}

/**
 * Where a lesson sits in the programme.
 *
 * The platform originally showed a running lesson number — "Lesson 17" — which appears
 * nowhere in the curriculum. ADEK organises everything by WEEK, and so does a teacher
 * standing in front of a class. Worse, Weeks 7 to 10 of the Main Course are a single
 * continuous project: Week 9 asks students to judge "your signature solution" against
 * "the criteria the class agreed", both established in Weeks 7 and 8. Opened on its own
 * that reads as though something is missing, because something is — the weeks before it.
 *
 * This supplies the context a lesson needs to make sense of itself.
 */
function lessonContext_(gradeKey, lesson) {
  const track = lesson.track || 'main';
  const sequence = getSequence_(gradeKey, track);
  const course = getCourse_(gradeKey);
  const trackMeta = ((course.meta || {}).tracks || {})[track] || {};

  const entry = sequence.filter(function (w) { return w.weekNumber === lesson.week; })[0];
  const phase = entry && entry.phase ? entry.phase.replace(/\s*\d+$/, '').trim() : '';

  // The weeks that form one continuous piece of work, and what each contributes.
  const ARCS = {
    main: { name: 'Signature Solution', weeks: [7, 8, 9, 10],
            steps: { 7: 'planned it', 8: 'built it', 9: 'refined it', 10: 'showcased it' } },
    bridging: { name: 'Integrated mastery task', weeks: [5, 6],
                steps: { 5: 'designed and built it', 6: 'evaluated and presented it' } }
  };
  const arc = ARCS[track];
  const inArc = arc && arc.weeks.indexOf(lesson.week) !== -1;

  let continuesFrom = '';
  if (inArc) {
    const earlier = arc.weeks.filter(function (w) { return w < lesson.week; });
    if (earlier.length) {
      continuesFrom = 'This continues the ' + arc.name + ' you began in Week ' + earlier[0] +
        '. By now you have ' +
        earlier.map(function (w) { return arc.steps[w]; }).join(', then ') + '.';
    }
  }

  return {
    track: track,
    trackTitle: trackMeta.title || (track === 'bridging' ? 'Bridging Program' : 'Main Course'),
    week: lesson.week,
    weeksTotal: sequence.length || null,
    phase: phase,
    strand: entry ? entry.strand : '',
    arcName: inArc ? arc.name : '',
    arcPosition: inArc ? arc.weeks.indexOf(lesson.week) + 1 : null,
    arcTotal: inArc ? arc.weeks.length : null,
    continuesFrom: continuesFrom
  };
}
