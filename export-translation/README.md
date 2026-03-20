# SST Export Translation

An Electron desktop application that exports translation data from Excel files to JSON format for multi-language support.

## Overview

This application reads a specially formatted Excel file containing translations in multiple languages and exports them into individual JSON files organized by language code.

## Features

- 🎯 User-friendly GUI for file selection
- 🎨 Multiple template support (FD, ACE, AGPD)
- 📊 Excel file parsing (`.xlsx`, `.xls`)
- 🌍 Multi-language support
- 📝 Automatic JSON formatting with Prettier
- ✨ Separate translation and EULA file generation
- 💾 Organized output by language folders
- 🔄 Persistent destination path (localStorage)
- 🧹 Clear saved settings option

## Installation

```bash
# Install dependencies
yarn
```

## Usage

### Running the Application

```bash
# Development mode
yarn start
```

### Building the Application

```bash
# Build for production
yarn build
```

The built application will be available in the `dist/` directory.

## Application Architecture

The application follows Electron's security best practices with a clear separation between main and renderer processes:

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron App Architecture                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  index.html  │────────▶│ renderer.js  │                 │
│  │              │         │              │                 │
│  │ • UI Layout  │         │ • UI Logic   │                 │
│  │ • Form       │         │ • Event      │                 │
│  │ • Buttons    │         │   Handlers   │                 │
│  └──────────────┘         └──────┬───────┘                 │
│                                   │                          │
│                                   │ electronAPI              │
│                                   │                          │
│                          ┌────────▼────────┐                │
│                          │   preload.js    │                │
│                          │                 │                │
│                          │ • Context       │                │
│                          │   Bridge        │                │
│                          │ • IPC Exposure  │                │
│                          └────────┬────────┘                │
│                                   │                          │
│                                   │ IPC                      │
│                                   │                          │
│                          ┌────────▼────────┐                │
│                          │    main.js      │                │
│                          │                 │                │
│                          │ • Window Mgmt   │                │
│                          │ • File Dialogs  │                │
│                          │ • Export Logic  │                │
│                          │ • XLSX Parsing  │                │
│                          └─────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Code Explanation

### 1. `main.js` - Main Process (Backend)

The main process is the backend of your Electron app. It has full access to Node.js APIs and system resources. It's responsible for creating windows, handling system dialogs, file operations, and business logic.

#### Key Responsibilities
- **Window Management**: Creates and manages application windows
- **IPC Handlers**: Listens for requests from renderer process
- **File System Operations**: Reads Excel files, writes JSON files
- **Native Dialogs**: Shows file/folder selection dialogs
- **Business Logic**: Excel parsing and JSON generation

#### Required Imports

```javascript
const { app, BrowserWindow, ipcMain, dialog } = require("electron/main");
const path = require("path");
const XLSX = require("xlsx");      // Excel file parsing
const fs = require("fs");          // File system operations
const prettier = require("prettier"); // JSON formatting
```

#### Window Management

```javascript
const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),  // Load preload script
      contextIsolation: true,   // Security: isolate renderer from Node.js
      nodeIntegration: false,   // Security: disable Node.js in renderer
    },
  });
  win.loadFile("index.html");  // Load the UI
};
```

**Why these settings?**
- `preload`: Specifies the bridge script that exposes safe APIs to renderer
- `contextIsolation: true`: Prevents renderer from accessing Node.js directly (security)
- `nodeIntegration: false`: Disables `require()` in renderer (security)

#### IPC Handlers

The main process listens for requests from the renderer via IPC (Inter-Process Communication).

**1. File Selection Dialog**

```javascript
ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],  // Allow selecting one file
    filters: [
      { name: "Excel Files", extensions: ["xlsx", "xls"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});
```

- Shows native file picker dialog
- Filters to show only Excel files (`.xlsx`, `.xls`)
- Returns selected file path or `null` if canceled

**2. Destination Folder Selection**

```javascript
ipcMain.handle("select-destination", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],  // Allow folder selection and creation
  });
  return result.canceled ? null : result.filePaths[0];
});
```

- Shows native folder picker dialog
- Allows creating new folders
- Returns selected folder path or `null` if canceled

