# ADEK alignment: assessment, attainment and progress tracking

> **Provenance.** Produced by a structured analysis of the four source documents in
> `curriculum/source/`: five parallel readers (assessment model, attainment
> representation, content/sequence model, platform gap analysis, reporting risks),
> each finding then independently re-checked against the source by a separate
> adversarial pass. 30 findings were checked; 19 were supported as stated and 11
> were corrected. The synthesis below reflects the corrected set.
>
> The most load-bearing claim — a strand-code defect in our own extractor that
> reached Grade 6 — was verified by hand against the source HTML before acting on
> it, and has since been fixed (see `tools/extract-scope-sequence.js`).
>
> Where this document says "ADEK requires", that holds for the framework, strands,
> tiers and codes, which come from the Scope & Sequence. The assessment machinery
> (diagnostic, checkpoints, rubric, observation record, moderation) is prescribed
> by the published Teacher Packs rather than the framework document — the text
> distinguishes the two.

# Does StudyTwin make us aligned with how ADEK asks for assessment, attainment and progress tracking?

**Short answer: not yet, and not by accident of detail — the current attainment model is the wrong shape and its vocabulary means the opposite of ADEK's.** A student who exactly meets ADEK's expected Term 1 standard is currently recorded by StudyTwin in its bottom band, below a 50% "pass" line that ADEK does not have. That would misreport every Grade 6 student in the school's records.

The platform is nevertheless the right vehicle. Everything ADEK asks for is recordable — it is just a different data shape: four strand rows of criterion judgements per student, not one percentage. The changes below are contained (one config block, one module, four endpoints, two new sheets) and after them the school's records line up with the ADEK observation record field for field.

One framing point that governs the whole document: the Scope & Sequence supplies outcomes, strands, tiers and codes. **The entire assessment apparatus — diagnostic, checkpoints, rubric, observation record, moderation — lives only in the published Teacher Packs**, which credit their assessment design to AERA/APA/NCME, the Assessment Reform Group, OECD, Bloom, Webb and CAST. So "ADEK requires" is accurate for the framework and the codes; for the recording machinery the honest phrase is "the published Grade 6 Teacher Pack prescribes". Where neither says anything, I say so and give a default.

---

## 1. WHAT ADEK ACTUALLY REQUIRES

### 1.1 The unit of attainment is the strand, and there are exactly four

Grade 6 (`curriculum/framework/standards.json` → `grades.grade6`):

| Code | Strand |
|---|---|
| CU | AI Conceptual Understanding |
| SD | AI Solution Design & Development |
| CE | Critical Evaluation & Informed Interaction |
| GE | Ethics & Governance |

A student's record at any point is **four independent judgements**, one per strand. Cross-strand compensation is explicitly banned: *"Halo effect. Level each strand on its own evidence; a strong Part 2 design does not lift a weak Part 4 audit."* A mixed profile is the designed case, not an edge case — the start-of-year diagnostic routes students into some Bridging weeks and not others on exactly that basis.

### 1.2 The scale is four criterion-referenced levels, never a percentage

| Level | Meaning |
|---|---|
| **Working towards** | *"If a student cannot yet meet the Emerging descriptor in a strand even with support, record 'working towards' and use the linked bridging content before re-checking. **This is diagnostic information, not a failure.**"* |
| **Emerging** | **The expected standard for Term 1** and the outcome each Main Course week secures. |
| **Proficient** | The national entitlement standard; the target for the full year; the planned stretch in every lesson. |
| **Advanced** | Further stretch — and the prior-grade bar that Bridging rebuilds. |

A level is awarded by matching observable performance to a written descriptor: *"Judge each strand independently against the descriptors below. Circle the observed level. The rubric describes observable performance, so two teachers using it on the same evidence should reach the same level."* There is no mark-to-tier conversion anywhere in the corpus. **A Term 1 dashboard showing most students at Emerging is the framework working as designed.** The UI must not render Emerging as a deficit.

### 1.3 The overall level is a count of strands, not an average

Grade 6's rule (`g6.txt:11315-11332`) — note it **differs from Grade 7's**, so do not copy G7:

- **Emerging (expected):** at least 3 of 4 strands at Emerging or above.
- **Proficient:** at least 3 of 4 strands at Proficient or above, with none below Emerging.
- **Advanced:** at least 3 strands at Advanced, with no strand below Proficient.

Worked tie-breaks are published: Proficient on three strands but Emerging on one is **Proficient** overall; Advanced on two and Proficient on two is **Proficient** (Advanced needs three). No arithmetic mean can reproduce this — a floor condition is not an average.

### 1.4 What is assessed, when (Grade 6, Term 1)

