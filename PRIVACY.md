# Project Atlas 0.1.2 — Privacy and Data Notes

Atlas is a local-first prototype. Live records are stored in the browser's IndexedDB database on the device and browser profile where the app is used.

## What GitHub stores

The repository stores the application code, icons, and documentation. It contains no user-created Atlas records by default.

## What the browser stores

The browser can store notes, tasks, accomplishments, workstreams, tags, preferences, uploaded files/images, and OCR text. Clearing browser site data, using a different browser profile, or losing the device can remove this database. Use **Settings → Export Backup** regularly.

## No automatic synchronization

Atlas 0.1.2 does not automatically synchronize records between computers, phones, tablets, or browsers. Each browser has a separate database. A JSON backup can be imported on another device, but importing replaces that device's current Atlas data.

## OCR

The optional OCR feature loads Tesseract.js and English language data from the jsDelivr content-delivery network. Image recognition runs in the browser. Review extracted text against the original image; handwriting accuracy varies.

## Sensitive information

Atlas 0.1.2 is a prototype and does not provide centralized authentication, remote wipe, server-side audit logging, formal retention controls, or built-in encrypted cloud synchronization. Avoid storing credentials, regulated data, highly sensitive personal data, or other confidential information unless you have evaluated the risks and have an appropriate security plan.