**3. Export Translation Logic** (Core Business Logic)

```javascript
ipcMain.handle(
  "export-translation",
  async (event, inputFile, outputDir, template = "FD") => {
    try {
      // Route to appropriate template handler
      switch (template) {
        case "FD":
          return await exportFDTemplate(inputFile, outputDir);
        case "ACE":
          return {
            success: false,
            message: "ACE template not yet implemented",
          };
        case "AGPD":
          return {
            success: false,
            message: "AGPD template not yet implemented",
          };
        default:
          return {
            success: false,
            message: `Unknown template: ${template}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
);

// FD Template Export Logic
async function exportFDTemplate(inputFile, outputDir) {
  try {
    const sheetName = "json_tranlsation";

    // Step 1: Read Excel file
    const workbook = XLSX.readFile(inputFile, {
      cellText: false,      // Don't convert to text
      cellFormula: false,   // Don't parse formulas
    });

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    // Step 2: Parse headers (row 2)
    // Columns B-J (1-9): Translation languages (en, fr, de, etc.)
    // Columns N-V (13-21): EULA languages
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const headerRow = [];
    for (let col = 1; col <= 21; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 1, c: col })];
      headerRow[col] = cell ? cell.w || cell.v : undefined;
    }

    // Step 3: Initialize language data structures
    const langData = {};   // For translation.json
    const eulaData = {};   // For eula.json

    for (let col = 1; col <= 9; col++) {
      const langName = headerRow[col];
      if (langName) langData[langName] = {};
    }

    for (let col = 13; col <= 21; col++) {
      const langName = headerRow[col];
      if (langName) eulaData[langName] = {};
    }

    // Step 4: Extract data from rows (starting row 3)
    for (let row = 2; row <= range.e.r; row++) {
      // Process translation columns (1-9)
      for (let col = 1; col <= 9; col++) {
        const langName = headerRow[col];
        if (!langName) continue;

        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell) continue;

        const rawValue = cell.w || cell.v;  // Preserve display format
        if (!rawValue || typeof rawValue !== "string") continue;

        // Parse format: "key": "value"
        const match = rawValue.match(/"([^"]+)"\s*:\s*"([\s\S]*)"/);
        if (match) {
          const key = match[1];
          const value = match[2];
          langData[langName][key] = value;
        }
      }

      // Process EULA columns (13-21) - same logic
      for (let col = 13; col <= 21; col++) {
        // ... similar parsing
      }
    }

    // Step 5: Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Step 6: Generate JSON files with Prettier formatting
    const prettierConfig = await prettier.resolveConfig(__dirname);
    const createdFiles = [];

    // Write translation.json files
    for (const [lang, dict] of Object.entries(langData)) {
      let folderName = lang.toLowerCase() === "italian"
        ? "ita"
        : lang.toLowerCase().substring(0, 2);

      const langFolder = path.join(outputDir, folderName);
      fs.mkdirSync(langFolder, { recursive: true });

      const filePath = path.join(langFolder, "translation.json");

      // Build JSON string (avoiding double-escaping)
      const jsonString = "{\n" +
        Object.entries(dict)
          .map(([k, v]) => `  "${k}": "${v}"`)
          .join(",\n") +
        "\n}";

      // Format with Prettier
      const formatted = await prettier.format(jsonString, {
        ...prettierConfig,
        parser: "json",
        filepath: filePath,
      });

      fs.writeFileSync(filePath, formatted, "utf8");
      createdFiles.push(filePath);
    }

    // Write eula.json files (same process)
    // ...

    // Step 7: Return success result
    return {
      success: true,
      message: "Export completed successfully!",
      filesCreated: createdFiles.length,
      files: createdFiles,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
});
```

**What this does:**
1. Reads the Excel file using `xlsx` library
2. Extracts language names from row 2 (headers)
3. Parses each data row starting from row 3
4. Extracts key-value pairs in format `"key": "value"`
5. Creates language folders (e.g., `en/`, `fr/`, `ita/`)
6. Generates `translation.json` and `eula.json` for each language
7. Formats JSON files with Prettier for consistent styling
8. Returns success/failure status with file count

#### App Lifecycle

```javascript
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    // macOS: recreate window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Quit when all windows are closed (except on macOS)
  if (process.platform !== "darwin") {
    app.quit();
  }
});
```

### 2. `preload.js` - Secure Context Bridge

The `preload.js` file is a critical part of Electron's security model. It acts as a controlled bridge between the renderer process (the UI) and the main process (which has access to Node.js and system APIs).

#### Purpose
- **Security**: Prevents direct access to Node.js APIs from the renderer, reducing attack surface.
- **Controlled Exposure**: Only exposes safe, specific functions to the renderer via the `electronAPI` object.

#### How It Works
- Uses Electron's `contextBridge` to expose a limited API (`electronAPI`) to the window object in the renderer.
- Uses `ipcRenderer.invoke` to send requests to the main process and receive results asynchronously.

#### Exposed Functions
```javascript
contextBridge.exposeInMainWorld("electronAPI", {
  selectFile: () => ipcRenderer.invoke("select-file"),
  selectDestination: () => ipcRenderer.invoke("select-destination"),
  exportTranslation: (inputFile, outputDir, template) =>
    ipcRenderer.invoke("export-translation", inputFile, outputDir, template),
});
```
- **selectFile**: Opens a file dialog for the user to select an Excel file. Returns the file path.
- **selectDestination**: Opens a folder dialog for the user to select the output directory. Returns the folder path.
- **exportTranslation**: Sends the selected file, output directory, and template type to the main process, which runs the appropriate export logic and returns the result.

#### Why Use a Preload Script?
- **Context Isolation**: Ensures the renderer runs in a sandboxed environment, unable to access Node.js directly.
- **Explicit API**: Only the functions defined in `electronAPI` are available to the renderer, making the app safer and easier to audit.
- **Async Communication**: All operations use IPC (Inter-Process Communication) for safe, asynchronous messaging between processes.

#### Example Usage in Renderer
```javascript
const filePath = await window.electronAPI.selectFile();
const destPath = await window.electronAPI.selectDestination();
const result = await window.electronAPI.exportTranslation(filePath, destPath);
```

This design keeps your app secure and maintainable, following Electron's best practices.

### 3. `renderer.js` - Renderer Process (Frontend)

The renderer process is the frontend of your Electron app. It runs in a browser-like environment and handles all UI interactions. It **cannot** access Node.js APIs directly due to security settings.

#### Key Responsibilities
- **Event Handling**: Listens for button clicks and form submissions
- **UI Updates**: Displays selected file paths and loading states
- **API Calls**: Communicates with main process via `window.electronAPI`
- **User Feedback**: Shows success/error messages

#### State Management

```javascript
let selectedFilePath = null;  // Stores selected Excel file path
let selectedDestPath = null;   // Stores selected output directory
```

These variables track user selections throughout the session.

#### Persistent Storage

```javascript
// Load saved destination path on startup
window.addEventListener("DOMContentLoaded", () => {
  const savedDestPath = localStorage.getItem("savedDestinationPath");
  if (savedDestPath) {
    selectedDestPath = savedDestPath;
    destinationField.value = savedDestPath;
  }
});
```

The app automatically saves and restores the destination path using `localStorage`, so you don't need to re-select it every time you run the app.

#### Element References

```javascript
const selectFileBtn = document.getElementById("selectFileBtn");
const selectDestBtn = document.getElementById("selectDestBtn");
const inputFileField = document.getElementById("inputFile");
const destinationField = document.getElementById("destination");
const exportForm = document.getElementById("export-form");
```

Gets references to DOM elements for attaching event listeners.

#### Event Handlers

**1. File Selection**

```javascript
selectFileBtn.addEventListener("click", async () => {
  // Call main process to show file dialog
  const filePath = await window.electronAPI.selectFile();

  if (filePath) {
    selectedFilePath = filePath;          // Store path in state
    inputFileField.value = filePath;       // Display path in UI
  }
});
```

**What happens:**
1. User clicks "Browse" button for input file
2. Calls `window.electronAPI.selectFile()` (exposed by preload.js)
3. Main process shows native file dialog
4. Returns selected file path
5. Updates UI to show selected path

**2. Destination Selection**

```javascript
selectDestBtn.addEventListener("click", async () => {
  // Call main process to show folder dialog
  const destPath = await window.electronAPI.selectDestination();

  if (destPath) {
    selectedDestPath = destPath;                          // Store path in state
    destinationField.value = destPath;                     // Display path in UI
    localStorage.setItem("savedDestinationPath", destPath); // Save for next session
  }
});
```

**What happens:**
1. User clicks "Browse" button for destination
2. Calls `window.electronAPI.selectDestination()` (exposed by preload.js)
3. Main process shows native folder dialog
4. Returns selected folder path
5. Updates UI to show selected path
6. Saves path to localStorage for persistence

**2b. Clear Destination**

```javascript
clearDestBtn.addEventListener("click", () => {
  selectedDestPath = null;
  destinationField.value = "";
  localStorage.removeItem("savedDestinationPath");
});
```

Allows users to clear the saved destination path.

**3. Export Process** (Main Workflow)

```javascript
exportForm.addEventListener("submit", async (e) => {
  e.preventDefault();  // Prevent default form submission

  // Step 1: Validate inputs
  if (!selectedFilePath) {
    alert("Please select an input file");
    return;
  }

  if (!selectedDestPath) {
    alert("Please select a destination folder");
    return;
  }

  // Step 2: Show loading state
  const exportBtn = document.querySelector(".export-btn");
  const originalText = exportBtn.textContent;
  exportBtn.disabled = true;             // Disable button
  exportBtn.textContent = "Exporting..."; // Show loading text

  const template = templateSelect.value;  // Get selected template

  try {
    // Step 3: Call main process to perform export
    const result = await window.electronAPI.exportTranslation(
      selectedFilePath,
      selectedDestPath,
      template
    );

    // Step 4: Show results to user
    if (result.success) {
      alert(
        `${result.message}\n\n` +
        `Files created: ${result.filesCreated}\n` +
        `Destination: ${selectedDestPath}`
      );
    } else {
      alert(`Export failed: ${result.message}`);
    }
  } catch (error) {
    // Handle unexpected errors
    alert(`Export error: ${error.message}`);
  } finally {
    // Step 5: Reset UI (always runs, even if error occurs)
    exportBtn.disabled = false;
    exportBtn.textContent = originalText;
  }
});
```

**What happens:**
1. User clicks "Export to locales" button
2. Validates that both file and destination are selected
3. Disables button and shows "Exporting..." text
4. Calls main process to run export logic
5. Waits for result (success or failure)
6. Shows alert with detailed results
7. Re-enables button and restores original text

#### Communication Flow

```
User Action → Event Listener → window.electronAPI.method() →
  → Preload Script → IPC → Main Process →
    → File System/Dialog → Result →
      → Preload Script → Renderer → UI Update
