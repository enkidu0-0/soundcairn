// Pure helpers for the download flow, shared by the desktop app (node) and the Android app (browser).

// A quality is a key: "h:<height>" for video, "a:<format id>" for one original audio stream, "mp3" to convert, "best" for the best m4a.
const PROGRESS = "download:P|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s";

function buildArgs({ url, mode, quality, cover, folder }) {
  const args = [
    "--no-playlist", "--no-warnings", "--newline", "--progress", "--progress-template", PROGRESS,
    "-P", folder, "-P", "temp:" + folder + "/.partial",
    "-o", "%(title)s [%(id)s].%(ext)s", "--trim-filenames", "120",
    "--print", "after_move:F|%(filepath)s",
  ];
  if (mode === "video") {
    const h = Number(quality.split(":")[1]) || 1080;
    // Up to 1080p prefer h264 + aac so the file plays on any device. Above that the sharpest stream is all there is.
    const pick = h > 1080 ? `bv*[height<=${h}]+ba/b[height<=${h}]/b` : `bv*[height<=${h}][vcodec^=avc]+ba[acodec^=mp4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`;
    args.push("-f", pick, "--merge-output-format", "mp4/mkv");
    // At the same sharpness prefer mp4, which opens in QuickTime and on phones.
    if (h > 1080) args.push("-S", "res,ext");
  } else if (quality === "mp3") {
    args.push("-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "192K");
  } else {
    const id = quality.startsWith("a:") && /^[\w.\-]+$/.test(quality.slice(2)) ? quality.slice(2) : "";
    // Without a chosen stream take m4a when it exists, it opens everywhere and opus does not.
    args.push("-f", id ? `${id}/bestaudio/best` : "bestaudio[ext=m4a]/bestaudio/best", "-x", "--audio-format", "best");
  }
  if (cover) args.push("--write-thumbnail", "--convert-thumbnails", "jpg");
  args.push("--", url);
  return args;
}

const num = v => (Number(v) > 0 ? Number(v) : 0);

function parseLine(line) {
  const f = line.trim().split("|");
  if (f[0] === "P") return { type: "progress", down: num(f[1]), total: num(f[2]) || num(f[3]), speed: num(f[4]) };
  if (f[0] === "F") return { type: "file", path: line.trim().slice(2) };
  return null;
}

// A video download is two streams (video, audio) and the byte counter restarts for the second one.
function makeProgress(expected) {
  let base = 0, last = 0;
  return p => {
    if (p.down < last) base += last;
    last = p.down;
    const got = base + p.down;
    const total = Math.max(expected, got, base + p.total);
    return { got, total, pct: total ? Math.min(0.99, got / total) : 0, speed: p.speed };
  };
}

const CODEC = { opus: "Opus", mp4a: "AAC", vorbis: "Vorbis", flac: "FLAC", alac: "ALAC", mp3: "MP3", ec: "Dolby", ac: "Dolby" };
const LOSSLESS = new Set(["flac", "alac"]);
const family = codec => Object.keys(CODEC).find(k => codec.startsWith(k)) || codec.split(".")[0];

// The real choices this video offers: every sharpness it has (8K, 4K, 2K, 1080p...) and its actual audio streams.
function estimate(info) {
  const secs = info.duration || 0, formats = info.formats || [];
  const bytes = f => f.filesize || f.filesize_approx || (f.tbr ? f.tbr * 125 * secs : 0);

  const audios = formats.filter(f => f.vcodec === "none" && f.acodec && f.acodec !== "none");
  // Dolby surround streams do not make a normal audio file, so they are not offered.
  const stereo = audios.filter(f => !/^(ec-3|ac-3|eac3|ac3)/.test(f.acodec));
  const seen = new Set(), audio = [];
  for (const f of stereo.slice().sort((a, b) => (LOSSLESS.has(family(b.acodec)) - LOSSLESS.has(family(a.acodec))) || ((b.abr || b.tbr || 0) - (a.abr || a.tbr || 0)))) {
    const fam = family(f.acodec), kbps = Math.round(f.abr || f.tbr || 0), id = fam + kbps;
    if (seen.has(id) || audio.length >= 4) continue;
    seen.add(id);
    const note = LOSSLESS.has(fam) ? "Lossless" : fam === "AAC" || fam === "mp4a" ? "Plays everywhere" : "Great quality, opens in most players";
    audio.push({ key: "a:" + f.format_id, label: `${CODEC[fam] || fam} ${kbps ? kbps + " kbps" : ""}`.trim(), note, bytes: bytes(f) || kbps * 125 * secs });
  }
  if (audio.length) audio[0].note = "Best available. " + audio[0].note;
  audio.push({ key: "mp3", label: "MP3 192 kbps", note: "Converted, plays on anything", bytes: 192 * 125 * secs });

  const videos = formats.filter(f => f.vcodec && f.vcodec !== "none" && f.height);
  const bestAudio = Math.max(0, ...audios.map(bytes));
  const heights = [...new Set(videos.map(f => f.height))].sort((a, b) => b - a);
  const shown = heights.filter(h => h >= 360);
  const video = (shown.length ? shown : heights).slice(0, 7).map(h => {
    const pick = videos.filter(f => f.height === h).sort((a, b) => bytes(b) - bytes(a))[0];
    const name = h >= 4320 ? "8K Ultra HD" : h >= 2160 ? "4K Ultra HD" : h >= 1440 ? "2K QHD" : h >= 1080 ? "Full HD" : h >= 720 ? "HD" : "Standard";
    return { key: "h:" + h, label: name, note: h + "p", height: h, bytes: bytes(pick) + (pick.acodec && pick.acodec !== "none" ? 0 : bestAudio) };
  });
  if (video.length) video[0].note += ", the best this video has";
  return { audio, video, maxHeight: heights[0] || 0, hasVideo: videos.length > 0 };
}

function toPreview(info, url) {
  const e = estimate(info);
  return {
    url: info.webpage_url || url, title: info.title || "Untitled", by: info.uploader || info.channel || "",
    secs: info.duration || 0, thumb: info.thumbnail || "",
    audio: e.audio, video: e.video, maxHeight: e.maxHeight, hasVideo: e.hasVideo,
  };
}

const cleanTitle = file => file.split(/[\\/]/).pop().replace(/\.[^.]+$/, "").replace(/\s\[[\w-]{6,}\]$/, "");

const lastError = text => {
  const lines = text.split("\n").filter(l => l.startsWith("ERROR:"));
  return (lines.pop() || text.trim().split("\n").pop() || "Download failed").replace(/^ERROR:\s*(\[[^\]]+\]\s*[\w-]+:\s*)?/, "");
};

const lib = { buildArgs, parseLine, makeProgress, estimate, toPreview, cleanTitle, lastError };
if (typeof module !== "undefined") module.exports = lib;
else window.lib = lib;
