# Authoring lessons

Lessons are JSON files under `curriculum/<grade>/lessons/`. No code is involved — adding a
lesson means adding a file and listing it in `course.json`.

Run `npm run validate` after any edit. It catches the mistakes that matter: an answer key
pointing at a deleted option, a question tagged with a standard that does not exist, a
lesson no unit lists.

## Lesson file shape

```jsonc
{
  "id": "g6-l03",              // unique, referenced by course.json
  "number": 3,                 // shown to students
  "type": "core",              // "core" for lessons, "lab" for labs
  "title": "…",
  "summary": "…",              // one line, shown on the card
  "duration": "45 minutes",
  "standards": ["AI.6.1.1"],   // covered by the lesson overall
  "objectives": ["…"],
  "sections": [ … ],           // the teaching content
  "worksheet": { "title": "…", "questions": [ … ] }
}
```

Remember to add the new `id` to the right unit's `lessons` array in `course.json`, or
students will never see it. The validator warns when a lesson is orphaned.

## Text formatting

Three inline markers work anywhere student-facing text appears:

| Write | Renders as |
|---|---|
| `**important**` | **bold** |
| `*emphasis*` | *italic* |
| `[[key term]]` | a highlighted keyword chip |

Everything else is escaped, so lesson text can never inject markup into the page.

## Section types

| `type` | Fields | Use for |
|---|---|---|
| `text` | `heading`, `body[]` | Ordinary explanation. Each entry in `body` is a paragraph. |
| `list` | `heading`, `items[]` | Bulleted points. |
| `steps` | `heading`, `items[]` | Numbered instructions — renders with gold step circles. |
| `callout` | `label`, `body[]` | A boxed aside. Use for "Important", "Remember", "Before you start". |
| `vocabulary` | `heading`, `terms[{term, definition}]` | Key words, rendered as cards. |
| `activity` | `label`, `heading`, `body[]`, `items[]` | Off-screen or class work, visually distinct. |

## Question types

Every question needs `id`, `type`, `prompt`, `marks`, and `standards` — the standards tag
is what makes the question count toward attainment, so a question without one is wasted
assessment. The validator warns about it.

Optional on any question: `hint` (shown before submitting) and `feedback`
(`{correct, partial, incorrect, unanswered}`, shown after).

### `mcq` — one correct option
```jsonc
{ "type": "mcq", "marks": 2,
  "options": [{ "id": "a", "text": "…" }, { "id": "b", "text": "…" }],
  "answer": "b" }
```

### `truefalse`
```jsonc
{ "type": "truefalse", "marks": 1, "answer": false }
```

### `multi` — several correct options
```jsonc
{ "type": "multi", "marks": 3,
  "options": [ … ], "answer": ["a", "c", "d"] }
```
Scored as *(correct found ÷ total correct) − (distractors picked ÷ total distractors)*,
floored at zero. Ticking every box scores exactly nothing, so guessing is not rewarded.
**Always include at least one distractor** — with none, the penalty term cannot apply.

### `matching` — pair left to right
```jsonc
{ "type": "matching", "marks": 4,
  "left":  [{ "id": "l1", "text": "…" }],
  "right": [{ "id": "r1", "text": "…" }],
  "answer": { "l1": "r1" } }
```
Every left item needs an entry in `answer`. One mark-share per correct pair.

### `ordering` — put items in sequence
```jsonc
{ "type": "ordering", "marks": 4,
  "items": [{ "id": "s1", "text": "…" }],
  "answer": ["s1", "s2", "s3"] }
```
Items are shuffled before students see them. Credit per item in the right position.

### `numeric`
```jsonc
{ "type": "numeric", "marks": 2, "answer": 85, "tolerance": 0.5 }
```
`tolerance` is absolute and inclusive. Omit it for an exact match.

### `fillBlank` — several short answers in a row
```jsonc
{ "type": "fillBlank", "marks": 2,
  "blanks": ["first blank", "second blank"],   // placeholder text
  "answer": [["data", "examples"], ["rules", "instructions"]] }
```
Each entry in `answer` is the list of acceptable words for that blank. `blanks` and
`answer` must be the same length. Credit per blank.

### `shortText` — a sentence or paragraph
```jsonc
{ "type": "shortText", "marks": 3,
  "keywordsAny": ["pattern", "example", "learn"],
  "keywordsNeeded": 2,
  "modelAnswer": "…" }
```

Three ways to mark it, in order of strictness:

- `acceptedAnswers: []` — normalised exact match against any listed answer. Good for
  one-word or one-phrase answers.
- `keywordsAll: []` — every keyword must appear. All or nothing.
- `keywordsAny: []` with `keywordsNeeded: n` — credit scales with how many appear.
  This is the workhorse for extended answers.

Matching ignores case, punctuation and filler words (*a, the, is, of…*), so
"A computer program!" and "computer program" both match.

Always set `modelAnswer` — it is what students see after submitting, and it is what the
mark scheme effectively is.

**Be generous with `keywordsAny`.** The aim is to credit a student who understands the
idea, not one who guessed your exact vocabulary. List synonyms, and pitch
`keywordsNeeded` low enough that a correct answer phrased differently still passes.
A student wrongly marked down loses trust in the platform faster than a lenient mark
costs you.

## What auto-marking cannot do

This platform marks objective and keyword-matchable work. It does not judge the quality
of an argument, the elegance of an explanation, or anything genuinely open-ended. For
work like that, set it as an `activity` section and assess it off-platform — do not
disguise it as a `shortText` question, because the mark would not mean anything and it
would still count toward the student's recorded attainment.

## Before you commit

```bash
npm run validate   # content integrity + standards coverage
npm run test       # marking engine still behaves
```
