const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectFile: () => ipcRenderer.invoke("select-file"),
  selectDestination: () => ipcRenderer.invoke("select-destination"),
  exportTranslation: (inputFile, outputDir, template) =>
    ipcRenderer.invoke("export-translation", inputFile, outputDir, template),
});
