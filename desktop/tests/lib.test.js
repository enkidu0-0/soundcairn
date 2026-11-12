const test = require("node:test");
const assert = require("node:assert");
const { buildArgs, parseLine, makeProgress, estimate, cleanTitle, lastError } = require("../lib");

test("mp3 converts and the link stays last", () => {
  const a = buildArgs({ url: "https://x.test/v", mode: "audio", quality: "mp3", cover: true, folder: "/m" });
  assert.deepStrictEqual(a.slice(-2), ["--", "https://x.test/v"]);
  assert.ok(a.includes("mp3") && a.includes("192K") && a.includes("--write-thumbnail"));
});

test("a chosen audio stream is kept as it is", () => {
  const a = buildArgs({ url: "u", mode: "audio", quality: "a:251", cover: false, folder: "/m" });
  assert.ok(a[a.indexOf("-f") + 1].startsWith("251/"));
  assert.strictEqual(a[a.indexOf("--audio-format") + 1], "best");
  assert.ok(!a.includes("mp3"));
});

test("a bad stream id falls back instead of reaching yt-dlp", () => {
  const a = buildArgs({ url: "u", mode: "audio", quality: "a:1;rm -rf", cover: false, folder: "/m" });
  assert.ok(a[a.indexOf("-f") + 1].startsWith("bestaudio[ext=m4a]"));
});

test("video caps height at the chosen sharpness", () => {
  const f = q => { const a = buildArgs({ url: "u", mode: "video", quality: q, cover: false, folder: "/m" }); return a; };
  assert.ok(f("h:1080")[f("h:1080").indexOf("-f") + 1].includes("height<=1080"));
  assert.ok(f("h:2160")[f("h:2160").indexOf("-f") + 1].includes("height<=2160"));
  assert.ok(f("h:2160").includes("res,ext") && !f("h:720").includes("res,ext"));
});

test("parseLine reads progress, file path and ignores noise", () => {
  assert.deepStrictEqual(parseLine("P|500|1000|NA|2048.5"), { type: "progress", down: 500, total: 1000, speed: 2048.5 });
  assert.strictEqual(parseLine("P|10|NA|2000|NA").total, 2000);
  assert.deepStrictEqual(parseLine("F|/m/a b [id1234567].mp3"), { type: "file", path: "/m/a b [id1234567].mp3" });
  assert.strictEqual(parseLine("[download] hello"), null);
});

test("progress keeps counting when the second stream restarts at zero", () => {
  const feed = makeProgress(200);
  assert.strictEqual(feed({ down: 100, total: 100, speed: 1 }).got, 100);
  const r = feed({ down: 20, total: 100, speed: 1 });
  assert.strictEqual(r.got, 120);
  assert.strictEqual(feed({ down: 100, total: 100, speed: 1 }).pct, 0.99);
});

test("estimate lists the sharpness and audio the video really has", () => {
  const e = estimate({ duration: 100, formats: [
    { format_id: "251", vcodec: "none", acodec: "opus", abr: 160, filesize: 1000 },
    { format_id: "140", vcodec: "none", acodec: "mp4a.40.2", abr: 128, filesize: 800 },
    { format_id: "250", vcodec: "none", acodec: "opus", abr: 70, filesize: 400 },
    { format_id: "571", vcodec: "av01", acodec: "none", height: 4320, filesize: 90000 },
    { format_id: "313", vcodec: "vp9", acodec: "none", height: 2160, filesize: 50000 },
    { format_id: "137", vcodec: "avc1", acodec: "none", height: 1080, filesize: 9000 },
    { format_id: "18", vcodec: "avc1", acodec: "mp4a", height: 360, filesize: 2000 },
  ] });
  assert.deepStrictEqual(e.video.map(v => v.label), ["8K Ultra HD", "4K Ultra HD", "Full HD", "Standard"]);
  assert.strictEqual(e.video[1].bytes, 51000);
  assert.strictEqual(e.video[3].bytes, 2000);
  assert.deepStrictEqual(e.audio.map(a => a.label), ["Opus 160 kbps", "AAC 128 kbps", "Opus 70 kbps", "MP3 192 kbps"]);
  assert.ok(e.audio[0].note.startsWith("Best available"));
  assert.strictEqual(e.audio[3].bytes, 192 * 125 * 100);
  assert.strictEqual(e.maxHeight, 4320);
});

test("dolby surround streams are not offered as audio", () => {
  const e = estimate({ duration: 10, formats: [
    { format_id: "a", vcodec: "none", acodec: "ec-3", abr: 384, filesize: 100 },
    { format_id: "b", vcodec: "none", acodec: "mp4a.40.2", abr: 128, filesize: 100 },
  ] });
  assert.deepStrictEqual(e.audio.map(a => a.label), ["AAC 128 kbps", "MP3 192 kbps"]);
});

test("a source with lossless audio lists it first", () => {
  const e = estimate({ duration: 10, formats: [
    { format_id: "m", vcodec: "none", acodec: "mp3", abr: 320, filesize: 100 },
    { format_id: "f", vcodec: "none", acodec: "flac", abr: 900, filesize: 900 },
  ] });
  assert.strictEqual(e.audio[0].label, "FLAC 900 kbps");
  assert.strictEqual(e.audio[0].note, "Best available. Lossless");
});

test("cleanTitle and lastError", () => {
  assert.strictEqual(cleanTitle("/m/The Next Chapter [dQw4w9WgXcQ].mp3"), "The Next Chapter");
  assert.strictEqual(lastError("WARNING: x\nERROR: [youtube] abc123: Video unavailable\n"), "Video unavailable");
});

test("portrait video is named by its shorter side", () => {
  const { estimate } = require("../lib");
  const v = estimate({ duration: 10, formats: [{ format_id: "v", vcodec: "avc1", acodec: "none", width: 1080, height: 1920, tbr: 2000 }] }).video[0];
  assert.equal(v.label, "Full HD");
  assert.match(v.note, /^1080p/);
});

test("a multi-video post previews its first video", () => {
  const { toPreview } = require("../lib");
  const f = [{ format_id: "v", vcodec: "avc1", acodec: "none", width: 720, height: 1280, tbr: 900 }];
  const p = toPreview({ _type: "playlist", title: "Post by x", entries: [{ title: "a", formats: f }, { title: "b", formats: f }] }, "u");
  assert.equal(p.title, "Post by x (first of 2)");
  assert.equal(p.video.length, 1);
});

test("a login-walled post gets a plain message", () => {
  const { lastError } = require("../lib");
  assert.match(lastError("ERROR: [Instagram] x: Instagram sent an empty media response. use --cookies"), /needs a login/);
});