| Instrument | When | Scale | Recorded? |
|---|---|---|---|
| **Start-of-year diagnostic**, 4 stations, ~30 min, outside timetabled hours | Before Bridging teaching begins | mastery / partial / not-yet per strand | Class readiness tracker. *"It is not graded and no mark is reported to students."* |
| **Bridging weeks B1–B6** | 6 weeks before Main Course | Per-lesson rubric `Criterion / Mastery / Partial / Not yet` | Formative only |
| **Per-lesson formative check** (every Core and every Lab, 32 of them) | Every lesson | Per-lesson rubric `Criterion / Emerging (expected) / Approaching / Not yet` (Main Course) | Formative; *"Use the per-lesson formative check to confirm the outcome before moving on."* |
| **Checkpoint 1** — CU + SD | After Week 3 | E / P / A look-fors + a named feedback move | Assessment *for* learning |
| **Checkpoint 2** — CE + GE | After Week 5 | E / P / A look-fors + a named feedback move | Assessment *for* learning |
| **Final Assessment** — 4 parts, 55–70 min, 25% each | **End of the unit (Week 10)** for Grade 6 | Analytic rubric, E/P/A per strand + working towards | **This is the record.** Observation record per student. |

Grade 6's summative runs in Week 10; Grade 7's runs after Week 8 and Grade 8's after Week 9. Treat "when to run" as a per-grade field, not a rule.

The four summative parts map one-to-one onto the strands: Part 1 *How the sorter learns* → CU (Worksheet + talk); Part 2 *Plan and build* → SD (Plan sheet + tool run); Part 3 *Evaluate the outputs* → CE (Evaluation sheet); Part 4 *Fair, safe and responsible* → GE (Worksheet + short conversation). **The 25% weights are task-design emphasis — "Each strand carries roughly equal weight so no single strand dominates the overall judgement" — not marks to be summed. Do not implement them as arithmetic.**

### 1.5 Evidence must be triangulated

*"Base each judgement on three sources of evidence, not one worksheet."* Grade 6's own mapping of source → strands it best evidences:

| Source | Strands it best evidences |
|---|---|
| **Products** (what students make) | SD; CE |
| **Observations** (what students do) | CU; CE |
| **Conversations** (what students say) | CU; GE |

**For Grade 6, products are not an evidence source for CU or GE at all.** That single table is the strongest constraint on this platform and I return to it in §4.

Judgements are then **moderated**: teachers independently level the same 2–3 anonymised student pieces, compare, and record any task-specific decisions so the team applies them the same way.

### 1.6 The record ADEK prescribes

The Grade 6 Teacher Pack's observation record, one per student, field for field:

```
Student name / Class ______________________  Date: ______
AI Conceptual Understanding          E  P  A   Note: ______
AI Solution Design and Development   E  P  A   Note: ______
Critical Evaluation and Informed Interaction  E  P  A   Note: ______
Ethics & Governance                  E  P  A   Note: ______
Overall judgement          EMERGING   PROFICIENT   ADVANCED
Access arrangements used  __________________________________
Next step / bridging      __________________________________
```

And the reporting instruction: *"Report each student against the four strands and the overall level, and turn the result into a next step."* There is no score field anywhere on it.

### 1.7 The standard code format

```
AIF · <CU|SD|CE|GE> · G<grade> · <E|P|A>
 │        │              │          └── tier: E Emerging, P Proficient, A Advanced
 │        │              └───────────── grade, e.g. G6 (or G5/G4 for a Bridging reference)
 │        └──────────────────────────── strand segment
 └───────────────────────────────────── the framework
```

Separator is the middle dot `·` (U+00B7), not a full stop. Two rules govern which code a lesson carries:

- **Main Course lessons are referenced to the teaching grade at Emerging** → `AIF·CU·G6·E`, `AIF·SD·G6·E`, `AIF·CE·G6·E`, `AIF·GE·G6·E`.
- **Bridging lessons are referenced to the prior grade at Advanced** — *because Bridging rebuilds each strand to prior-grade Advanced mastery.* Grade 6's four are `AIF·CU·G5·A`, `AIF·SD·G5·A`, **`AIF·CE·G4·A`** and `AIF·GE·G5·A`. Critical Evaluation reaches back **two** grades because the strand paused at Grade 5. **Never compute a bridging code as grade-minus-one** — read it from `sequences.json` bridging `frameworkRefs`, which already has this right.

Two more shapes exist and any parser must tolerate them: the collapsed integration form `AIF·CU/SD/CE/GE·G6·A`, and the Grades 1–3 unit form `AIF·G1 (unit)`.

The tier letter in a code is **the target the lesson is referenced to**, never the level a student achieved. A Grade 6 Bridging lesson is tagged `·G5·A` while a Grade 6 student sits in it; if a code doubled as a result, every bridging student would read as Advanced at Grade 5.

The Scope & Sequence prints codes only in Bridging tables — but it states the Main Course rule in its legend and tabulates "Main Course referenced to: Grade 6, Emerging" per grade, and the Grade 6 Teacher Pack prints all 28 Main Course codes explicitly. Main Course codes are derivable and verifiable; we are not inventing them.

---

## 2. WHERE WE ARE MISALIGNED

Most serious first.

