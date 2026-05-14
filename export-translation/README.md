# Export Translation (Web)

A browser-based HTML, CSS, and JavaScript app that reads a structured Excel workbook and exports locale JSON files directly to a selected destination folder.

## Scope

- Implemented: FD, ACE, and HS template export flows
- Not implemented: AGPD template (placeholder behavior)

## Tech Stack

- HTML5
- CSS3
- JavaScript (ES modules)
- xlsx (SheetJS)
- Vite for local development/build

## Run Locally

1. Install dependencies:

   npm install

2. Start dev server:

   npm run dev

3. Open the app URL shown by Vite.

## Build

npm run build

## Usage

1. Select template:
   - FD (working)
   - ACE (working)
   - HS (working)
   - AGPD (not implemented)
2. Choose an input workbook (.xlsx, .xls, or .csv).
3. Select a destination folder.
4. Click export.
5. JSON files are written directly to that folder.
6. Output contains per-language folders:
   - <lang>/translation.json
   - <lang>/eula.json

Destination behavior:

- The selected destination folder handle is saved in IndexedDB and reused after reload in supported browsers.
- The folder label is also saved in localStorage for fallback display.
- Browser permission prompts may still appear on export if access needs to be re-granted.

## Parsing Rules (FD)

- Worksheet name: json_tranlsation
- Important: the worksheet name intentionally uses the original typo and must match exactly. For CSV inputs (which have no sheet names), the first sheet is used as a fallback.
- Header row: Excel row 2
- Translation columns: B..J
- EULA columns: N..V
- Data rows start at Excel row 3
- Cell format: "key": "value"
- Language folder mapping:
  - italian -> ita
  - all other languages -> first two lowercase characters

## Parsing Rules (ACE)

- Worksheet name: json_tranlsation (falls back to first sheet for CSV)
- Header row: Excel row 2
- Translation columns: B..K
- EULA columns: O..X
- Data rows start at Excel row 3
- Cell format: "key": "value"
- Language folder mapping uses an explicit map (english -> en, italian -> it, french -> fr, swedish -> sv, finnish -> fi, norwegian -> no, polish -> pl, german -> de, danish -> da, spanish -> es); unknown languages fall back to the first two lowercase characters.

## Parsing Rules (HS)

- Worksheet name: json_tranlsation (falls back to first sheet for CSV)
- Header row: Excel row 2
- Translation column: B only
- EULA column: N only
- Data rows start at Excel row 3
- Cell format: "key": "value"
- Output is written to a single `en/` folder (translation.json and eula.json).

## Browser Adaptation Note

This version writes directly to a selected folder using the File System Access API. Use a browser that supports directory picker and write permissions (Chromium-based browsers).

For stability in browser memory limits, the current UI enforces a 20MB workbook size cap.

## Manual Verification Checklist

- [ ] Happy path: FD export downloads zip with expected folder and file layout.
- [ ] Missing file validation blocks export and shows error message.
- [ ] Missing worksheet json_tranlsation returns clear error.
- [ ] ACE template shows not implemented message and creates no output.
- [ ] AGPD template shows not implemented message and creates no output.
- [ ] Italian language maps to ita folder.
- [ ] Export button disables during processing and restores afterward.
- [ ] Repeated runs on same input produce deterministic JSON formatting.
- [ ] Saved destination is restored after page reload and export can proceed without manual reselect in supported browsers.
