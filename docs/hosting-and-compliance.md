# Hosting, cost and compliance options

Context: AISA cannot pay for the ADEK/Instructwin student licence. This platform must
therefore be free to run indefinitely, hold student work safely, and sit comfortably
inside ADEK's digital/data expectations for private schools in Abu Dhabi.

## The compliance question that actually matters

For a student-facing system the binding constraint is not hosting cost, it is
**who becomes a processor of student personal data**.

Student names, email addresses, worksheet answers, scores and attainment records are
personal data of minors. Under UAE Federal Decree-Law No. 45 of 2021 (PDPL) and ADEK's
safeguarding/data expectations, introducing a *new* processor generally means the school
needs a lawful basis, a data-processing agreement, a view on where the data physically
sits, and — in practice — school leadership sign-off.

That gives a clear ranking:

| Option | Cost | New data processor? | Data location | Compliance effort |
|---|---|---|---|---|
| **Google Apps Script + Sheets, inside AISA's own Workspace** | Free forever | **None** | Same place AISA student data already lives | Lowest |
| Next.js on Vercel + hosted Postgres (Neon/Supabase) | Free tier | Yes — two (host + DB) | Default US/EU, not UAE | Highest |
| School-run server on-prem | Hardware/staff time | None | On campus | Medium — needs IT to own it |

## Recommendation: build it inside AISA's Google Workspace

The school already runs Google Workspace for Education and already trusts it with student
identity and student work. Building the hub as an **Apps Script web app with Google Sheets
as the datastore** means every piece of student data stays inside the tenant AISA has
already cleared. Nothing new to approve, no new contract, no data leaving the school's
existing perimeter, and no bill — ever, not a trial that lapses.

It also solves the sign-on requirement for free and exactly as asked. An Apps Script web
app deployed with:

- **Execute as:** user accessing the web app
- **Who has access:** anyone within AISA (the Workspace domain)

is domain-locked by Google itself. Only `@aisa.sch.ae` accounts can open it, students are
already signed in in the browser, and the app receives a verified identity from Google —
there are no passwords for us to store and no way for a personal Gmail account to get in.
Doing the same thing on Vercel means registering an OAuth client, storing secrets, and
writing the domain check ourselves. Same outcome, more moving parts, more to get wrong.

A side benefit: teachers and admins can open the underlying Sheet and see the raw marks.
For a system replacing a vendor product that is being taken away, that transparency is
worth a lot in getting staff to trust it.

## Honest trade-offs

Apps Script is not free of downsides, and these are the real ones:

- **URLs are ugly.** The app lives at `script.google.com/macros/s/.../exec`. It can be put
  behind a friendly link or a Classroom/intranet tile, but there is no custom domain.
- **Cold starts.** First load of a session is typically 1–3 seconds. Subsequent navigation
  inside the app is fast if it is built as a single-page app, which is how I would build it.
- **Sheets is not a real database.** It is fine for one grade. Concurrent writes need
  careful handling (record-per-student rows, `LockService` on write). School-wide across
  every grade would eventually strain it.
- **Quotas exist** (script runtime per execution, daily limits). Ordinary classroom use for
  a grade cohort sits well inside them.

## Why this is not a trap

The curriculum itself — lessons, labs, worksheets, questions, mark schemes, standards
mappings — will be authored as **plain JSON data, not as Apps Script code**. Student
responses will be stored in a normalised shape rather than scattered across a spreadsheet
layout. That means if AISA later outgrows Sheets, or gets budget, or wants a custom domain,
moving to a conventional web stack is a front-end rebuild against the same content and the
same exported data — not starting over.

Start free and compliant. Keep the exit open.

## What still needs a human decision at AISA

I can build the platform, but two things are the school's call, not mine:

1. **Tell leadership/DPO it exists.** Even with zero new processors, a system holding
   student attainment records should be known to and owned by the school, not run
   informally by one teacher. This protects you.
2. **Confirm with ADEK whether attainment in the AI Standards must ultimately be reported
   through their platform.** Building our own hub for teaching, worksheets and internal
   tracking is clearly fine. If ADEK also requires the official return to be filed in
   Instructwin, that is a separate reporting obligation this system should feed rather
   than replace. Worth a short email to your ADEK contact.

I do not have ADEK's current policy text in front of me, so treat the framing above as the
standard data-protection reasoning rather than a quotation of their rules — but the
recommendation holds under any reading, because it is the option that introduces the
fewest obligations.
