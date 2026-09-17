# Deploying StudyTwin

One-time setup, done by an AISA Google Workspace account that will be the platform
administrator. Budget about 20 minutes.

> **Use a staff account, not a personal one.** Whoever deploys owns the datastore and
> is automatically the first admin. If that person leaves the school, ownership has to
> be transferred, so prefer a departmental account over an individual's if you have one.

## 1. Install the tooling

```bash
npm install
npx clasp login
```

`clasp` is Google's command-line tool for Apps Script. The login opens a browser and
should be completed with the same AISA account that will own the platform.

## 2. Create the Apps Script project

```bash
npx clasp create --type webapp --title "StudyTwin" --rootDir src
```

This writes a `.clasp.json` containing the new project's ID. That file is gitignored
because it is specific to your deployment — the repo ships `.clasp.json.example` for
reference.

## 3. Push the code

```bash
npm run push
```

This runs the syntax check, validates the curriculum JSON, runs the marking tests,
compiles the lessons into `src/generated/CurriculumData.gs`, and uploads everything.
If any check fails the push stops — that is deliberate, so a broken worksheet cannot
reach students.

## 4. Create the datastore

```bash
npx clasp open
```

In the Apps Script editor, choose the `setup` function from the dropdown and press
**Run**. Google will ask you to authorise the script the first time; approve it.

The log prints the URL of the spreadsheet that now holds all student data. Open it once
to confirm it exists, then **leave its sharing settings alone**. It must stay private to
you. Students never need access to it, and must never be given any.

## 5. Deploy the web app

In the editor: **Deploy → New deployment → Web app**.

| Setting | Value | Why |
|---|---|---|
| Execute as | **Me (your@aisa.sch.ae)** | Lets the app write marks without students having access to the spreadsheet |
| Who has access | **American International School in Abu Dhabi** | Google refuses anyone outside the domain before our code runs |

> **This pair of settings is the entire security model.** If "Execute as" is switched to
> *User accessing*, every student needs write access to the marks workbook and could edit
> their own scores directly in Sheets. Do not change it.

Press **Deploy** and copy the **Web app URL** (it ends in `/exec`). That link is what you
give to students and staff.

## 6. Set up people

Open the web app URL. You will land in the app as an admin.

1. Go to **Admin → Import roster** and paste your students, one per line:
   ```
   amina.hassan@aisa.sch.ae, Amina Hassan, 6A
   omar.khalid@aisa.sch.ae, Omar Khalid, 6A
   ```
   Re-importing the same students updates them rather than creating duplicates, so you
   can paste a corrected list safely.

2. Go to **Admin → Staff access** and add each Grade 6 teacher as a **Teacher**. Teachers
   can see every student's progress but cannot change the roster.

3. Share the web app URL with students — a Google Classroom link or an intranet tile
   works well. They are already signed in, so it just opens.

## Updating lessons later

Edit the JSON under `curriculum/`, then:

```bash
npm run push
```

Then in the editor, **Deploy → Manage deployments → edit (pencil) → Version: New version
→ Deploy**. Students pick up the change on their next page load.

> Creating a *new deployment* instead of a new *version* generates a different URL, which
> means students following the old link see the old content. Always edit the existing
> deployment.

## Troubleshooting

**"Sign-in required" for a legitimate AISA user**
Their browser is signed into a personal Google account as well. Ask them to open the link
in an incognito window, or switch accounts. This is a Google multi-login quirk, not a bug
in the platform.

**Students report "the system is busy"**
Thirty simultaneous submissions queue behind the document lock. Waiting a moment and
resubmitting works. If it becomes routine, stagger submission or move the datastore off
Sheets — see the migration note in `hosting-and-compliance.md`.

**A mark looks wrong**
Open the datastore spreadsheet, `Submissions` sheet. Every attempt is recorded with the
exact answers given and the per-question marks awarded, so any score can be audited.
Nothing is overwritten — retries add rows.

## What to check once a term

- **Attempts and marks look sane** in the `Submissions` sheet.
- **The `AuditLog` sheet** for anything unexpected (it records role changes, exports and
  staff viewing student records).
- **Staff list** still matches who actually teaches the course.
