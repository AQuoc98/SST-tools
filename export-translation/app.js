import * as XLSX from "xlsx";

const exportForm = document.getElementById("export-form");
const templateSelect = document.getElementById("template");
const inputFileField = document.getElementById("inputFile");
const destinationField = document.getElementById("destination");
const selectDestBtn = document.getElementById("selectDestBtn");
const clearDestBtn = document.getElementById("clearDestBtn");
const exportBtn = document.getElementById("exportBtn");
const statusEl = document.getElementById("status");

const SHEET_NAME = "json_tranlsation";
const HEADER_ROW_INDEX = 1; // Excel row 2
const DATA_START_ROW_INDEX = 2; // Excel row 3
const TRANSLATION_COL_START = 1; // B
const TRANSLATION_COL_END = 9; // J
const EULA_COL_START = 13; // N
const EULA_COL_END = 21; // V
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const FILE_NAME_PATTERN = /\.(xlsx|xls)$/i;
const DESTINATION_LABEL_KEY = "savedDestinationLabel";
const DESTINATION_DB_NAME = "exportTranslationDb";
const DESTINATION_DB_VERSION = 1;
const DESTINATION_STORE_NAME = "settings";
const DESTINATION_HANDLE_KEY = "destinationHandle";

let selectedDestinationHandle = null;

function openDestinationDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DESTINATION_DB_NAME, DESTINATION_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DESTINATION_STORE_NAME)) {
        db.createObjectStore(DESTINATION_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSavedDestinationHandle() {
  const db = await openDestinationDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DESTINATION_STORE_NAME, "readonly");
      const store = tx.objectStore(DESTINATION_STORE_NAME);
      const request = store.get(DESTINATION_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function saveDestinationHandle(handle) {
  const db = await openDestinationDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DESTINATION_STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(DESTINATION_STORE_NAME).put(handle, DESTINATION_HANDLE_KEY);
    });
  } finally {
    db.close();
  }
}

async function clearSavedDestinationHandle() {
  const db = await openDestinationDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DESTINATION_STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(DESTINATION_STORE_NAME).delete(DESTINATION_HANDLE_KEY);
    });
  } finally {
    db.close();
  }
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : "status";
}

function normalizeLangFolder(lang) {
  if (!lang) return "";
  const lowered = String(lang).trim().toLowerCase();
  return lowered === "italian" ? "ita" : lowered.substring(0, 2);
}

function parseLine(rawValue) {
  if (!rawValue || typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  const match = trimmed.match(/"([^"]+)"\s*:\s*"([\s\S]*)"/);
  if (!match) return null;
  return { key: match[1], value: match[2] };
}

function buildHeaderRow(sheet) {
  const headerRow = [];
  for (let col = 1; col <= 21; col += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: HEADER_ROW_INDEX, c: col })];
    headerRow[col] = cell ? cell.w || cell.v : undefined;
  }
  return headerRow;
}

function initLanguageBuckets(headerRow, startCol, endCol) {
  const data = {};
  for (let col = startCol; col <= endCol; col += 1) {
    const langName = String(headerRow[col] || "").trim();
    if (langName) data[langName] = {};
  }
  return data;
}

function getIgnoredHeaderColumns(sheet, range, headerRow) {
  const ignored = [];
  for (let col = 10; col <= 12; col += 1) {
    let hasParseableData = false;
    for (let row = DATA_START_ROW_INDEX; row <= range.e.r; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (!cell) continue;
      if (parseLine(cell.w || cell.v)) {
        hasParseableData = true;
        break;
      }
    }

    if (!hasParseableData) continue;

    const rawValue = String(headerRow[col] || "").trim();
    const value = rawValue.replace(/^"+|"+$/g, "").trim();
    ignored.push({ col, value: value || "(unnamed)" });
  }
  return ignored;
}

function populateRange(sheet, range, headerRow, targetData, startCol, endCol) {
  for (let row = DATA_START_ROW_INDEX; row <= range.e.r; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const langName = headerRow[col];
      if (!langName) continue;

      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (!cell) continue;

      const parsed = parseLine(cell.w || cell.v);
      if (!parsed) continue;

      targetData[langName][parsed.key] = parsed.value;
    }
  }
}