### 2.1 `src/Config.gs:20-30` — `ATTAINMENT_BANDS` is invented, and its labels invert ADEK's meaning

```js
ATTAINMENT_BANDS: [
  { key: 'mastery',    label: 'Mastery',    min: 85 },
  { key: 'secure',     label: 'Secure',     min: 70 },
  { key: 'developing', label: 'Developing', min: 50 },
  { key: 'emerging',   label: 'Emerging',   min: 0  }
]
```

The comment on line 23, *"Mirrors the four-point scale ADEK uses for the AI Standards"*, is false. The words *secure* and *developing* appear nowhere in the framework as levels. The numbers 85/70/50 appear in none of the four source documents. The two colours are our own AISA brand hexes, which is itself a tell that this block was authored locally.

The serious defect is not the invention, it is the **inversion**: `emerging` is our floor band (`min: 0`, i.e. 0–49%, below the pass line) while ADEK's Emerging is *the expected standard for Term 1*. A Grade 6 student who does exactly what ADEK expects is filed by StudyTwin under a label that reads to parents, teachers and inspectors as failure. `mastery` is also a collision: in the packs "Mastery" is a Bridging readiness level about the *prior* grade's Advanced bar, not an attainment ceiling.

This must be **deleted, not renamed**.

### 2.2 `src/Attainment.gs` — `computeAttainment_()` and `bandFor_()` derive a tier from a percentage, three times over

- Line 60–62: per-code `percent = awarded/available*100` → `bandFor_(percent)`.
- Line 80–81: an overall percentage across all marks → `bandFor_()` again. This averages across strands and is a halo by construction — precisely the pitfall the moderation guide names.
- `computeClassAttainment_()` line 131–132: averages the **cohort's** marks and bands that. A third percent-to-tier conversion with no ADEK counterpart at all.

Three further faults in the same function: `totals` is keyed on every arbitrary code seen rather than the four strands; `overall.standardsEvidenced / standardsTotal` counts a standard as "evidenced" the moment one MCQ is marked and must not be presented as coverage; and the module has no concept of tier at all, so it cannot distinguish `AIF·SD·G6·E` from `AIF·SD·G6·A`.

### 2.3 `src/Config.gs:33` `PASS_PERCENT: 50` and its three gates in `src/Api.gs`

ADEK has no pass mark, cut score or grade boundary. Its below-expectation state is explicitly *"diagnostic information, not a failure"*; the response is bridging content and a re-check.

Load-bearing in four places, all of which need rethinking:
- `Api.gs:72` — lesson card status `'complete'` vs `'attempted'`
- `Api.gs:150-151` — `const passed = marked.percent >= CONFIG.PASS_PERCENT` drives `recordProgress_` status and `completedAt`
- `Api.gs:159` — `passed` returned to the **student**
- `Api.gs:214` — `lessonsCompleted` / `percentComplete` in `api_getClassOverview`

It also conflates two different things: whether a worksheet was submitted (a fact we can legitimately record) and whether an outcome was secured (a descriptor judgement only a teacher can make).

### 2.4 There is nowhere to store a teacher judgement

`COLUMNS.SUBMISSIONS` (`Config.gs:56`) holds `marksAwarded, marksAvailable, percent, answersJson, resultsJson` — the products leg, and only its machine-markable part. `COLUMNS.PROGRESS` holds a per-lesson status with no strand, no track and no week. There is no column anywhere for a strand level, a note, access arrangements, a next step, an evidence source, or a moderation decision. The record ADEK prescribes (§1.6) currently cannot be stored at all.

### 2.5 `curriculum/grade6/standards.json` and the lesson tags are fabricated

Ten codes `AI.6.1.1` … `AI.6.4.2`, all flagged `provisional: true`, under four strand names that do not exist in the framework (*Understanding AI, Data and Machine Learning, Ethics and Society, Creating with AI*). `g6-l01.json` and `g6-l02.json` tag their questions with them. The dotted form cannot express a tier at all. Replace with the real codes from `curriculum/framework/standards.json`.

### 2.6 Teacher-facing surfaces report one number per student

- `Api.gs:194` `api_getClassOverview` returns `percentComplete`, `overallPercent`, `band`, `bandLabel`, `bandColor`.
- `src/ui/App.html:730` computes a class average by summing `st.overallPercent`; line 753 renders a `%` cell; line 754 renders a single band chip.
- `Api.gs:394` `api_exportCsv` header ends `['Overall %', 'Band']` — this is the artefact that would leave the building.
- `Api.gs:248` `api_getStudentDetail` returns per-lesson percents only.

Against *"route per strand — not by one overall number"* and *"Report each student against the four strands and the overall level."*

### 2.7 No track dimension: Bridging is assessed against a different grade

Six Bridging weeks are assessed against Grade 5 (and Grade 4 for CE) Advanced descriptors, ten Main Course weeks against Grade 6 Emerging. Nothing in `PROGRESS`, `SUBMISSIONS` or `course.json` distinguishes them, so the code implicitly assumes the standard's grade equals the student's grade. It does not.

