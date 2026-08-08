# Changelog

## 0.1.4 — 2026-08-07

- Fixed desktop Chrome clipping the final **S** in **PROJECT ATLAS** at standard zoom.
- Slightly widened the desktop sidebar and allowed the brand text container to render without clipping.
- Reduced brand letter spacing very slightly for more consistent rendering across browsers and display scaling.
- Bumped the PWA cache version so browsers fetch the corrected stylesheet.

## 0.1.3 — 2026-08-07

- Changed the Atlas brand subtitle to **Work Intelligence & Organization**.
- Removed the remaining visible administrative-work terminology from the personal build.
- Replaced the default Administration workstream with a generic General workstream.
- Replaced the Administrative Resources sample with a generic Reference Library sample.
- Updated the app metadata and PWA cache version so GitHub Pages and installed copies fetch the new branding.
- Adjusted the sidebar subtitle styling so the full tagline can wrap on narrow/mobile layouts instead of being cut off.

## 0.1.2

- Generalized Atlas for personal/commercial development.
- Removed organization-specific names, terminology, sample data, deployment instructions, and privacy language.
- Replaced sample workstreams, goals, tasks, notes, and accomplishments with generic examples.
- Updated the PWA service-worker cache version.
- Removed the organization-specific demo screenshot.

## 0.1.1 — 2026-08-07

- Removed the personal profile chip and initials from the top bar.
- Changed the dashboard greeting to a reusable name-free greeting.
- Removed the display-name setting and legacy display-name usage from reports.
- Added a migration that ignores older saved display names.
- Bumped the PWA cache version and cache-busted core assets so GitHub Pages picks up the update cleanly.

## 0.1.0 — 2026-08-07

Initial Project Atlas prototype.

### Added

- Local-first IndexedDB storage
- Notes, decisions, references, uploads, and linked tasks
- Open, waiting-on, completed, and recurring task workflows
- Accomplishment records and goal links
- Weekly review, reports, diagnostics, and multiple export formats
- JSON backup and restore
- Optional browser-based image OCR
- Responsive PWA shell, install support, offline app shell, and dark mode
- Sample data and prototype privacy guidance