```

The renderer **never** accesses Node.js directly. All system operations go through the secure `electronAPI` bridge.

#### Error Handling

```javascript
try {
  const result = await window.electronAPI.exportTranslation(...);
  // Handle success
} catch (error) {
  // Handle unexpected errors (network, IPC failures, etc.)
  alert(`Export error: ${error.message}`);
} finally {
  // Always restore UI state
  exportBtn.disabled = false;
  exportBtn.textContent = originalText;
}
```

The `try-catch-finally` pattern ensures:
- Errors are caught and displayed to the user
- UI is always restored to normal state (button re-enabled)
- No stuck loading states

### 4. `index.html` - User Interface

Simple, clean HTML structure:

```html
<form id="export-form">
  <!-- Template Selection -->
  <div class="form-group">
    <label>Template:</label>
    <select id="template">
      <option value="FD" selected>FD</option>
      <option value="ACE">ACE</option>
      <option value="AGPD">AGPD</option>
    </select>
  </div>

  <!-- Input File Selection -->
  <div class="form-group">
    <label>Input File:</label>
    <input type="text" id="inputFile" readonly />
    <button type="button" id="selectFileBtn">Browse</button>
  </div>

  <!-- Destination Folder -->
  <div class="form-group">
    <label>Destination:</label>
    <input type="text" id="destination" readonly />
    <button type="button" id="selectDestBtn">Browse</button>
    <button type="button" id="clearDestBtn">Clear</button>
  </div>

  <!-- Export Button -->
  <button type="submit" class="export-btn">Export to locales</button>