### 2.8 Published entities with no home in the schema

The start-of-year diagnostic; the readiness tracker; the two checkpoints (anchored to "after Week 3" / "after Week 5", not to a lesson id); the signature artefact carried across Weeks 7–10; the per-Lab tool + unplugged-fallback pair with its "run exactly one" rule; the moderation record.

### 2.9 Content schema is flat where ADEK's is week-shaped

`curriculum/grade6/course.json` is a single unit with `"lessons": ["g6-l01","g6-l02"]`. ADEK's unit of delivery is the **week**, which owns the strand, the *Outcome secured (Emerging)* descriptor and the *Planned stretch (Proficient)* descriptor, and contains 1–3 lessons (Core, Lab, and occasionally Foundation or Extra). None of those week properties has anywhere to live.

### 2.10 Two extraction defects to fix before building on the framework files

- **`standards.json` assigns strand letters by row position; ADEK assigns them by strand name.** The two agree for Grades 6–12 and disagree for KG1–G5. The concrete consequence for us: `AIF·SD·G5·A` resolves in our catalogue to *"Suggests improvements to make data more reliable"* (Data Literacy) when ADEK uses it for *"Refines prompts to improve output quality and explains why"* (AI Solution Design & Development) — which is exactly the code Grade 6 Bridging Week 2 carries, thirteen times in the published pack. One of our four Grade 6 bridging codes currently resolves to the wrong descriptor.
- `sequences.json` carries no Main Course framework refs (all `None` above), has no version or extraction-date stamp, and Grade 9's Week 2 lost a published lesson to title concatenation.

---

## 3. THE ALIGNED MODEL

### 3.1 Replace the bands with an ordered level enum carrying no thresholds

```js
// Config.gs — replaces ATTAINMENT_BANDS and PASS_PERCENT entirely.
// Source: ADEK K-12 AI Fluency Framework (Draft V4), three tiers; plus the
// "working towards" state prescribed in the published Grade 6 Teacher Pack.
ATTAINMENT_LEVELS: [
  { key: 'working_towards', label: 'Working towards Emerging', letter: '—', ordinal: 0, isTier: false,
    note: 'Diagnostic information, not a failure. Use linked bridging content, then re-check.' },
  { key: 'emerging',   label: 'Emerging',   letter: 'E', ordinal: 1, isTier: true,
    note: 'The expected standard for Term 1.' },
  { key: 'proficient', label: 'Proficient', letter: 'P', ordinal: 2, isTier: true,
    note: 'National entitlement standard; target for the full year.' },
  { key: 'advanced',   label: 'Advanced',   letter: 'A', ordinal: 3, isTier: true }
],
```

Three other scales exist and must **not** be folded into this one. Store a scale discriminator on every assessment event:

| Scale | Values | Used for |
|---|---|---|
| `summative_tier` | working_towards / emerging / proficient / advanced | Strand judgements, checkpoints, the record |
| `formative_criterion` | not_yet / approaching / emerging | Per-lesson Main Course rubrics (20 lessons) |
| `bridging_readiness` | not_yet / partial / mastery | Diagnostic, Bridging lesson rubrics (12 lessons) |

Note on `formative_criterion`: its top level is literally *"Emerging (expected)"*, so the three sit on the same continuum below the framework's Emerging bar — `not_yet → approaching → emerging → (proficient) → (advanced)`. Use those keys so the link to the reportable tier survives; but it must not roll up automatically into the term judgement. Bridging lesson rubrics genuinely use the mastery/partial/not-yet words, so the rubric vocabulary is per-lesson authored data read from the content file, not a global constant.

### 3.2 Data shape

Two new sheets alongside the existing five.

```js
JUDGEMENTS: ['id','email','grade','track','strand','level','scale',
             'assessmentEvent','frameworkRefs','evidenceProducts','evidenceObservations',
             'evidenceConversations','note','accessArrangements','nextStep','bridgingRef',
             'judgedBy','judgedAt','moderatedLevel','moderatedBy','moderationNote','supersededBy'],

READINESS:  ['email','grade','strand','probeCode','result','action','recheckAfterWeek',
             'recordedBy','recordedAt'],
```

- `track` ∈ `main | bridging`. `strand` ∈ `CU | SD | CE | GE`. `scale` ∈ the three above.
- `assessmentEvent` ∈ `checkpoint1 | checkpoint2 | final | interim`.
- `frameworkRefs` is the full code(s) the judgement is against — `AIF·CU·G6·E` for Main Course, `AIF·CE·G4·A` for Bridging CE. This is where the "assessed against a different grade" fact lives.
- The three `evidence*` columns are short free text naming the artefact/observation/conversation, mirroring what the pack asks teachers to collect. A judgement with fewer than two sources populated should render with a "single-source" warning, not be blocked.
- `READINESS.result` ∈ `mastery | partial | not_yet`; `action` ∈ `proceed | focus_group | primer`. `probeCode` comes from `sequences.json` bridging `frameworkRefs` — for Grade 6 that is `AIF·CU·G5·A`, `AIF·SD·G5·A`, `AIF·CE·G4·A`, `AIF·GE·G5·A`.
- Judgements are append-only with `supersededBy`, so a re-check after bridging leaves an audit trail rather than overwriting. ADEK is silent on revision; append-only is the defensible default for an inspectable record.

