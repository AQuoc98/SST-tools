import * as XLSX from "xlsx";

const SHEET_NAME = "json_tranlsation";
const HEADER_ROW_INDEX = 1; // Excel rows 2
const DATA_START_ROW_INDEX = 2; // Excel rows 3 and onwards
const TRANSLATION_COL_START = 1; // Column B
const TRANSLATION_COL_END = 9; // Column J
const EULA_COL_START = 13; // Column N
const EULA_COL_END = 21; // Column V

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
  for (let col = TRANSLATION_COL_END + 1; col < EULA_COL_START; col += 1) {
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
    TRANSLATION_COL_END,
  );
  const eulaData = initLanguageBuckets(headerRow, EULA_COL_START, EULA_COL_END);

  populateRange(
    sheet,
    range,
    headerRow,
    translationData,
    TRANSLATION_COL_START,
    TRANSLATION_COL_END,
  );

  populateRange(
    sheet,
    range,
    headerRow,
    eulaData,
    EULA_COL_START,
    EULA_COL_END,
  );

  return { translationData, eulaData, ignoredHeaders };
}

function toJsonFileContent(dict) {
  const entries = Object.entries(dict);
  if (entries.length === 0) {
    return "{}\n";
  }

  const body = entries
    .map(([key, value]) => `  "${key}": "${value}"`)
    .join(",\n");
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

async function writeExportFilesToDestination(
  rootHandle,
  translationData,
  eulaData,
) {
  let fileCount = 0;

  for (const [lang, dict] of Object.entries(translationData)) {
    const folder = normalizeLangFolder(lang);
    if (!folder) continue;
    await writeJsonFile(
      rootHandle,
      folder,
      "translation.json",
      toJsonFileContent(dict),
    );
    fileCount += 1;
  }

  for (const [lang, dict] of Object.entries(eulaData)) {
    const folder = normalizeLangFolder(lang);
    if (!folder) continue;
    await writeJsonFile(
      rootHandle,
      folder,
      "eula.json",
      toJsonFileContent(dict),
    );
    fileCount += 1;
  }

  return fileCount;
}

export async function exportFD(file, destinationHandle) {
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
    throw new Error(
      "Unable to parse workbook. Please verify the file is a valid .xlsx/.xls document.",
    );
  }

  const { translationData, eulaData, ignoredHeaders } =
    buildExportData(workbook);
  const warnings = [];
  if (ignoredHeaders.length > 0) {
    warnings.push(
      `Ignored header columns K-M: ${ignoredHeaders
        .map((item) => `${item.value} (col ${item.col + 1})`)
        .join(", ")}`,
    );
  }

  await ensureDirectoryPermission(destinationHandle);
  const fileCount = await writeExportFilesToDestination(
    destinationHandle,
    translationData,
    eulaData,
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
