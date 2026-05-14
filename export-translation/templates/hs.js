import * as XLSX from "xlsx";

const SHEET_NAME = "json_tranlsation";
const HEADER_ROW_INDEX = 1; // Excel row 2
const DATA_START_ROW_INDEX = 2; // Excel row 3 and onwards
const TRANSLATION_COL = 1; // Column B
const EULA_COL = 13; // Column N
const LANG_FOLDER = "en";

function parseLine(rawValue) {
  if (!rawValue || typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  const match = trimmed.match(/"([^"]+)"\s*:\s*"([\s\S]*)"/);
  if (!match) return null;
  return { key: match[1], value: match[2] };
}

function populateColumn(sheet, range, targetData, col) {
  for (let row = DATA_START_ROW_INDEX; row <= range.e.r; row += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
    if (!cell) continue;

    const parsed = parseLine(cell.w || cell.v);
    if (!parsed) continue;

    targetData[parsed.key] = parsed.value;
  }
}

function buildExportData(workbook) {
  const sheet =
    workbook.Sheets[SHEET_NAME] ||
    workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found`);
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const translationData = {};
  const eulaData = {};

  populateColumn(sheet, range, translationData, TRANSLATION_COL);
  populateColumn(sheet, range, eulaData, EULA_COL);

  return { translationData, eulaData };
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

  await writeJsonFile(
    rootHandle,
    LANG_FOLDER,
    "translation.json",
    toJsonFileContent(translationData),
  );
  fileCount += 1;

  await writeJsonFile(
    rootHandle,
    LANG_FOLDER,
    "eula.json",
    toJsonFileContent(eulaData),
  );
  fileCount += 1;

  return fileCount;
}

export async function exportHS(file, destinationHandle) {
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

  const { translationData, eulaData } = buildExportData(workbook);

  await ensureDirectoryPermission(destinationHandle);
  const fileCount = await writeExportFilesToDestination(
    destinationHandle,
    translationData,
    eulaData,
  );

  return {
    success: true,
    message: "Export completed successfully (HS Template)!",
    filesCreated: fileCount,
    output: "destination",
    destination: destinationHandle.name,
    warnings: [],
  };
}
