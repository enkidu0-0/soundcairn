const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const { pathToFileURL } = require("url");
const { buildArgs, parseLine, makeProgress, toPreview, cleanTitle, lastError } = require("./lib");

let win;
const jobs = new Map();
let seq = 0;

const toolsDir = () => path.join(app.getPath("userData"), "bin");
const isWin = process.platform === "win32";
const searchDirs = () => isWin ? [toolsDir(), path.join(__dirname, "bin")]
  : [toolsDir(), path.join(__dirname, "bin"), path.join(os.homedir(), ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
function tool(name) {
  if (name === "yt-dlp" && process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  return searchDirs().map(d => path.join(d, name + (isWin ? ".exe" : ""))).find(p => fs.existsSync(p));
}
// A Finder-launched app has a bare PATH, yt-dlp needs to find ffmpeg and ffprobe on it.
const toolEnv = () => ({ ...process.env, PATH: searchDirs().join(path.delimiter) + path.delimiter + (process.env.PATH || "") });

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch { return {}; }
}
const saveFolder = () => readSettings().folder || path.join(os.homedir(), "Music", "Soundcairn");

const send = msg => win && !win.isDestroyed() && win.webContents.send("dl", msg);

ipcMain.handle("tools", () => ({
  ytdlp: !!tool("yt-dlp"), ffmpeg: !!tool("ffmpeg"), ffprobe: !!tool("ffprobe"), toolsDir: toolsDir(), folder: saveFolder(), canInstall: isWin, platform: process.platform,
}));

// Windows build ships without the tools, so the first run fetches them from their official release pages.
const WIN_TOOLS = [
  { url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", file: "yt-dlp.exe" },
  { url: "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip", zip: ["ffmpeg.exe", "ffprobe.exe"] },
  { url: "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip", zip: ["deno.exe"] },
];
async function fetchTo(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
ipcMain.handle("installTools", async () => {
  if (!isWin) return { error: "Automatic install is only for Windows. Put the tools in the folder shown in Settings." };
  try {
    const dir = toolsDir();
    fs.mkdirSync(dir, { recursive: true });
    for (const t of WIN_TOOLS) {
      const target = path.join(dir, t.file || "tools.zip");
      await fetchTo(t.url, target);
      if (!t.zip) continue;
      const out = path.join(dir, "unzipped");
      await new Promise((ok, no) => execFile("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${target}' -DestinationPath '${out}'`], e => e ? no(e) : ok()));
      for (const name of t.zip) {
        const hit = require("child_process").execFileSync("powershell", ["-NoProfile", "-Command", `(Get-ChildItem -Recurse -Path '${out}' -Filter ${name} | Select-Object -First 1).FullName`], { encoding: "utf8" }).trim();
        fs.copyFileSync(hit, path.join(dir, name));
      }
      fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(target, { force: true });
    }
    return {};
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("probe", (_, url) => new Promise(resolve => {
  if (!/^https?:\/\//i.test(url)) return resolve({ error: "That doesn't look like a link. It should start with http." });
  const yt = tool("yt-dlp");
  if (!yt) return resolve({ error: "yt-dlp is missing. See Settings." });
  execFile(yt, ["-J", "--no-playlist", "--no-warnings", "--", url], { env: toolEnv(), maxBuffer: 64e6, timeout: 60000 }, (err, stdout, stderr) => {
    if (err) return resolve({ error: lastError(stderr || err.message) });
    try { resolve(toPreview(JSON.parse(stdout), url)); } catch { resolve({ error: "Could not read that link." }); }
  });
}));

function launch(id) {
  const j = jobs.get(id), yt = tool("yt-dlp");
  const proc = spawn(yt, buildArgs(j.opts), { env: toolEnv() });
  j.proc = proc; j.stopped = false;
  let buf = "", err = "";
  const onLine = line => {
    const m = parseLine(line);
    if (!m) return;
    if (m.type === "file") j.file = m.path;
    else send({ id, type: "progress", ...j.progress(m) });
  };
  proc.stdout.on("data", d => { const parts = (buf + d).split(/\r?\n|\r/); buf = parts.pop(); parts.forEach(onLine); });
  proc.stderr.on("data", d => { err += d; });
  proc.on("error", e => send({ id, type: "error", message: e.message }));
  proc.on("close", code => {
    if (j.proc !== proc || j.stopped) return;
    if (code === 0 && j.file) send({ id, type: "done", path: j.file });
    else send({ id, type: "error", message: lastError(err) });
  });
}

ipcMain.handle("start", (_, o) => {
  if (!tool("yt-dlp")) return { error: "yt-dlp is missing. See Settings." };
  if (!/^https?:\/\//i.test(o.url)) return { error: "That doesn't look like a link." };
  const folder = saveFolder();
  fs.mkdirSync(folder, { recursive: true });
  const id = ++seq;
  jobs.set(id, { opts: { url: o.url, mode: o.mode, quality: o.quality, cover: o.cover, folder }, progress: makeProgress(o.expected || 0) });
  launch(id);
  return { id };
});

function stop(id) {
  const j = jobs.get(id);
  if (!j) return;
  j.stopped = true;
  j.proc.kill("SIGTERM");
}
ipcMain.handle("pause", (_, id) => stop(id));
// shortcut: resuming a video after its first stream finished restarts the progress count, fine until progress is stored per stream.
ipcMain.handle("resume", (_, id) => { if (jobs.has(id)) launch(id); });
ipcMain.handle("cancel", (_, id) => { stop(id); jobs.delete(id); });

const MEDIA = new Set([".mp3", ".m4a", ".mp4", ".webm", ".mkv", ".opus", ".ogg", ".wav", ".flac"]);
const VIDEO = new Set([".mp4", ".webm", ".mkv"]);
ipcMain.handle("library", () => {
  const folder = saveFolder();
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter(f => !f.startsWith(".") && MEDIA.has(path.extname(f).toLowerCase()))
    .map(f => {
      const full = path.join(folder, f), st = fs.statSync(full), cover = full.slice(0, -path.extname(f).length) + ".jpg";
      return {
        path: full, url: pathToFileURL(full).href, title: cleanTitle(f), size: st.size, mtime: st.mtimeMs,
        kind: VIDEO.has(path.extname(f).toLowerCase()) ? "video" : "audio",
        thumb: fs.existsSync(cover) ? pathToFileURL(cover).href : "",
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle("pickFolder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
  if (r.canceled) return saveFolder();
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), folder: r.filePaths[0] }));
  return r.filePaths[0];
});
ipcMain.handle("openFolder", () => { const f = saveFolder(); fs.mkdirSync(f, { recursive: true }); return shell.openPath(f); });
ipcMain.handle("reveal", (_, file) => { if (file && fs.existsSync(file)) shell.showItemInFolder(file); else shell.openPath(saveFolder()); });
ipcMain.handle("openToolsFolder", () => { fs.mkdirSync(toolsDir(), { recursive: true }); return shell.openPath(toolsDir()); });

app.whenReady().then(() => {
  // The page is light only, so keep the window frame light even when the system is in dark mode.
  nativeTheme.themeSource = "light";
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 380, minHeight: 640, backgroundColor: "#FDF5FC", title: "Soundcairn", icon: path.join(__dirname, "build", "icon.png"),
    // No native title bar: the page draws its own, so the top matches the app colour.
    ...(process.platform === "darwin" && { titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 14 } }),
    ...(process.platform === "win32" && { titleBarStyle: "hidden", titleBarOverlay: { color: "#FDF5FC", symbolColor: "#2B0828", height: 36 } }),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "app", "index.html"));
});

app.on("before-quit", () => jobs.forEach((_, id) => stop(id)));
app.on("window-all-closed", () => app.quit());
