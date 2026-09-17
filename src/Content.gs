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
  const course = CURRICULUM[gradeKey];
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
        hint: q.hint || ''
      };

      // Presentation data the student legitimately needs in order to answer.
      if (q.options) {
        safe.options = q.options.map(function (o) { return { id: o.id, text: o.text }; });
      }
      if (q.left)  safe.left  = q.left.map(function (o) { return { id: o.id, text: o.text }; });
      if (q.right) safe.right = q.right.map(function (o) { return { id: o.id, text: o.text }; });
      if (q.items) safe.items = shuffle_(q.items.map(function (o) {
        return { id: o.id, text: o.text };
      }));
      if (q.blanks)      safe.blanks = q.blanks;
      if (q.placeholder) safe.placeholder = q.placeholder;
      if (q.maxLength)   safe.maxLength = q.maxLength;

      return safe;
    });
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
