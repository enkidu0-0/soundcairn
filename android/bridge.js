// Android only: gives the page the same `api` the desktop app gets from preload.js, backed by the Kotlin Bridge.
(function () {
  if (window.api || !window.Native) return;
  document.documentElement.classList.add("android");
  const waits = new Map(), lines = new Map(), reveals = new Map(), jobs = new Map();
  let n = 0, seq = 0, listener = () => {};
  window.__line = (id, line) => { const h = lines.get(id); if (h) h(line); };
  window.__done = (id, err, out) => {
    const w = waits.get(id); if (!w) return;
    waits.delete(id); lines.delete(id);
    err ? w.reject(new Error(err)) : w.resolve(out || "");
  };
  window.__reveal = (id, message) => { const r = reveals.get(id); reveals.delete(id); if (r) r({ message }); };
  const exec = (id, args, onLine) => new Promise((resolve, reject) => {
    waits.set(id, { resolve, reject }); if (onLine) lines.set(id, onLine);
    Native.exec(id, JSON.stringify(args));
  });
  const folder = Native.folder();

  function launch(jobId) {
    const j = jobs.get(jobId), pid = jobId + "-" + ++n;
    j.pid = pid; j.stopped = false;
    const gone = () => j.pid !== pid || j.stopped;
    exec(pid, lib.buildArgs(j.opts), line => {
      const m = lib.parseLine(line);
      if (!m) return;
      if (m.type === "file") j.file = m.path; else listener({ id: jobId, type: "progress", ...j.progress(m) });
    }).then(out => {
      if (gone()) return;
      out.split("\n").forEach(l => { const m = lib.parseLine(l); if (m && m.type === "file") j.file = m.path; });
      j.file ? listener({ id: jobId, type: "done", path: j.file }) : listener({ id: jobId, type: "error", message: "Download failed" });
    }).catch(e => { if (!gone()) listener({ id: jobId, type: "error", message: lib.lastError(String(e.message || e)) }); });
  }
  const stop = id => { const j = jobs.get(id); if (j) { j.stopped = true; Native.cancel(j.pid); } };

  window.api = {
    tools: async () => ({ ytdlp: true, ffmpeg: true, ffprobe: true, toolsDir: "", folder, canInstall: false, platform: "android" }),
    installTools: async () => ({}),
    probe: async url => {
      if (!/^https?:\/\//i.test(url)) return { error: "That doesn't look like a link. It should start with http." };
      try {
        const out = await exec("probe-" + ++n, ["-J", "--no-playlist", "--no-warnings", "--", url]);
        return lib.toPreview(JSON.parse(out), url);
      } catch (e) { return { error: lib.lastError(String(e.message || e)) }; }
    },
    start: async o => {
      const id = ++seq;
      jobs.set(id, { opts: { url: o.url, mode: o.mode, quality: o.quality, cover: o.cover, folder }, progress: lib.makeProgress(o.expected || 0) });
      launch(id);
      return { id };
    },
    pause: async id => stop(id),
    resume: async id => { if (jobs.has(id)) launch(id); },
    cancel: async id => { stop(id); jobs.delete(id); },
    library: async () => JSON.parse(Native.library()).map(it => ({
      ...it, title: lib.cleanTitle(it.path), url: "file://" + encodeURI(it.path), thumb: it.thumb ? "file://" + encodeURI(it.thumb) : "",
    })),
    pickFolder: async () => folder,
    openFolder: async () => {},
    openToolsFolder: async () => {},
    reveal: file => new Promise(resolve => { const id = "r" + ++n; reveals.set(id, resolve); Native.reveal(id, file || ""); }),
    onDownload: cb => { listener = cb; },
  };
})();
