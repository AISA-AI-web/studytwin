# StudyTwin

A student-facing hub for the ADEK AI curriculum, built for the American International
School in Abu Dhabi.

Students work through lessons and labs, complete worksheets and get marked instantly.
Teachers and admins track progress and attainment against the AI Standards. It runs
inside AISA's own Google Workspace, costs nothing, and holds no student data outside
the school's existing systems.

## Why it exists

ADEK's Instructwin platform charges for the student-facing tier that lets students do
work and be tracked against the AI Standards. This provides that capability at no cost,
using infrastructure the school already has and already trusts.

## How it works

| Concern | Approach |
|---|---|
| **Hosting** | Google Apps Script web app — free, inside AISA's Workspace |
| **Sign-on** | Google Workspace SSO, locked to `@aisa.sch.ae` by Google itself |
| **Data** | A private Google Sheet owned by the school. No third-party processor |
| **Marking** | Server-side auto-marking across eight question types |
| **Attainment** | Teacher judgements per strand at Emerging / Proficient / Advanced, against ADEK's own descriptors |
| **Content** | Plain JSON under `curriculum/` — portable, not locked to Apps Script |

The reasoning behind the hosting choice, including the data-protection position and the
honest trade-offs, is in [`docs/hosting-and-compliance.md`](docs/hosting-and-compliance.md).

## Status

**Platform: complete and tested.** Auth, data layer, marking engine, attainment
tracking, student hub, teacher dashboard and admin tools all work.

**Attainment model: aligned to ADEK.** Four strands (CU, SD, CE, GE), each judged by a
teacher at Working towards / Emerging / Proficient / Advanced against the framework's own
descriptors. The overall level is computed by each grade's published decision rule — these
differ between grades, so they are per-grade config. No percentage produces a level
anywhere; worksheet marks are recorded as *product evidence*, one of the three sources
ADEK requires a judgement to triangulate across. See
[`docs/adek-alignment.md`](docs/adek-alignment.md).

**Content: provisional.** Grade 6 ships with one core lesson and one lab written as
structurally complete placeholders, so the whole system can be seen working end to end.
Every file carrying placeholder content is marked `"provisional": true`.

> The lesson content and worksheet questions currently in `curriculum/grade6/lessons/`
> are **not** the official ADEK material and must be replaced with the published Grade 6
> pack before this is used for real reporting. The standards themselves are real: they are
> extracted from ADEK's published Scope & Sequence into `curriculum/framework/`.

## Repository layout

```
curriculum/          Lesson content as JSON — the source of truth
  source/            Original ADEK documents, unmodified
  grade6/
    course.json      Units and the lessons in each
    lessons/         One JSON file per lesson or lab
  framework/         Extracted from ADEK's Scope & Sequence — the authoritative
                     standards catalogue and published week-by-week sequences
src/                 The Apps Script project (pushed by clasp)
  Config.gs          Domain, attainment bands, sheet schema
  Auth.gs            Identity, domain guard, roles
  Db.gs              Sheets data layer with write locking
  Marking.gs         Auto-marking engine
  Attainment.gs      Strand profiles, the per-grade decision rule, class rollup
  Content.gs         Content access + answer-key stripping
  Api.gs             Everything the browser may call
  Code.gs            Web app entry point
  ui/                The single-page app
tools/               Build, validation and tests
docs/                Deployment, authoring and compliance notes
```

## Getting started

```bash
npm install
npm run check      # syntax-check all Apps Script and UI code
npm run validate   # check curriculum integrity and standards coverage
npm run test       # run the marking engine tests
npm run build      # compile curriculum JSON into the Apps Script project
```

### See it without deploying

```bash
npm run preview
```

Writes `preview/index.html` — open it in any browser. It inlines the real marking,
content and attainment code with a demo cohort, so worksheets are genuinely marked by
the same engine that runs in production. A bar at the top switches between the student,
teacher and admin views. Nothing is saved; reload to reset.

To deploy it for real, follow [`docs/deployment.md`](docs/deployment.md).
To write or edit lessons, follow [`docs/authoring-lessons.md`](docs/authoring-lessons.md).

## Security notes

Two things hold the whole model together and are easy to break by accident:

1. **The web app must be deployed as "Execute as: Me" and "Who has access: AISA".**
   Flipping the first to *User accessing* would require giving every student write access
   to the spreadsheet holding all the marks. `src/Auth.gs` explains this in full.

2. **The datastore spreadsheet must never be shared with students.** The app is the only
   thing that should touch it.

Answer keys are stripped server-side before any lesson reaches a browser, and marking
happens on the server against the authoritative content, so scores cannot be forged from
the client. `tools/test/marking.test.js` asserts both.

## Extending to other grades

Add `curriculum/grade7/` with the same three pieces — `course.json`, `standards.json`,
and a `lessons/` folder — and it appears automatically. The build, validator, marking
engine, dashboards and attainment tracking are all grade-agnostic.
