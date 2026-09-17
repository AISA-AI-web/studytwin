# Source curriculum documents

> **Restricted material.** Every ADEK pack in this folder carries the notice
> *"For teacher use in ADEK schools. Not for distribution to students."* They contain final
> assessments, answer keys, mark schemes and annotated exemplars.
>
> **This repository must stay private.** Do not make it public, do not fork it to a public
> account, and do not attach these files to anything student-facing. The platform itself does
> not need them at runtime — it runs on the extracted framework catalogue in
> `curriculum/framework/`, which contains only the published strand descriptors and codes.

Drop the original ADEK / Instructwin curriculum exports here, unmodified.

These are the **source of truth**. The machine-readable lesson content used by the app is
derived from them and lives in `curriculum/grade6/` etc. Keeping the originals in the repo
means the derived content can always be checked against, or regenerated from, what ADEK
actually published.

Currently held:

- `ADEK_Scope_and_Sequence_Term1.html` — the framework, KG to Grade 12
- `Grade 6 Curriculum and Sample Core Lesson (1).pdf`
- `Grade 7 Curriculum and Sample Lesson.pdf`
- `Grade 8 Curriculum and Sample Lesson.pdf`

## How to add a file

Easiest route, no terminal needed:

1. Open the repo on GitHub and switch to the branch `claude/laughing-brahmagupta-4ewj88`
2. **Add file → Upload files**
3. Drag the PDF in, set the path to `curriculum/source/`
4. **Commit directly to** `claude/laughing-brahmagupta-4ewj88`