Add `track` and `weekNumber` to `COLUMNS.PROGRESS`, and `bridgingStrands` to `COLUMNS.ROSTER` (routing is per strand, so a student may be in Bridging for CE only).

### 3.3 How a level is awarded

**By a teacher, against a descriptor. Never computed from marks.** The platform's job is to put the right evidence in front of the judgement, not to make it.

The flow: teacher opens a student's strand row → sees the Grade 6 Emerging / Proficient / Advanced descriptors verbatim for that strand → sees the auto-marked worksheet evidence for that strand, clearly labelled *Products — one of three sources* → sees the observation and conversation notes they have entered → selects a level, types a note, records access arrangements and a next step.

The platform may **suggest** a level from auto-marked evidence, but only if it is labelled in the UI as *"StudyTwin suggestion — school convention, not an ADEK rule"* and never pre-fills the stored value. ADEK publishes no mark-to-tier conversion, and inventing one silently is what makes a record indefensible. My recommendation was to ship without a suggestion engine for Term 1 and see whether teachers ask for one.

**That recommendation was overtaken by an operational constraint, and the design changed accordingly.** AISA cannot staff any teacher marking: every worksheet is auto-graded, and no open response is queued for a person to correct. A suggestion engine is therefore not an optional convenience — without it there is no route from evidence to a level at all, and the four strand rows would simply stay empty all term.

So the platform does suggest, and §3.3a describes exactly how, what it does not claim, and what a teacher still has to do before a level is recorded.

### 3.3a The confirmation step: what replaced teacher marking

The constraint is on **marking**, not on **judgement**. Those are different tasks, and the distinction is what keeps the record defensible:

- *Marking* is scoring 159 written answers against a mark scheme. That is the work the school cannot staff, and it is the work the auto-graded item types remove.
- *Judgement* is deciding that a student is Proficient on Systems & Data. ADEK requires a person to make it, and it takes about a minute per student — not per answer.

The implemented flow: the platform proposes a level per strand from that student's auto-marked work → the teacher is shown, beside each proposal, one question pitched at the tier being proposed → they ask it → they confirm or change the level → one click records all four.

Three properties make this survive scrutiny rather than being mark-to-tier conversion with an extra click:

1. **The thresholds are labelled as ours.** `CONFIG.SUGGESTION_THRESHOLDS` (90 / 70 / 45) is an AISA convention. The panel says so on screen, in those words. ADEK publishes no such mapping and we do not imply one exists.
2. **What was proposed and what was recorded are both stored.** Every judgement row carries `source` (`suggestion_confirmed` or `teacher_override`) and `suggestedLevel`. A moderation or inspection question — *how many of these levels did a person actually think about?* — is answerable from the sheet. A record that cannot answer it is not a record.
3. **The question supplies the missing evidence leg.** This matters most for the two strands §4.1 identifies: for Grade 6, products are **not** an evidence source for CU or GE. A CU or GE level resting on auto-marked worksheets alone is evidencing the wrong thing, whatever the percentage. The prompt the teacher asks is a *conversation*, which is precisely the source the pack names for those strands — so the confirmation step is not a formality on CU and GE, it is the evidence.

The platform still refuses to synthesise. `suggestLevelsFromEvidence_` returns no proposal at all below `SUGGESTION_MIN_ITEMS` (3) marked items — it says *too little to suggest from* rather than guessing — and nothing is written to the record until a teacher clicks. A proposal that is never confirmed is not attainment, and does not appear as such anywhere.

### 3.4 The overall level: a count, implemented literally

```js
// Attainment.gs — replaces bandFor_() and the two percent→band paths.
// Grade 6 decision rule, published Grade 6 Teacher Pack §7.
// NOTE: Grade 7's Emerging rule differs ("0-2 strands at Proficient, the rest
// at Emerging"), so this table is per-grade config, not a constant.
function overallLevelFrom_(strandLevels /* {CU,SD,CE,GE} */, gradeRule) {
  const ord = s => LEVEL_ORDINAL[strandLevels[s]];        // undefined => not yet judged
  const all = ['CU','SD','CE','GE'];
  if (all.some(s => strandLevels[s] == null)) return { level: null, reason: 'incomplete' };

  const atOrAbove = n => all.filter(s => ord(s) >= n).length;
  const noneBelow = n => all.every(s => ord(s) >= n);

  if (atOrAbove(3) >= 3 && noneBelow(2)) return { level: 'advanced',   rule: '>=3 Advanced, none below Proficient' };
  if (atOrAbove(2) >= 3 && noneBelow(1)) return { level: 'proficient', rule: '>=3 Proficient or above, none below Emerging' };
  if (atOrAbove(1) >= 3)                 return { level: 'emerging',   rule: '>=3 at Emerging or above (Grade 6 rule)' };
  return { level: 'working_towards', rule: 'fewer than 3 strands at Emerging' };
}
```