</form>
```

### 5. `styles.css` - Styling

Modern, clean interface with:

- Responsive layout (max-width: 600px)
- Flexbox for input/button alignment
- Distinct button states (primary, secondary, hover, disabled)
- System font stack for native appearance

## Security Features

### Context Isolation ✅

```javascript
contextIsolation: true; // Renderer cannot access Node.js APIs
```

### No Node Integration ✅

```javascript
nodeIntegration: false; // Renderer runs in browser-like environment
```

### Preload Script ✅

```javascript
// Only specific functions are exposed via Context Bridge
// Renderer cannot call arbitrary Node.js/Electron APIs
```

### Content Security Policy ✅

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'"
/>
```

## Data Flow

### Complete Export Flow

```
1. User clicks "Browse" for input file
   └─▶ renderer.js: selectFileBtn.click
       └─▶ preload.js: electronAPI.selectFile()
           └─▶ main.js: ipcMain.handle("select-file")
               └─▶ dialog.showOpenDialog()
                   └─▶ return filePath
                       └─▶ Update UI with selected path

2. User clicks "Browse" for destination
   └─▶ renderer.js: selectDestBtn.click
       └─▶ preload.js: electronAPI.selectDestination()
           └─▶ main.js: ipcMain.handle("select-destination")
               └─▶ dialog.showOpenDialog()
                   └─▶ return folderPath
                       └─▶ Update UI with selected path

3. User clicks "Export to locales"
   └─▶ renderer.js: exportForm.submit
       └─▶ Validate inputs
       └─▶ Get selected template (FD/ACE/AGPD)
       └─▶ Show loading state
       └─▶ preload.js: electronAPI.exportTranslation(filePath, destPath, template)
           └─▶ main.js: ipcMain.handle("export-translation")
               └─▶ Route to appropriate template handler (switch statement)
               ├─▶ Read Excel file (XLSX.readFile)
               ├─▶ Parse headers (row 2)
               ├─▶ Extract data (row 3+)
               │   ├─▶ Parse translation columns (1-9)
               │   └─▶ Parse EULA columns (13-21)
               ├─▶ Create output directories
               ├─▶ Generate JSON files
               │   ├─▶ translation.json (per language)
               │   └─▶ eula.json (per language)
               ├─▶ Format with Prettier
               └─▶ return { success, filesCreated, files }
                   └─▶ Show success/error message
                       └─▶ Reset UI
```

