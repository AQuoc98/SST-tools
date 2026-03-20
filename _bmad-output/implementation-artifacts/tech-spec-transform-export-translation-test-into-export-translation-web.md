---
title: 'Transform export-translation-test into export-translation (Web)'
slug: 'transform-export-translation-test-into-export-translation-web'
created: '2026-03-20T14:04:19Z'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['HTML5', 'CSS3', 'JavaScript (ES6+)', 'SheetJS/xlsx (browser)', 'File System Access API', 'IndexedDB', 'LocalStorage']
files_to_modify: ['export-translation/index.html', 'export-translation/styles.css', 'export-translation/app.js', 'export-translation/package.json', 'export-translation/README.md']
code_patterns: ['Template-driven export routing (FD/ACE/AGPD)', 'Column-range parsing from worksheet json_tranlsation', 'Language folder mapping (italian->ita else first 2 lowercase chars)', 'UI state-driven form submission and validation', 'Separation of UI wiring and transformation logic']
test_patterns: ['No automated tests in current source project', 'Manual UI smoke tests via browser', 'Golden-file spot checks for generated translation.json and eula.json content']
---

# Tech-Spec: Transform export-translation-test into export-translation (Web)

**Created:** 2026-03-20T14:04:19Z

## Overview

### Problem Statement

A working translation-export tool exists in `export-translation-test` as an Electron desktop application, but the target repository `export-translation` is currently empty and needs a browser-based implementation using HTML, CSS, and JavaScript.

### Solution

Rebuild the existing user flow and FD export behavior as a pure web app in `export-translation`, replacing Electron IPC with browser-compatible file input, client-side parsing, and direct folder writes via the File System Access API.

### Scope

**In Scope:**
- Create a browser-based app in `export-translation` using HTML/CSS/JavaScript.
- Preserve current user flow: template selection, input file selection, export action.
- Implement FD export behavior parity with current implementation.
- Keep ACE and AGPD options visible as placeholders (not implemented).
- Provide browser destination-folder export using the File System Access API.
- Persist selected destination handle to avoid mandatory reselect after page reload in supported browsers.

**Out of Scope:**
- Electron main/preload/IPC architecture.
- Desktop packaging (`electron-builder`, DMG artifacts, app icons).
- ACE template implementation.
- AGPD template implementation.

## Context for Development

### Codebase Patterns

- Current source app uses a thin UI layer (`index.html`, `styles.css`, `renderer.js`) and central export logic in `main.js`; web migration should preserve this split by moving parser/export functions into dedicated browser-side modules.
- Template routing pattern is explicit (`FD`, `ACE`, `AGPD`) with only `FD` implemented; unsupported templates return deterministic "not implemented" messages.
- FD parser constraints are strict and must be preserved:
	- Worksheet name: `json_tranlsation`
	- Header row index: Excel row 2
	- Translation columns: B..J (indexes 1..9)
	- EULA columns: N..V (indexes 13..21)
	- Data row start: Excel row 3
	- Cell string format: `"key": "value"` parsed by regex
- Output naming pattern is stable:
	- per-language folder code = `ita` for Italian, otherwise first two lowercase letters
	- `translation.json` from translation columns, `eula.json` from EULA columns
- Existing code has no automated tests and relies on manual run/verify loops.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `export-translation-test/main.js` | Source of truth for FD parsing rules, language mapping, and template routing |
| `export-translation-test/renderer.js` | Source of truth for UI flow, validation sequence, and button-state behavior |
| `export-translation-test/index.html` | Form structure to preserve (template selector, input selection, export action) |
| `export-translation-test/styles.css` | Baseline visual structure and spacing patterns |
| `export-translation-test/package.json` | Dependency baseline (`xlsx`) and current run/build scripts |
| `export-translation/index.html` | New browser-only UI shell to create |
| `export-translation/styles.css` | New browser-only styling file to create |
| `export-translation/app.js` | New browser controller + export pipeline implementation |
| `export-translation/package.json` | New web tooling/scripts/dependencies definition |
| `export-translation/README.md` | Usage docs for browser workflow and export behavior |

### Technical Decisions

- Target runtime is browser-only HTML/CSS/JavaScript.
- Replace native dialogs with browser primitives:
	- `<input type="file" accept=".xlsx,.xls">` for source workbook
	- `window.showDirectoryPicker` for destination folder selection
- Keep feature parity focus on FD flow before any template expansion.
- Preserve error surface semantics where possible (missing sheet, unknown template, invalid input format).
- Use `xlsx` browser build to read workbook client-side.
- Write per-language JSON files directly under destination folders (`<lang>/translation.json`, `<lang>/eula.json`).
- Persist destination handle in IndexedDB and keep a display-label fallback in localStorage.
- Preserve formatting parity with source behavior for serialized key/value output.

## Implementation Plan

### Tasks

- [x] Task 1: Initialize browser project scaffold in target repository
	- File: `export-translation/package.json`
	- Action: Create a web-focused package definition with scripts for local serving/building and dependencies for browser parsing and destination-folder export.
	- Notes: Remove Electron/electron-builder usage from target architecture.

- [x] Task 2: Build browser-first UI shell equivalent to current workflow
	- File: `export-translation/index.html`
	- Action: Create page structure with template selector (FD/ACE/AGPD), workbook file input, export button, and status/message region.
	- Notes: Keep control names semantically close to current app for easier parity checks.

