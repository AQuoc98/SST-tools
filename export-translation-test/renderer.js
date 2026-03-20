const selectFileBtn = document.getElementById("selectFileBtn");
const selectDestBtn = document.getElementById("selectDestBtn");
const clearDestBtn = document.getElementById("clearDestBtn");
const inputFileField = document.getElementById("inputFile");
const destinationField = document.getElementById("destination");
const templateSelect = document.getElementById("template");
const exportForm = document.getElementById("export-form");

let selectedFilePath = null;
let selectedDestPath = null;

// Load saved destination path on startup
window.addEventListener("DOMContentLoaded", () => {
  const savedDestPath = localStorage.getItem("savedDestinationPath");
  if (savedDestPath) {
    selectedDestPath = savedDestPath;
    destinationField.value = savedDestPath;
  }
});

// Handle file selection
selectFileBtn.addEventListener("click", async () => {
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    selectedFilePath = filePath;
    inputFileField.value = filePath;
  }
});

// Handle destination selection
selectDestBtn.addEventListener("click", async () => {
  const destPath = await window.electronAPI.selectDestination();
  if (destPath) {
    selectedDestPath = destPath;
    destinationField.value = destPath;
    // Save destination path to localStorage
    localStorage.setItem("savedDestinationPath", destPath);
  }
});

// Handle clear destination
clearDestBtn.addEventListener("click", () => {
  selectedDestPath = null;
  destinationField.value = "";
  localStorage.removeItem("savedDestinationPath");
});

// Handle form submission
exportForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!selectedFilePath) {
    alert("Please select an input file");
    return;
  }

  if (!selectedDestPath) {
    alert("Please select a destination folder");
    return;
  }

  // Disable the export button during processing
  const exportBtn = document.querySelector(".export-btn");
  const originalText = exportBtn.textContent;
  exportBtn.disabled = true;
  exportBtn.textContent = "Exporting...";

  const template = templateSelect.value;

  try {
    const result = await window.electronAPI.exportTranslation(
      selectedFilePath,
      selectedDestPath,
      template
    );

    if (result.success) {
      alert(
        `${result.message}\n\nFiles created: ${result.filesCreated}\nDestination: ${selectedDestPath}`
      );
    } else {
      alert(`Export failed: ${result.message}`);
    }
  } catch (error) {
    alert(`Export error: ${error.message}`);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = originalText;
  }
});