function buildExportData(workbook) {
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found`);
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headerRow = buildHeaderRow(sheet);
  const ignoredHeaders = getIgnoredHeaderColumns(sheet, range, headerRow);

  const translationData = initLanguageBuckets(
    headerRow,
    TRANSLATION_COL_START,
    TRANSLATION_COL_END
  );
  const eulaData = initLanguageBuckets(headerRow, EULA_COL_START, EULA_COL_END);

  populateRange(
    sheet,
    range,
    headerRow,
    translationData,
    TRANSLATION_COL_START,
    TRANSLATION_COL_END
  );

  populateRange(sheet, range, headerRow, eulaData, EULA_COL_START, EULA_COL_END);

  return { translationData, eulaData, ignoredHeaders };
}

function toJsonFileContent(dict) {
  const entries = Object.entries(dict);
  if (entries.length === 0) {
    return "{}\n";
  }

  const body = entries.map(([key, value]) => `  "${key}": "${value}"`).join(",\n");
  return `{\n${body}\n}\n`;
}

async function ensureDirectoryPermission(handle) {
  const options = { mode: "readwrite" };
  let permission = await handle.queryPermission(options);
  if (permission === "granted") return;
  permission = await handle.requestPermission(options);
  if (permission !== "granted") {
    throw new Error("Destination folder permission was not granted.");
  }
}

async function writeJsonFile(rootHandle, folderName, fileName, content) {
  const langFolder = await rootHandle.getDirectoryHandle(folderName, {
    create: true,
  });
  const fileHandle = await langFolder.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeExportFilesToDestination(rootHandle, translationData, eulaData) {
  let fileCount = 0;

  for (const [lang, dict] of Object.entries(translationData)) {
    const folder = normalizeLangFolder(lang);
    if (!folder) continue;
    await writeJsonFile(rootHandle, folder, "translation.json", toJsonFileContent(dict));
    fileCount += 1;
  }

  for (const [lang, dict] of Object.entries(eulaData)) {
    const folder = normalizeLangFolder(lang);
    if (!folder) continue;
    await writeJsonFile(rootHandle, folder, "eula.json", toJsonFileContent(dict));
    fileCount += 1;
  }

  return fileCount;
}

async function exportFD(file, destinationHandle) {
  if (!destinationHandle) {
    throw new Error("Please select a destination folder before exporting.");
  }

  let workbook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, {
      type: "array",
      cellText: false,
      cellFormula: false,
    });
  } catch {
    throw new Error("Unable to parse workbook. Please verify the file is a valid .xlsx/.xls document.");
  }

  const { translationData, eulaData, ignoredHeaders } = buildExportData(workbook);
  const warnings = [];
  if (ignoredHeaders.length > 0) {
    warnings.push(
      `Ignored header columns K-M: ${ignoredHeaders
        .map((item) => `${item.value} (col ${item.col + 1})`)
        .join(", ")}`
    );
  }

  await ensureDirectoryPermission(destinationHandle);
  const fileCount = await writeExportFilesToDestination(
    destinationHandle,
    translationData,
    eulaData
  );

  return {
    success: true,
    message: "Export completed successfully (FD Template)!",
    filesCreated: fileCount,
    output: "destination",
    destination: destinationHandle.name,
    warnings,
  };
}

async function exportTranslation(file, template, destinationHandle) {
  switch (template) {
    case "FD":
      return exportFD(file, destinationHandle);
    case "ACE":
      return { success: false, message: "ACE template not yet implemented" };
    case "AGPD":
      return { success: false, message: "AGPD template not yet implemented" };
    default:
      return { success: false, message: `Unknown template: ${template}` };
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  const savedDestinationLabel = localStorage.getItem(DESTINATION_LABEL_KEY);

  if (typeof window.showDirectoryPicker !== "function") {
    destinationField.placeholder = "Directory picker not supported by this browser";
    selectDestBtn.disabled = true;
    setStatus(
      "This browser does not support destination-folder writing. Use a supported Chromium-based browser.",
      "error"
    );
    return;
  }

  if (savedDestinationLabel) {
    destinationField.value = savedDestinationLabel;
  }

  try {
    const savedHandle = await readSavedDestinationHandle();
    if (savedHandle) {
      selectedDestinationHandle = savedHandle;
      destinationField.value = savedHandle.name || savedDestinationLabel || "Saved destination";
      setStatus(`Saved destination loaded: ${destinationField.value}`);
    }
  } catch {
    // If handle restoration fails, keep label-only fallback and allow manual reselection.
  }
});

selectDestBtn.addEventListener("click", async () => {
  if (typeof window.showDirectoryPicker !== "function") {
    setStatus(
      "This browser does not support destination folder selection. Export will use zip download.",
      "error"
    );
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    selectedDestinationHandle = handle;
    destinationField.value = handle.name;
    localStorage.setItem(DESTINATION_LABEL_KEY, handle.name);
    await saveDestinationHandle(handle);
    setStatus(`Destination selected: ${handle.name}`, "success");
  } catch (error) {
    if (error?.name === "AbortError") return;
    setStatus(`Unable to select destination: ${error.message}`, "error");
  }
});

clearDestBtn.addEventListener("click", () => {
  selectedDestinationHandle = null;
  destinationField.value = "";
  localStorage.removeItem(DESTINATION_LABEL_KEY);
  clearSavedDestinationHandle().catch(() => {
    // no-op: UI still clears the active destination reference
  });
  setStatus("Destination cleared. Please select a destination folder before exporting.");
});

exportForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = inputFileField.files?.[0];
  if (!file) {
    setStatus("Please select an input file", "error");
    return;
  }

  if (!FILE_NAME_PATTERN.test(file.name)) {
    setStatus("Please select a valid .xlsx or .xls file", "error");
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    setStatus(
      "File is too large. Please use a workbook smaller than 20MB for browser export.",
      "error"
    );
    return;
  }

  if (!selectedDestinationHandle) {
    setStatus(
      "Please select a destination folder first.",
      "error"
    );
    return;
  }

  const template = templateSelect.value;

  exportBtn.disabled = true;
  const previousButtonText = exportBtn.textContent;
  exportBtn.textContent = "Exporting...";
  setStatus("Processing workbook...");

  try {
    const result = await exportTranslation(
      file,
      template,
      selectedDestinationHandle
    );
    if (!result.success) {
      setStatus(`Export failed: ${result.message}`, "error");
      return;
    }

    const warningText =
      result.warnings && result.warnings.length > 0
        ? `\nWarnings:\n- ${result.warnings.join("\n- ")}`
        : "";

    const outputText = `\nDestination: ${result.destination}`;

    setStatus(
      `${result.message}\nJSON files generated: ${result.filesCreated}${outputText}${warningText}`,
      "success"
    );
  } catch (error) {
    setStatus(`Export error: ${error.message}`, "error");
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = previousButtonText;
  }
});
