# Publish Project Atlas on GitHub Pages

Atlas is a static PWA, so GitHub Pages can host it without a build command.

## Before publishing

Atlas stores records in your browser, not in the GitHub repository. Publishing the application code does **not** publish your local Atlas notes or tasks. However, anything you manually commit to a public repository can be seen by others.

Do not commit backups, exports, screenshots containing private information, API keys, passwords, or other sensitive data. Review `PRIVACY.md` first.

## 1. Create the repository

1. Sign in to your personal GitHub account.
2. Select **+ → New repository**.
3. Set the repository name to `project-atlas` (or another name you prefer).
4. Add a description such as `Local-first task, notes, workstream, and reporting PWA.`
5. Choose Public or Private according to your needs and GitHub Pages availability for your account.
6. Do not initialize it with another README, `.gitignore`, or license because Atlas already contains those files.
7. Select **Create repository**.

## 2. Upload Atlas using the GitHub website

1. Extract the Atlas ZIP.
2. Open your new repository.
3. Select **Add file → Upload files**.
4. Drag the **contents inside** the extracted folder into GitHub.
5. Confirm that `index.html`, `manifest.webmanifest`, `service-worker.js`, `README.md`, and the `css`, `js`, and `assets` folders are at the repository root.
6. Commit the files.

The most common mistake is creating an extra folder level. `index.html` must be at the repository root.

## 3. Turn on GitHub Pages

1. Open **Settings** in the repository.
2. Select **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and `/(root)`.
5. Save and wait for deployment.
6. Open the exact Pages URL GitHub displays.

A typical project URL looks like:

```text
https://YOUR-USERNAME.github.io/project-atlas/
```

## 4. Test the published app

1. Open the Pages URL.
2. Confirm the dashboard loads.
3. Select **Load Sample Data**.
4. Create a note and a task.
5. Mark a task complete.
6. Generate a report.
7. Export a JSON backup from Settings.
8. Refresh the page and confirm the records remain.
9. Open the URL in a private window and confirm it starts with a separate blank local database.

## Install Atlas as an app

### Chrome or Edge on a computer
Use the install icon in the address bar or the browser menu's install-app option.

### Android
Open Atlas in Chrome and choose **Install app** or **Add to Home screen**.

### iPhone or iPad
Open Atlas in Safari, select **Share**, then **Add to Home Screen**.

## Optional: upload with Git

```bash
cd path/to/project-atlas
git init
git add .
git commit -m "Add Project Atlas"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/project-atlas.git
git push -u origin main
```

## Updating the app later

1. Export an Atlas backup.
2. Replace changed code files in the repository.
3. Commit and push to `main`.
4. Wait for Pages to redeploy.
5. Reload Atlas. Installed PWAs may need to be closed and reopened after a service-worker update.

## Troubleshooting

### The site shows 404
- Confirm Pages is set to `main` and `/(root)`.
- Confirm `index.html` is at the repository root.
- Wait a few minutes and check the repository's Actions tab for deployment errors.

### Changes do not appear
- Reload the page.
- Close and reopen an installed copy.
- Confirm the latest commit reached the Pages source branch.
- For a future release, update `CACHE_NAME` in `service-worker.js`.

### OCR does not start
- Confirm the device is online the first time OCR is used.
- Confirm the browser/network allows the jsDelivr CDN.
- Try a clear image containing printed English text.

### Records are missing on another device
That is expected in Atlas 0.1.4. Export a JSON backup on the original device and import it on the other device. Import replaces any existing Atlas records in the destination browser.

## References

- GitHub Pages documentation: https://docs.github.com/pages
