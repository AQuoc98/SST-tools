const { app, BrowserWindow, ipcMain, dialog } = require("electron/main");
const path = require("path");
const XLSX = require("xlsx");
const fs = require("fs");
const prettier = require("prettier");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile("index.html");
};

// Handle file selection
ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Excel Files", extensions: ["xlsx", "xls"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Handle destination folder selection
ipcMain.handle("select-destination", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Handle export translation
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

    // Read Excel file without parsing formulas
    const workbook = XLSX.readFile(inputFile, {
      cellText: false,
      cellFormula: false,
    });
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    // Get data range in the sheet
    const range = XLSX.utils.decode_range(sheet["!ref"]);

    // Row 2 is header: B2 → J2 (translation) and N2 → V2 (eula)
    const headerRow = [];
    for (let col = 1; col <= 21; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 1, c: col })];
      headerRow[col] = cell ? cell.w || cell.v : undefined;
    }

    // Initialize language objects for translation (columns 1-9)
    const langData = {};
    for (let col = 1; col <= 9; col++) {
      const langName = headerRow[col];
      if (langName) langData[langName] = {};
    }

    // Initialize language objects for eula (columns 13-21)
    const eulaData = {};
    for (let col = 13; col <= 21; col++) {
      const langName = headerRow[col];
      if (langName) eulaData[langName] = {};
    }

    // Iterate through each row starting from row 3
    for (let row = 2; row <= range.e.r; row++) {
      // Process translation (columns 1-9)
      for (let col = 1; col <= 9; col++) {
        const langName = headerRow[col];
        if (!langName) continue;

        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell) continue;

        // Use cell.w to preserve displayed characters (including escape sequences)
        const rawValue = cell.w || cell.v;
        if (!rawValue || typeof rawValue !== "string") continue;

        // Parse key-value from string format `"key": "value"`
        const match = rawValue.match(/"([^"]+)"\s*:\s*"([\s\S]*)"/);
        if (match) {
          const key = match[1];
          const value = match[2];
          langData[langName][key] = value;
        }
      }

      // Process eula (columns 13-21)
      for (let col = 13; col <= 21; col++) {
        const langName = headerRow[col];
        if (!langName) continue;

        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell) continue;

        const rawValue = cell.w || cell.v;
        if (!rawValue || typeof rawValue !== "string") continue;

        const match = rawValue.match(/"([^"]+)"\s*:\s*"([\s\S]*)"/);
        if (match) {
          const key = match[1];
          const value = match[2];
          eulaData[langName][key] = value;
        }
      }
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    // Load Prettier config from project
    const prettierConfig = await prettier.resolveConfig(__dirname);

    const createdFiles = [];

    // Write translation.json files
    for (const [lang, dict] of Object.entries(langData)) {
      let folderName =
        lang.toLowerCase() === "italian"
          ? "ita"
          : lang.toLowerCase().substring(0, 2);
      const langFolder = path.join(outputDir, folderName);
      if (!fs.existsSync(langFolder))
        fs.mkdirSync(langFolder, { recursive: true });

      const filePath = path.join(langFolder, "translation.json");

      // Manually build JSON to avoid double-escaping
      const jsonString =
        "{\n" +
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

    // Write eula.json files
    for (const [lang, dict] of Object.entries(eulaData)) {
      let folderName =
        lang.toLowerCase() === "italian"
          ? "ita"
          : lang.toLowerCase().substring(0, 2);
      const langFolder = path.join(outputDir, folderName);
      if (!fs.existsSync(langFolder))
        fs.mkdirSync(langFolder, { recursive: true });

      const filePath = path.join(langFolder, "eula.json");

      const jsonString =
        "{\n" +
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

    return {
      success: true,
      message: "Export completed successfully (FD Template)!",
      filesCreated: createdFiles.length,
      files: createdFiles,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
