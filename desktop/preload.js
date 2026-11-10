const { contextBridge, ipcRenderer } = require("electron");

const call = name => (...a) => ipcRenderer.invoke(name, ...a);

contextBridge.exposeInMainWorld("api", {
  tools: call("tools"), installTools: call("installTools"), probe: call("probe"), start: call("start"),
  pause: call("pause"), resume: call("resume"), cancel: call("cancel"),
  library: call("library"), pickFolder: call("pickFolder"), openFolder: call("openFolder"), openToolsFolder: call("openToolsFolder"), reveal: call("reveal"),
  onDownload: cb => ipcRenderer.on("dl", (_, m) => cb(m)),
});
