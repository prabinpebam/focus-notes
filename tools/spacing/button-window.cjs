const { app, BrowserWindow } = require("electron");

app.whenReady().then(() => {
  const window = new BrowserWindow({ show: false });
  window.loadURL("about:blank");
});
app.on("window-all-closed", () => app.quit());
