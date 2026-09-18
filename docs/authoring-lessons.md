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

## The lesson design system

Every section is given a **role** at build time, and the role — not the lesson, not the
grade — decides how it looks. A student learns the code once and it holds everywhere:

| Role | Looks like | Assigned when |
|---|---|---|
| `intro` | Purple panel, purple band | The first section of the lesson |
| `objectives` | White card, gold band, ticks | Heading starts *"I can"* |
| `vocabulary` | Purple panel, word cards | `type: vocabulary`, or a *"Words to know"* heading |
| `explain` | Plain, no chrome | Anything else — the reading baseline |
| `diagram` | Bordered figure | `type: diagram` |
| `reference` | Purple left band | `type: reference` |
| `important` | Purple tint, gold band | `type: callout` |
| `activity` | Warm gold panel, gold band | `type: activity`/`steps`, or *"Let's try it"* |
| `discuss` | Dashed purple band | Heading matches *"Think about it"* |
| `reflect` | Pale gold panel | Heading matches *"My reflection"* |

The colour logic is deliberately simple enough for a Grade 6 reader:

> **Purple — take this in.  Gold — do something.  Plain — read on.**

Roles are derived in `tools/assemble-grade6.js` from the published pack's own heading
conventions, which are identical in all 32 Grade 6 lessons. **A grade added later inherits
the whole system with nothing to configure**, provided the pack keeps those conventions.
Anything unrecognised falls back to `explain`, which degrades quietly rather than looking
broken.

To override, set `"role"` explicitly on a section.

## Filling gaps in the published pack

The packs refer to printed artefacts a teacher hands out — a dataset card, a criteria card
— and to figures that exist only as images in the PDF. A student reading on screen is told
to *"read the three lenses on the criteria card"* with no card in front of them.

Write those in `curriculum/<grade>/supplements.json`, never by editing a lesson file: the
assembler regenerates lesson files from the extraction, so a direct edit is lost on the next
build. Keeping them separate also means ADEK's material and AISA's additions stay
distinguishable, which matters because attainment hangs off the former.

```jsonc
{
  "g6-main-w9-core": [
    { "insertAfter": "Judging your solution three ways",   // a heading, "start", or "intro"
      "section": { "type": "reference", "heading": "The three lenses", "entries": [ … ] } }
  ]
}
```

Every supplement is marked `authored: true` and renders with a line saying it was added by
AISA and is not ADEK material. **Do not use supplements to change a worksheet task, a
look-for or a framework tag** — those feed a student's recorded attainment, and they must
stay as published.

### Two extra section types for this purpose

**`diagram`** — a declarative spec the interface draws as SVG. Lesson files hold no markup,
so nothing in a lesson can inject anything into the page.

```jsonc
{ "type": "diagram", "variant": "flow",        // or "compare"
  "heading": "…", "caption": "…", "altText": "…",   // altText is required for screen readers
  "nodes": [{ "label": "…", "detail": "…", "accent": true }],
  "edges": [{ "label": "so the model learns" }] }   // one fewer edge than nodes
```

`variant: "compare"` takes `left` and `right`, each `{ title, steps: [], accent }`.

Draw a diagram only where it shows a **mechanism** a sentence cannot — how a data flaw
becomes a wrong answer, how two systems differ. A box with a label on it is worth less than
the sentence it replaced.

**`reference`** — a card to consult, for the printed handouts students do not have.

```jsonc
{ "type": "reference", "label": "Criteria card", "heading": "The three lenses",
  "intro": "…",
  "entries": [{ "term": "Accuracy", "asks": "…", "test": "…" }] }
```

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

## Every worksheet question must be auto-marked

**No question in a worksheet may need a person to mark it.** AISA cannot staff teacher
marking, so an open question in a worksheet is not "assessed later" — it is never
assessed at all, and it silently drags the strand's evidence down because it counts in
the denominator and can never score.

This is a constraint on the *response format*, not on what you are allowed to assess.
The pack's own reasoning demands stay; you change how the student expresses them.

### Turning an open prompt into a closed one that tests the same thing

The pack usually pairs a closed cell with a reason cell (*"one mark per correct sort
with a matching reason"*). Keep the reason — make it selectable rather than written:

| Published prompt | Open form (don't) | Closed form that still tests it |
|---|---|---|
| "Sort each item and say why" | free text reason | `matching` — item → the reason that applies |
| "Explain how the sorter learns" | paragraph | `ordering` — put the training steps in sequence |
| "Which output is unfair, and why?" | paragraph | `mcq` for the output + `mcq` for which criterion decided it |
| "Give an example of…" | free text | `multi` — select every item that is an example |
| "What would you change?" | free text | `mcq` over the pack's own listed improvements |

The test of a good conversion: **a student who understands can pick the right option,
and one who doesn't can't.** If the distractors are so weak that the answer is obvious,
or so fine that it tests reading rather than the concept, the item is not doing the
pack's work — rewrite it or drop the mark.

`shortText` is still auto-marked (keyword matching, above) and is fine for a one-word or
one-phrase answer. It is **not** a way to smuggle in an essay: if a correct answer could
reasonably be phrased ten different ways, keyword matching will mark some of them wrong,
and a student wrongly marked down loses trust in the platform faster than a lenient mark
costs you.

### What genuinely cannot be closed

Some things can't be honestly assessed in a closed format: the quality of an argument,
a build, a showcase, a peer review. Put those in an `activity` section, which carries no
marks and no scoring. They are real work and students still do them — they are just not
part of the machine-marked evidence. **Never disguise one as a question**: the mark would
not mean anything and it would still count toward recorded attainment.

## How question marks become attainment

Marks never become a level on their own. Per strand, the platform proposes a level from
that student's auto-marked work (`CONFIG.SUGGESTION_THRESHOLDS` — 90 / 70 / 45, an AISA
convention that ADEK does not publish), a teacher asks one question pitched at that
tier, and confirms or changes it. Nothing reaches the record without that click.

Two consequences for you as an author:

- **Tag questions with the strand they actually evidence.** A mis-tagged question moves a
  proposal on the wrong strand, and the teacher sees a percentage that doesn't match the
  student in front of them.
- **Below three marked items a strand gets no proposal at all** (`SUGGESTION_MIN_ITEMS`).
  A strand with one question in the whole term is worse than one with none, because it
  reads as coverage that isn't there. Spread the tags.

## Before you commit

```bash
npm run validate   # content integrity + standards coverage
npm run test       # marking engine still behaves
```
