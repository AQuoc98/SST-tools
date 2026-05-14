import { exportFD } from "./templates/fd.js";
import { exportACE } from "./templates/ace.js";
import { exportHS } from "./templates/hs.js";

const exportForm = document.getElementById("export-form");
const templateSelect = document.getElementById("template");
const inputFileField = document.getElementById("inputFile");
const destinationField = document.getElementById("destination");
const selectDestBtn = document.getElementById("selectDestBtn");
const clearDestBtn = document.getElementById("clearDestBtn");
const exportBtn = document.getElementById("exportBtn");
const statusEl = document.getElementById("status");

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const FILE_NAME_PATTERN = /\.(xlsx|xls|csv)$/i;
const DESTINATION_LABEL_PREFIX = "savedDestinationLabel_";
const DESTINATION_DB_NAME = "exportTranslationDb";
const DESTINATION_DB_VERSION = 1;
const DESTINATION_STORE_NAME = "settings";
const DESTINATION_HANDLE_PREFIX = "destinationHandle_";

let selectedDestinationHandle = null;

function destinationLabelKey(template) {
  return `${DESTINATION_LABEL_PREFIX}${template}`;
}

function destinationHandleKey(template) {
  return `${DESTINATION_HANDLE_PREFIX}${template}`;
}

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

async function readSavedDestinationHandle(template) {
  const db = await openDestinationDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DESTINATION_STORE_NAME, "readonly");
      const store = tx.objectStore(DESTINATION_STORE_NAME);
      const request = store.get(destinationHandleKey(template));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function saveDestinationHandle(template, handle) {
  const db = await openDestinationDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DESTINATION_STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(DESTINATION_STORE_NAME).put(
        handle,
        destinationHandleKey(template),
      );
    });
  } finally {
    db.close();
  }
}

async function clearSavedDestinationHandle(template) {
  const db = await openDestinationDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DESTINATION_STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(DESTINATION_STORE_NAME).delete(
        destinationHandleKey(template),
      );
    });
  } finally {
    db.close();
  }
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : "status";
}

function formatDestinationLabel(template, folderName) {
  return `${folderName} (${template})`;
}

async function exportTranslation(file, template, destinationHandle) {
  switch (template) {
    case "FD":
      return exportFD(file, destinationHandle);
    case "ACE":
      return exportACE(file, destinationHandle);
    case "HS":
      return exportHS(file, destinationHandle);
    case "AGPD":
      return { success: false, message: "AGPD template not yet implemented" };
    default:
      return { success: false, message: `Unknown template: ${template}` };
  }
}

async function loadDestinationForTemplate(template) {
  selectedDestinationHandle = null;
  destinationField.value = "";

  const savedLabel = localStorage.getItem(destinationLabelKey(template));
  if (savedLabel) {
    destinationField.value = savedLabel;
  }

  try {
    const savedHandle = await readSavedDestinationHandle(template);
    if (savedHandle) {
      selectedDestinationHandle = savedHandle;
      destinationField.value =
        savedLabel || formatDestinationLabel(template, savedHandle.name);
    }
  } catch {
    // If handle restoration fails, keep label-only fallback and allow manual reselection.
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.showDirectoryPicker !== "function") {
    destinationField.placeholder =
      "Directory picker not supported by this browser";
    selectDestBtn.disabled = true;
    setStatus(
      "This browser does not support destination-folder writing. Use a supported Chromium-based browser.",
      "error",
    );
    return;
  }

  await loadDestinationForTemplate(templateSelect.value);
  if (selectedDestinationHandle) {
    setStatus(`Saved destination loaded: ${destinationField.value}`);
  }
});

templateSelect.addEventListener("change", async () => {
  await loadDestinationForTemplate(templateSelect.value);
});

selectDestBtn.addEventListener("click", async () => {
  if (typeof window.showDirectoryPicker !== "function") {
    setStatus(
      "This browser does not support destination folder selection. Export will use zip download.",
      "error",
    );
    return;
  }

  try {
    const template = templateSelect.value;
    const pickerOptions = { mode: "readwrite", id: `dest_${template}` };
    if (selectedDestinationHandle) {
      pickerOptions.startIn = selectedDestinationHandle;
    }
    const handle = await window.showDirectoryPicker(pickerOptions);
    const label = formatDestinationLabel(template, handle.name);
    selectedDestinationHandle = handle;
    destinationField.value = label;
    localStorage.setItem(destinationLabelKey(template), label);
    await saveDestinationHandle(template, handle);
    setStatus(`Destination selected: ${label}`, "success");
  } catch (error) {
    if (error?.name === "AbortError") return;
    setStatus(`Unable to select destination: ${error.message}`, "error");
  }
});

clearDestBtn.addEventListener("click", () => {
  const template = templateSelect.value;
  selectedDestinationHandle = null;
  destinationField.value = "";
  localStorage.removeItem(destinationLabelKey(template));
  clearSavedDestinationHandle(template).catch(() => {
    // no-op: UI still clears the active destination reference
  });
  setStatus(
    "Destination cleared. Please select a destination folder before exporting.",
  );
});

exportForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = inputFileField.files?.[0];
  if (!file) {
    setStatus("Please select an input file", "error");
    return;
  }

  if (!FILE_NAME_PATTERN.test(file.name)) {
    setStatus("Please select a valid .xlsx, .xls or .csv file", "error");
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    setStatus(
      "File is too large. Please use a workbook smaller than 20MB for browser export.",
      "error",
    );
    return;
  }

  if (!selectedDestinationHandle) {
    setStatus("Please select a destination folder first.", "error");
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
      selectedDestinationHandle,
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
      "success",
    );
  } catch (error) {
    setStatus(`Export error: ${error.message}`, "error");
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = previousButtonText;
  }
});