## Dependencies

### Production Dependencies

- **`xlsx`** (^0.18.5): Excel file parsing and manipulation
  - Used for reading `.xlsx` and `.xls` files
  - Extracts cell values while preserving formatting

### Development Dependencies

- **`electron`** (^39.2.4): Desktop application framework
  - Cross-platform desktop app development
  - Native system APIs (dialogs, file system)

- **`electron-builder`** (^26.0.12): Application packaging
  - Creates distributable packages (.dmg, .exe, etc.)
  - Code signing and auto-update support

- **`prettier`** (3.7.1): Code formatter
  - Ensures consistent JSON formatting
  - Beautifies output files

## Build Configuration

The build configuration in `package.json` is optimized for minimal app size and efficient distribution.

### File Inclusion Strategy

```json
"files": [
  "main.js",
  "preload.js",
  "renderer.js",
  "index.html",
  "styles.css",
  "package.json",
  "!export-translation-to-json.js",  // Exclude unused files
  "node_modules/**/*",                 // Include all dependencies
  // Exclusion patterns for size optimization:
  "!node_modules/**/*.md",             // Remove documentation
  "!node_modules/**/*.ts",             // Remove TypeScript source files
  "!node_modules/**/LICENSE*",         // Remove license files
  "!node_modules/**/CHANGELOG*",       // Remove changelogs
  "!node_modules/**/HISTORY*",
  "!node_modules/**/{README,readme}*",
  "!node_modules/**/{test,tests,__tests__,example,examples,docs,doc}/**/*",  // Remove test/example files
  "!node_modules/**/*.{map,d.ts,flow}",  // Remove source maps and type definitions
  "!node_modules/**/{.eslintrc,.jshintrc,.flowconfig,.documentup.json,.yarn-metadata.json,.travis.yml,appveyor.yml}",
  "!node_modules/.bin",
  "!node_modules/.cache",
  "!node_modules/**/package-lock.json",
  "!node_modules/**/yarn.lock",
  "!**/{.DS_Store,.git,.gitignore,.gitattributes,.editorconfig,.prettierrc*}"
]
```