Return the `rule` string with the level so the teacher view can show *why* — that is what makes the record auditable and what makes the published tie-break cases self-evidently handled. **No overall level at all until all four strands are judged**; `null` with `reason: 'incomplete'` is the honest state, not a default of Emerging.

`computeClassAttainment_()` loses `averagePercent` and the cohort-average-then-band step entirely. It becomes: per strand, a count of students at each of the four levels — which is what tells a teacher which strand the class is weak on.

### 3.5 What a question is tagged with

Structured, not a string:

```json
{
  "id": "g6-w2-core-q3",
  "type": "mcq",
  "marks": 2,
  "frameworkRef": { "framework": "AIF", "strand": "CU", "grade": 6, "tier": "E",
                    "code": "AIF·CU·G6·E" },
  "track": "main",
  "week": 2,
  "evidenceType": "product",
  "tierProbed": "emerging"
}
```

- `tier` on the ref is the **target** the lesson works to. `tierProbed` is which descriptor the item stretches toward (a Challenge item probes `proficient`). Neither is ever a result.
- `evidenceType: "product"` is the honest label: this item can only ever contribute the products leg.
- Integration weeks (W1, W6–W10) carry all four refs — that is ADEK's own practice, not a gap.

### 3.6 What a teacher sees

**Class overview** — replace `overallPercent` / `band` / `bandLabel` / `bandColor` with:

```
Student          CU   SD   CE   GE   Overall      Next step
Amina H.         E    P    E    —    Emerging     Re-check GE after primer
Yousef A.        P    P    P    E    Proficient   Stretch: CE evidence in W9
Layla M.         E    ·    E    E    incomplete   SD not yet judged
```

with `—` = working towards, `·` = not yet judged, and Emerging rendered in a neutral or positive colour with the tooltip *"Expected standard for Term 1"*. **Emerging must not look like a warning state.**

**Student detail** — the observation record, laid out as ADEK prints it: four strand rows with level, note and the three evidence sources; overall judgement with the decision rule that produced it; access arrangements used; next step / bridging link. Below it, collapsed: worksheet scores per lesson, labelled *Product evidence*.

**CSV export** (`api_exportCsv`, header currently ending `['Overall %','Band']`):

```
Email, Name, Class, CU, CU note, SD, SD note, CE, CE note, GE, GE note,
Overall level, Decision rule, Access arrangements, Next step, Judged by, Judged at, Moderated
```

That is the ADEK observation record, field for field, and it is the artefact to hand an inspector.

**Also needed:** a moderation view that shows 2–3 anonymised student sets side by side with the rubric, and a field to record the agreed task-specific decisions the pack asks teachers to log.

### 3.7 Should we keep percentages at all? Yes — in exactly four places, none of them attainment

This is the question that matters most, so plainly:

| Percentage | Keep? | Role |
|---|---|---|
| **Item-level marks** on a worksheet question | **Keep.** | ADEK's own Marking notes award marks — *"One mark for the correct prediction, one for a justification that references the range or balance of the training data."* Marks are faithful. They terminate at the item. |
| **Worksheet score** for one submission (`marksAwarded/marksAvailable`) | **Keep, relabel.** | Shown to the teacher as `worksheetScore`, filed under *Product evidence*. Never mapped to a level, never a pass mark, never summed across lessons, and it does not decide lesson status. |
| **Coverage %** (weeks taught / weeks in the sequence) | **Keep, relabel.** | This is legitimate and is precisely what the Scope & Sequence exists for — *"an assessment lead should be able to audit coverage against the framework."* But it measures **teaching**, not attainment. Label it *Coverage*, keep it on a separate screen from levels, and render the four counters ADEK audits on (main lessons, single-strand weeks, integration weeks, bridging lessons) so our figure reconciles with the published Grade 6 row: **20 / 4 / 6 / 12**. |
| **Diagnostic routing %** (40 / 15–39 / <15) | **Do not implement for Grade 6.** | These thresholds are published for Grades 7 and 8 only. The **Grade 6 Diagnostic Kit has no percentage rule and no Readiness Gate table** — it records mastery/partial/not-yet directly and closes residual gaps with *"Any strand still 'not-yet' after bridging is closed just-in-time via the Primer in the relevant Week 7+ lesson."* Make routing thresholds per-grade config that can be **absent**. Where they do apply, they are routing only and are never shown to students. |

And the one hard rule: **no percentage may ever produce, influence or be displayed adjacent to a strand level or an overall level.** A number and a judgement on the same row will be read as the same thing.

