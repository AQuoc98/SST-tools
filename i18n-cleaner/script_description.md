### Description
- A script to filter unused translation keys in the project

### Input
- Project path need to scan: `/Users/ken/Documents/Project/blueprint`
- translation.json path: `/Users/ken/Documents/Project/blueprint/apps/fd/src/common/json/locales/en/translation.json`

### Output
- A `unused-translation.json` that contains unused keys

### Filter Rules
- Only scan these folders (relative to project root):
  - `apps/fd`
  - `libs/shared/src`
- Ignore all other folders
- Ignore any file named `translation.json` (avoid self-matching)
- Valid file extensions to scan: `.js`, `.jsx`, `.ts`, `.tsx`

### Search Strategy
Keys have the format `a_b_c_...` (underscore-separated parts), e.g. `topNav_settings_fieldItem_expanded`.

**Do not care which method or pattern is used** — just search for the key text directly in the raw file content as a plain string.

A key is considered **used** if **any** of the following match:
1. **Exact match** — the full key string appears verbatim anywhere in the file content
   - e.g. file contains `topNav_settings_fieldItem_expanded` → used
2. **Dynamic prefix match** — for dynamic/template expressions. Extract every static text prefix that appears before a `${...}` interpolation in the codebase, and mark any key that **starts with that prefix** as potentially used
   - e.g. `` `calcResult_fastenerProperties_coating_fieldLabel_${x}` `` → prefix is `calcResult_fastenerProperties_coating_fieldLabel_` → all keys starting with that prefix are considered used

A key is considered **unused** only when neither rule matches across all scanned files.

### Notes
- No need to parse AST or understand call signatures — raw text search is sufficient and more reliable
- The dynamic prefix rule safely handles all runtime-constructed keys
- Example usages in the project (all covered by the strategy above):
  - `t('topNav_file_openFromDevice_cancelMess_invalidFileFormat')`
  - `i18nKey="input_supportProperties_seatPlateSteelGrade_helptext"`
  - `` `calcResult_fastenerProperties_coating_fieldLabel_${commonTranslationKeySuffix}` ``