#### Size Optimization Techniques

1. **Remove Documentation**: `.md`, `README`, `LICENSE`, `CHANGELOG` files are excluded as they're not needed at runtime.

2. **Remove Development Files**: TypeScript sources (`.ts`), type definitions (`.d.ts`), source maps (`.map`), and Flow types are stripped out.

3. **Remove Tests & Examples**: All test directories and example code are excluded to reduce bundle size significantly.

4. **Remove Config Files**: Development configuration files (`.eslintrc`, `.prettierrc`, etc.) are not bundled.

5. **Remove Package Manager Files**: Lock files (`package-lock.json`, `yarn.lock`) are excluded as dependencies are already resolved.

6. **Remove Cache Directories**: `.cache`, `.bin` directories are excluded.

### Compression & Packaging

```json
"compression": "maximum",          // Maximum compression for smallest size
"asar": true,                       // Package files into single .asar archive
"npmRebuild": false,                // Skip unnecessary native module rebuilding
"removePackageScripts": true        // Remove npm scripts from dependencies
```

#### Benefits

- **`asar: true`**: Packages all files into a single archive, reducing file count and improving load times
- **`compression: maximum`**: Applies highest compression level to minimize download size
- **`npmRebuild: false`**: Skips rebuilding native modules (we don't have any), speeding up build time
- **`removePackageScripts: true`**: Removes npm scripts from `node_modules/*/package.json`, further reducing size

### macOS Build Configuration

```json
"mac": {
  "target": [{
    "target": "dmg",
    "arch": ["arm64"]            // Apple Silicon (M1/M2/M3/M4)
  }],
  "category": "public.app-category.utilities",
  "icon": "build/icon.icns"
},
"dmg": {
  "title": "${productName} ${version}",
  "icon": "build/icon.icns",
  "contents": [
    { "x": 130, "y": 220 },                      // App icon position
    { "x": 410, "y": 220, "type": "link", "path": "/Applications" }  // Applications folder link
  ],
  "window": { "width": 540, "height": 380 }
}
```

#### Platform Details

- **Target**: DMG (macOS disk image installer)
- **Architecture**: ARM64 only (optimized for Apple Silicon)
  - If you need Intel support, add `"x64"` to the `arch` array
- **Category**: Utilities (appears in Utilities folder in Launchpad)
- **DMG Layout**: Custom installer window with drag-to-Applications functionality

### Output

- **Format**: `.dmg` installer (macOS)
- **Location**: `dist/` directory
- **Compression**: Maximum
- **Architecture**: ARM64 (Apple Silicon)
- **Size**: Optimized with aggressive exclusion patterns

### Building for Other Platforms

To add Windows or Linux support, extend the configuration:

```json
"win": {
  "target": "nsis",
  "arch": ["x64"]
},
"linux": {
  "target": "AppImage",
  "arch": ["x64"]
}
```

## Troubleshooting

### Excel file not loading

- Ensure the file has a sheet named `json_tranlsation` (note the spelling)
- Verify the file is a valid `.xlsx` or `.xls` file

### Export fails silently

- Check that you have write permissions to the destination folder
- Ensure the Excel file is not open in another application
- Verify you've selected a valid template (FD is fully implemented)

### "Template not yet implemented" error

- ACE and AGPD templates are placeholders for future development
- Currently, only the FD template is functional
- Select "FD" from the template dropdown to use the current export logic

### JSON formatting issues

- The app uses Prettier for formatting; check `.prettierrc` if you have one
- Escape sequences in Excel cells are preserved

### Destination path not persisting

- The app uses localStorage to save the destination path
- If the path doesn't persist, check if your Electron app has storage permissions
- Use the "Clear" button to reset saved paths if needed

## License

MIT

## Author

Ken