Delete `PASS_PERCENT`. Set `PROGRESS.status` from submission alone (`not_started | in_progress | submitted`). Drop `passed` from the `api_submitWorksheet` return — stop telling a student they passed. Show them their marks, their feedback, and, when a teacher has recorded it, their strand profile and their next target. The Week 10 Lab already defines that student-facing shape: a tracker with columns *Strand / Emerging evidence / Feedback received / Term-2 focus*, plus one Term-2 goal.

---

## 4. WHAT AUTO-MARKING CANNOT EVIDENCE

### 4.1 The structural limit, stated precisely

Auto-marking supplies **products**, one of three required sources. For Grade 6 the pack's own table is sharper than that: **products are not listed as an evidence source for CU or GE at all.** CU is evidenced by observations and conversations; GE by conversations alone. So for half the strands in the grade we are building, a machine-marked worksheet is not merely the weakest leg — it is not a leg ADEK names. Any CU or GE figure derived from auto-marking alone is evidencing the two strands ADEK routes to talk.

Beyond coverage, three things a mark scheme structurally cannot see, all named as moderation pitfalls:

- **Independence.** *"Counting scaffolding as independence. If the workflow order or the risk rating needed heavy teacher prompting, it is Emerging, not Proficient."* Our `MAX_ATTEMPTS: 3, best attempt counts` actively works against this — a third-attempt correct answer is not equivalent to independent first-attempt performance and must be flagged as such in the evidence view.
- **Reasoning over fluency.** *"A confident talker who cannot order the workflow or link the output to a criterion is still Emerging on that strand."*
- **Evidence-citing judgement.** Proficient on CE requires that each verdict *"names a criterion and points to the exact word, fact or item that decided it."* `markShortText_` (Marking.gs:182–214) does exact-match, substring and keyword counting. It cannot make that distinction, and keyword-matching it would award Proficient to a student who used the right vocabulary about the wrong item.

### 4.2 What genuinely is auto-markable — don't overstate the limit either

It would be wrong to say nothing in the curriculum is machine-markable. Published Grade 6/7 material contains card sorts into Input/Process/Output, four-option MCQs, multi-selects, "Matches the answer key? (tick or fix)" columns, checkbox dataset rules, and accuracy arithmetic. Integration weeks are not wall-to-wall performance tasks.

But **no closed cell ever stands alone**. Every one is paired in the same row with a reason / evidence / correction cell, and the published mark is conditional on that reason: *"One mark per correct sort with a matching reason; the reason must reference giving-in, changing, or coming-out."* Auto-marking the closed column alone would systematically over-award.

The original answer was: mark the closed cell, queue the paired open cell for the teacher, and do not report the item as marked until both are resolved. **With no teacher marking available (§3.3a) that queue has nowhere to go**, so the reason has to be captured in a form a machine can judge — the student selects *which* reason from the published set, orders the steps, or matches the verdict to the criterion that decided it. The reason is still assessed and still conditions the mark; it is the response format that changed, not the demand. Where a reason genuinely cannot be put in a closed form without testing something other than what the pack asks, the item carries no mark and the strand leans on the confirmation conversation instead.

### 4.3 What needs teacher judgement, concretely (Grade 6)

Everything in the Final Assessment. All four parts are performance evidence at 25% each: Part 1 is *Worksheet + talk*, Part 2 is a plan sheet plus a teacher-operated tool run, Part 3 an evaluation sheet judged against a criterion-and-evidence bar, Part 4 a worksheet plus a short conversation. Both checkpoints. Every Bridging readiness judgement. The diagnostic. The Week 10 showcase, peer review and reflection. And all AI tool use, which is *"teacher-operated on the board; students never sign in and never enter personal data"* — the tool run happens off-platform by design.

### 4.4 How to represent it honestly

1. **Never synthesise a level.** A strand with no teacher judgement renders as *Not yet judged*, not as a computed value and not as a blank that reads as zero.
2. **Label every number by its evidence type.** `worksheetScore` sits under *Products*, visibly one of three.
3. **Give observations and conversations first-class capture.** A phone-friendly quick-entry for the teacher mid-lesson: student → strand → level → one line of note → source tag. Without this the triangulation requirement is unmeetable and teachers will keep a paper record instead, which defeats the platform. *Delivered by the confirmation panel (§3.3a): the question asked is stored as conversation evidence on the row it produced, so triangulation is a by-product of recording the level rather than a second task to remember.*
4. **Carry the pack's own prompts.** Each lesson's five formative fields (*Targets, Check, Success criteria, Evidence, Feedback / adjustment*) and the rubric look-fors should be on screen at the point of judgement, verbatim. That is what makes two teachers reach the same level, which is the pack's stated reliability criterion.
5. **Flag single-source judgements** rather than blocking them — a warning icon and a tooltip naming which sources are missing.
6. **Show the decision rule** next to every overall level.
7. **Keep the Grade 6 structural quirks** when the content schema is built: `Differentiation` in Grade 6 is UDL/access prose with six fields (Representation, Action & expression, Engagement, People of Determination, EAL, Stretch), **not** a rubric; the rubric has its own heading *Assessment rubric (observable look-fors)*; and the item table sits under *Answer key / model responses*. Modelling `Differentiation` as the rubric — correct for Grade 7 — would silently lose Grade 6's access block, which is exactly the thing the *Access arrangements used* field exists to record.

