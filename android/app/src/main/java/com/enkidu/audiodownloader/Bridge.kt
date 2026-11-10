package com.enkidu.audiodownloader

import android.app.Activity
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Intent
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URLConnection
import java.util.concurrent.Executors

// The page calls these methods; results come back by calling window.__line / __done / __reveal.
class Bridge(private val act: Activity, private val web: WebView) {
    private val pool = Executors.newCachedThreadPool()
    private val folder = File(act.getExternalFilesDir(Environment.DIRECTORY_MUSIC), "Soundcairn").apply { mkdirs() }
    private val ready = pool.submit {
        YoutubeDL.getInstance().init(act.applicationContext)
        FFmpeg.getInstance().init(act.applicationContext)
    }

    init {
        // YouTube changes often, so fetch the newest yt-dlp in the background after startup.
        pool.submit {
            try {
                ready.get()
                YoutubeDL.getInstance().updateYoutubeDL(act.applicationContext, YoutubeDL.UpdateChannel.STABLE)
            } catch (_: Exception) {}
        }
    }

    private fun js(code: String) = act.runOnUiThread { web.evaluateJavascript(code, null) }
    private fun q(s: String) = JSONObject.quote(s)

    @JavascriptInterface
    fun folder(): String = folder.absolutePath

    @JavascriptInterface
    fun exec(id: String, argsJson: String) {
        val a = JSONArray(argsJson)
        val args = List(a.length()) { a.getString(it) }
        pool.submit {
            try {
                ready.get()
                val request = YoutubeDLRequest(emptyList<String>()).addCommands(args)
                val response = YoutubeDL.getInstance().execute(request, id) { _, _, line -> js("window.__line(${q(id)},${q(line)})") }
                js("window.__done(${q(id)},null,${q(response.out)})")
            } catch (e: Exception) {
                js("window.__done(${q(id)},${q(e.message ?: "Download failed")},null)")
            }
        }
    }

    @JavascriptInterface
    fun cancel(id: String) { YoutubeDL.getInstance().destroyProcessById(id) }

    @JavascriptInterface
    fun library(): String {
        val media = setOf("mp3", "m4a", "mp4", "webm", "mkv", "opus", "ogg", "wav", "flac")
        val items = JSONArray()
        folder.listFiles()?.filter { it.isFile && !it.name.startsWith(".") && it.extension.lowercase() in media }
            ?.sortedByDescending { it.lastModified() }
            ?.forEach {
                val cover = File(it.parentFile, it.nameWithoutExtension + ".jpg")
                items.put(JSONObject()
                    .put("path", it.absolutePath).put("size", it.length()).put("mtime", it.lastModified())
                    .put("kind", if (it.extension.lowercase() in setOf("mp4", "webm", "mkv")) "video" else "audio")
                    .put("thumb", if (cover.exists()) cover.absolutePath else ""))
            }
        return items.toString()
    }

    // App storage is hidden from file managers on new Android, so "show in file manager" copies the file to Downloads and opens it.
    @JavascriptInterface
    fun reveal(id: String, path: String) {
        pool.submit {
            var message = "Opened Downloads"
            try {
                if (path.isNotEmpty()) {
                    val f = File(path)
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, f.name)
                        put(MediaStore.Downloads.MIME_TYPE, URLConnection.guessContentTypeFromName(f.name) ?: "application/octet-stream")
                        put(MediaStore.Downloads.RELATIVE_PATH, "Download/Soundcairn")
                    }
                    val uri = act.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    if (uri != null) act.contentResolver.openOutputStream(uri)?.use { out -> f.inputStream().use { it.copyTo(out) } }
                    message = "Saved in Download/Soundcairn"
                }
                act.startActivity(Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: Exception) { message = e.message ?: "Could not open Downloads" }
            js("window.__reveal(${q(id)},${q(message)})")
        }
    }
}