- [x] Task 3: Port and adapt UI styling for web usage
	- File: `export-translation/styles.css`
	- Action: Implement layout/styles that preserve readability and workflow clarity from source UI while supporting browser form controls.
	- Notes: Remove destination picker styling since browser output will be download-based.

- [x] Task 4: Implement browser export controller and template routing
	- File: `export-translation/app.js`
	- Action: Implement event wiring for file selection and submit flow, route template handling (`FD` implemented, `ACE`/`AGPD` placeholder errors), and disable/enable export button during processing.
	- Notes: Preserve existing user feedback semantics (success/failure messaging).

- [x] Task 5: Implement FD worksheet parsing logic with behavior parity
	- File: `export-translation/app.js`
	- Action: Parse workbook sheet `json_tranlsation` using `xlsx`; extract translation data from columns B..J and EULA data from N..V; parse cell strings using the same key-value regex behavior.
	- Notes: Preserve language folder mapping rules (`italian` -> `ita`, otherwise first two lowercase letters).

- [x] Task 6: Implement browser-compatible output packaging
	- File: `export-translation/app.js`
	- Action: Build per-language `translation.json` and `eula.json` file contents and write directly to the selected destination folder via the File System Access API.
	- Notes: Output layout mirrors previous filesystem structure: `<lang>/translation.json` and `<lang>/eula.json`.

- [x] Task 9: Persist destination handle to avoid reselect after reload
	- File: `export-translation/app.js`
	- Action: Save and restore directory handle using IndexedDB; keep destination label fallback in localStorage.
	- Notes: Permission checks still occur before write; browser may prompt based on prior grants.

- [x] Task 7: Document web workflow and migration constraints
	- File: `export-translation/README.md`
	- Action: Write setup/usage instructions for the browser app, document FD-only implementation status, and explain browser export behavior differences vs Electron.
	- Notes: Include known limitations and future template expansion notes.

- [x] Task 8: Validate implementation manually against source behavior
	- File: `export-translation/README.md`
	- Action: Add a manual verification checklist and execute smoke tests for valid FD input, missing-sheet errors, and placeholder-template behavior.
	- Notes: Capture expected outcomes to support reproducible QA.

### Acceptance Criteria

- [ ] AC 1: Given the web app is loaded and a valid Excel workbook is selected, when the user chooses template FD and starts export, then locale folders with `translation.json` and `eula.json` files are written to the selected destination folder.
- [ ] AC 2: Given the selected workbook does not include sheet `json_tranlsation`, when export is attempted with template FD, then the app displays a clear failure message indicating the sheet is missing and no output files are written.
- [ ] AC 3: Given template ACE or AGPD is selected, when export is triggered, then the app returns a deterministic "not yet implemented" message and does not generate output files.
- [ ] AC 4: Given a row cell follows the format `"key": "value"`, when FD parsing runs, then the key/value pair is included in the correct language dictionary and written to the corresponding JSON output.
- [ ] AC 5: Given a parsed language name is Italian, when output paths are created, then the folder name is `ita`; and given any other language, when output paths are created, then folder name uses the first two lowercase characters.
- [ ] AC 6: Given export is in progress, when processing starts and completes (success or error), then the export button is disabled during processing and restored afterward.
- [ ] AC 7: Given the generated JSON output is inspected, when comparing formatting across runs for the same input, then the JSON structure is deterministic with stable indentation and key/value serialization.
- [ ] AC 8: Given no file is selected, when user clicks export, then validation feedback is shown and export processing does not start.
- [ ] AC 9: Given a destination folder was previously selected in a supported browser, when the page reloads, then the destination handle is restored and export can proceed without mandatory manual reselect.

## Additional Context

### Dependencies

- `xlsx` (SheetJS): client-side workbook parsing in browser runtime.
- File System Access API: directory selection and file writes in browser runtime.
- IndexedDB: persistent storage for directory handles.
- Optional static dev server tooling (for local run convenience), selected during implementation (`vite`, `serve`, or equivalent lightweight static server).
- Source behavior dependency: parsing conventions and regex logic currently in `export-translation-test/main.js`.

### Testing Strategy

- Manual smoke suite (required):
	- Happy path with known-valid FD workbook and expected locale folder/file output in selected destination.
	- Missing file validation path.
	- Missing worksheet (`json_tranlsation`) error path.
	- Unsupported template behavior (ACE/AGPD).
	- Special-case language mapping for Italian.
	- Destination persistence across page reload (without mandatory reselect) in supported browsers.
- Output verification:
	- Inspect written destination folders and compare folder/file names with expected conventions.
	- Spot-check JSON keys/values for at least two languages and EULA content.
	- Confirm deterministic JSON indentation/serialization over repeated runs with same input.
- Regression checklist:
	- UI remains responsive after failed export attempt.
	- Export button state always recovers after completion.

### Notes

- User explicitly selected browser-only migration and to keep current behavior where ACE/AGPD remain unimplemented placeholders.
- High-risk migration point: Browser security model requires explicit folder permission grants and can re-prompt based on browser/session state.
- Data parsing risk: Cell text quoting/escaping can vary by workbook; preserve source regex behavior first, then harden in future iterations if needed.
- Future extension (out of scope): Introduce per-template parser modules (`FD`, `ACE`, `AGPD`) and optional automated fixtures for workbook regression tests.

## Review Notes

- Adversarial review completed
- Findings: 15 total, 10 fixed, 5 skipped
- Resolution approach: auto-fix