---

## 5. OPEN QUESTIONS FOR THE SCHOOL

Ordered by how much they block the build.

**1. Whose judgement, how often, and does the platform hold it all?**
ADEK prescribes the instruments and the record; it says nothing about who enters data or when. If teachers will not enter observation and conversation evidence at the point of teaching, the triangulation requirement cannot be met and StudyTwin will hold products only. *Recommendation:* decide before build whether the quick-entry capture is in scope. Without it, be explicit in the UI that the platform holds partial evidence and the ADEK record is completed on paper.

**2. Do we implement the Grade 7/8 diagnostic routing percentages for Grade 6?**
Grade 6's published Diagnostic Kit has none. *Recommendation:* do not. Record mastery/partial/not-yet directly, route per strand on those three values, and close residual gaps with the just-in-time Primer as the Grade 6 pack says. Keep routing thresholds as optional per-grade config for when Grade 7 comes.

**3. Is there an ADEK return, and in what format?**
Neither source names a submission channel, template, cadence or recipient for student attainment data. The stated audience is internal — *"curriculum coordinators, heads of department, teachers and assessment leads"* — and the only reporting instruction is teacher-to-student. **Do not build or advertise an "ADEK return."** *Recommendation:* if the school wants certainty, put it to ADEK in writing. Meanwhile build to the one format that is specified (§3.6) and keep the E/P/A/working-towards wording verbatim — matching ADEK's vocabulary exactly is the cheapest insurance at inspection.

**4. Does a weekly formative record roll up into the term judgement, and how?**
ADEK is silent. The only aggregation rule it publishes is the 3-of-4 strand rule on the single end-of-module assessment. Anything we do weekly is the school's convention. *Recommendation:* keep weekly formative flags as teaching intelligence only, visibly separate from the term record, and label them *school convention* in the UI. Do not roll them up automatically.

**5. Four errata to put to ADEK.** The school cannot resolve these unilaterally:
- `AIF·CU·G3·A` and `AIF·CU·G4·A` each denote two different descriptors in the published Bridging tables (G4 weeks 1 and 2; G5 weeks 1 and 2). What code disambiguates the data strand at KG1–G5, given the legend folds it under CU?
- Grade 5 Bridging week 3 cites `AIF·SD·G4·A` for a strand the framework does not define at Grade 4, in a cell that itself states there is no prior grade.
- Grade 4 and Grade 5 Bridging weeks 5–6 read *"Integration – three strands"* though four weeks rebuilt four strands, against the stated six-week rhythm and the "all four strands" wording used from Grade 6 up.
- The diagnostic says *"The diagnostic reports a score per strand"* and gives percentage bands (G7/G8), yet the only thing the Record column ever asks for is mastery/partial/not-yet. No pack defines how a probe yields a percentage or how it maps to the three values. We should not invent that mapping.
None of these affect the Grade 6 build if we key on `{grade, strand, tier}` composite rather than on the printed code — which we should do regardless, since three descriptor texts also repeat across grades.

**6. Retention.** The packs teach data minimisation and *"retention and deletion… backed by the Personal Data Protection Law (PDPL) and ADEK policy"* as **student content**, but state no retention rule for a school's own platform. `Submissions` and `AuditLog` retention is the school's to set. *Recommendation:* a stated policy before go-live — one academic year plus one for submissions, judgements retained for the school's standard student-record period, audit log two years.

**7. Term 1 is Emerging. Is the school's leadership prepared for a dashboard that is mostly Emerging?**
This is a communications decision, not a technical one. *"For this Term 1 tier, Emerging is the expected standard; Proficient and Advanced credit students who reason beyond it."* A cohort sitting at Emerging in Term 1 is the framework working correctly. If that will be read as underperformance by anyone who sees the dashboard, the label needs a permanent on-screen gloss and a line in the parent-facing communication — not a change to the scale.

---

### Bottom line

Building this does not, by itself, make us aligned — the current model would actively misreport. Building it **with the changes in §3** does, for everything ADEK actually specifies: the four-strand profile, the four-level criterion scale, the count-based overall rule, the prior-grade Bridging references, the observation record field for field, and a coverage audit that reconciles with the published Grade 6 figures (20 / 4 / 6 / 12). What it cannot do alone is produce a compliant judgement, because two of Grade 6's four strands are evidenced by observation and talk that no platform can capture unaided. The honest design makes the teacher the author of every level, puts our marks in front of them as one clearly-labelled source of three, and never prints a number where ADEK prints a judgement.