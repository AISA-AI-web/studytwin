# Deploying StudyTwin

One-time setup, done by an AISA Google Workspace account that will be the platform
administrator. Budget about 20 minutes.

> **Use a staff account, not a personal one.** Whoever deploys owns the datastore and
> is automatically the first admin. If that person leaves the school, ownership has to
> be transferred, so prefer a departmental account over an individual's if you have one.

## Two ways to deploy

**Option A — paste it in the browser.** No terminal, no Node, no clone. Five copy-pastes.
This is the right choice if you are deploying this once and are not a developer.

**Option B — push from a clone with `clasp`.** Better if you will be updating the content
repeatedly, because an update becomes one command instead of five pastes. Needs Node and a
terminal.

Both produce exactly the same thing. Start with A unless you know you want B.

---

# Option A — deploy from the browser

## A1. Get the five files

They are in `dist/` in the repository. On GitHub, open each one and use the **copy raw
contents** button (the icon at the top right of the file view):

| File | What it is |
|---|---|
| `dist/Code.gs` | All the server code in one file |
| `dist/Index.html` | The page shell |
| `dist/Styles.html` | The stylesheet |
| `dist/App.html` | The app itself |
| `dist/appsscript.json` | The manifest — permissions and web app settings |

## A2. Create the Apps Script project

Go to <https://script.google.com> and click **New project**. Sign in with the AISA account
that will own this.

> **Use a departmental account if you have one.** Whoever creates this owns the datastore
> permanently and becomes the first admin. If that is an individual's account and they
> leave the school, ownership has to be transferred or the platform dies with the account.

## A3. Paste the code in

1. The editor opens with a file called `Code.gs` containing a stub `myFunction`.
   **Select all of it and replace it** with the contents of `dist/Code.gs`. Save (Ctrl/Cmd+S).
2. Click **+** next to *Files* → **HTML**. Name it exactly `Index` (the editor adds `.html`).
   Replace its contents with `dist/Index.html`. Save.
3. Repeat for `Styles` and `App`.
4. Click **⚙ Project Settings** in the left sidebar and tick
   **Show "appsscript.json" manifest file in editor**.
5. Back in the editor, open `appsscript.json` and replace it with `dist/appsscript.json`. Save.

You should end up with exactly five files: `Code.gs`, `Index.html`, `Styles.html`,
`App.html`, `appsscript.json`.

> **The names matter.** The app loads its own pages by name, so `Index`, `Styles` and `App`
> must be spelled exactly that way, with that capitalisation.

Now skip to **step 4** below.

---

# Option B — deploy with clasp

## B0. Before you start

**Node.js 18 or newer.** `node --version` should print `v18`, `v20` or `v22`.

**The repository, cloned locally.** It is private, so you will be asked to authenticate:

```bash
git clone https://github.com/AISA-AI-web/studytwin.git
cd studytwin
```

**The Apps Script API switched on for your Google account.** This is the most common reason
`clasp` fails, and the error message does not point at it:

1. Open <https://script.google.com/home/usersettings>
2. Turn **Google Apps Script API** to **ON**

> **A Workspace admin can block this domain-wide.** If the toggle will not stay on, or
> `clasp login` is refused, AISA's Google Workspace administrator has restricted Apps
> Script. They can allow it under **Apps → Additional Google services → Apps Script**.

## B1. Install and authenticate

```bash
npm install
npx clasp login
```

## B2. Create the project and push

```bash
npx clasp create --type webapp --title "StudyTwin" --rootDir src
npm run push
```

`npm run push` syntax-checks everything, validates the curriculum, runs the tests, compiles
the content and uploads. If any check fails it stops rather than pushing something broken.

If you created the project in the browser rather than with `clasp create`, make a
`.clasp.json` in the project root instead, using the Script ID from **⚙ Project Settings**:

```json
{ "scriptId": "YOUR_SCRIPT_ID", "rootDir": "src" }
```

Then `npx clasp push -f` once, to replace the default manifest the browser created.

---

## 4. Create the datastore

In the Apps Script editor (Option B: `npx clasp open`), choose the `setup` function from the dropdown and press
**Run**. Google will ask you to authorise the script the first time.

> **You will see a scary-looking warning**, along the lines of *"Google hasn't verified
> this app"*. That is expected and is not a problem: it appears for any Apps Script that
> has not gone through Google's public app-verification process, which an internal school
> tool neither needs nor qualifies for. You are the author of the script and it is running
> in your own Workspace. Click **Advanced**, then **Go to StudyTwin (unsafe)**, then
> **Allow**.
>
> Read the permission list before approving. It should ask only for spreadsheets, your
> email address, and external requests. If it asks for anything else, stop and check you
> are running the right script.

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

**Option A (browser):** ask for a fresh `dist/Code.gs`, then paste it over the existing
`Code.gs` in the editor and save. The other four files only change if the interface
changes. Then make a new version, below.

**Option B (clasp):** edit the JSON under `curriculum/`, then:

```bash
npm run push
```

Then in the editor, **Deploy → Manage deployments → edit (pencil) → Version: New version
→ Deploy**. Students pick up the change on their next page load.

> Creating a *new deployment* instead of a new *version* generates a different URL, which
> means students following the old link see the old content. Always edit the existing
> deployment.

## How to tell it worked

Four checks, in order. Each one confirms a different layer.

1. **Open the web app URL yourself.** You should land in the app as an admin, with the
   Admin tab visible. If you see "Sign-in required", see the multi-login note below.
2. **Check the datastore exists.** Admin → Data → *Open the datastore spreadsheet*. It
   should have seven tabs: Staff, Roster, Progress, Submissions, Judgements, Readiness,
   AuditLog.
3. **Have a colleague open the link.** They should get in without you granting anything,
   and see only the student view — no Class Tracking, no Admin. That confirms the domain
   restriction and the role defaults are working.
4. **Try it from a personal Gmail account**, signed out of your AISA account. Google
   should refuse before the app loads at all. That is the domain lock doing its job.

If all four behave, the security model is intact.

## Troubleshooting

**"Sign-in required" for a legitimate AISA user**
Their browser is signed into a personal Google account as well. Ask them to open the link
in an incognito window, or switch accounts. This is a Google multi-login quirk, not a bug
in the platform.

**`clasp create` fails with "User has not enabled the Apps Script API"**
The toggle in step 0. Turn it on at <https://script.google.com/home/usersettings>, wait
a minute, and try again.

**`clasp push` says "Invalid manifest" or a file is missing**
Run `npm run build` first. The curriculum is compiled into `src/generated/` at build
time and that folder is gitignored, so a fresh clone has no content until you build.
`npm run push` does this for you.

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
