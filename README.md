# Project Atlas 0.1.3

Project Atlas is a local-first progressive web app (PWA) for organizing work. It connects tasks, notes, decisions, workstreams, accomplishments, and reports in one private workspace.

Atlas 0.1.3 is a static PWA that can be published with GitHub Pages. It does not require Node.js, a server, a paid database, or a build process.

## What is included

- Dashboard with due-today, due-this-week, waiting-on, completed, and accomplishment metrics
- Quick Capture for tasks, waiting-on items, decisions, notes, and image OCR
- Notes with workstreams, tags, source links, uploads, and linked tasks
- Task tracking with priorities, due dates, follow-up dates, waiting-on fields, and recurrence
- Accomplishment records with impact, measurable results, evidence, and goal links
- Weekly review to convert meaningful completed work into accomplishments
- Reports for week, month, quarter, calendar year, September–August fiscal year, all time, or a custom period
- Workflow diagnostics for undated work, stale waiting-on items, unlogged completed work, and older unlinked notes
- Search across notes, tasks, accomplishments, and uploads
- Note export to copied text, TXT, Markdown, Word-compatible DOC, or Print/Save as PDF
- Report export to CSV, Markdown, Word-compatible DOC, or Print/Save as PDF
- Full JSON backup and restore
- Optional image OCR through Tesseract.js
- Installable PWA experience, offline app shell, responsive mobile layout, and dark mode
- Generic sample data for exploring the workflow before entering real information

## How Atlas stores data

Atlas stores live user records in **IndexedDB inside the browser profile** where the app is used. The GitHub repository contains only application code and documentation unless someone deliberately adds data files to the repository.

Important consequences:

- The same GitHub Pages URL on another device starts with a separate, blank Atlas database.
- Browser data does not automatically sync across devices.
- Clearing site data, deleting the browser profile, or losing the device can remove Atlas records.
- Use **Settings → Export Backup** regularly and keep the JSON file somewhere safe.
- Importing a backup replaces the Atlas data currently stored in that browser.

Read [PRIVACY.md](PRIVACY.md) before storing important or sensitive information.

## Start here

The easiest deployment path is GitHub Pages. Follow [GITHUB_SETUP.md](GITHUB_SETUP.md).

For a quick local test, serve the folder with any static web server. Do not double-click `index.html`; browser module and service-worker security rules require HTTP or HTTPS.

```bash
cd project-atlas
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a modern browser.

## First-use checklist

1. Open Atlas.
2. Select **Load sample data** on the welcome card.
3. Explore Notes, Tasks, Decisions, Accomplishments, Reports, and Settings.
4. Mark a sample task complete and let Atlas add it to the accomplishment log.
5. Generate a report and test an export.
6. Go to **Settings → Clear All Data** before entering your own records.
7. Add your display name and goals under Settings.
8. Export a backup after the first real test session.

## OCR notes

Atlas loads Tesseract.js only when **Run OCR** is selected. OCR accepts image files up to 12 MB and saves the compressed image with the resulting note. Printed text, screenshots, and clear signage will generally work better than handwriting. Review every OCR result against the original image.

Atlas 0.1.3 does not OCR PDF files. It also does not send extracted text into an AI system.

## Updating Atlas

Replace changed files in the repository and commit them to the GitHub Pages source branch. The service worker uses a versioned cache in `service-worker.js`. Change `CACHE_NAME` with future releases so installed copies fetch the updated app shell.

Back up your data before updating. Publishing new code should not normally erase IndexedDB, but this prototype has not undergone formal production change-management testing.

## Prototype boundaries

Atlas 0.1.3 does not include:

- Central user accounts or permissions
- Automatic device synchronization
- Email, chat, drive, or calendar integrations
- Server-side audit logs, retention rules, or remote wipe
- Automatic AI summarization or task extraction
- Guaranteed handwriting recognition
- Formal enterprise security certification or compliance review

## Browser support

Use a current version of Chrome, Edge, Safari, or Firefox. Install prompts and offline behavior vary by browser. On iPhone and iPad, open Atlas in Safari and use **Share → Add to Home Screen**.

## License

MIT License. See [LICENSE](LICENSE).
