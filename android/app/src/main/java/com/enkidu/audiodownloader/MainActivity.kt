package com.enkidu.audiodownloader

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.webkit.WebResourceRequest
import android.webkit.WebViewClient
import android.widget.Toast
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import android.app.Activity
import androidx.core.view.WindowCompat

class MainActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val bg = Color.parseColor("#FDF5FC")
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true
        web = WebView(this).apply {
            setBackgroundColor(bg)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // The page is a local file and plays local media files, so it needs file access.
            settings.allowFileAccess = true
            @Suppress("DEPRECATION") settings.allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION") settings.allowUniversalAccessFromFileURLs = true
            // The chai button links to upi://, which the WebView cannot open by itself.
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.scheme != "upi") return false
                    try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                    catch (e: ActivityNotFoundException) { Toast.makeText(this@MainActivity, "No UPI app found", Toast.LENGTH_LONG).show() }
                    return true
                }
            }
            addJavascriptInterface(Bridge(this@MainActivity, this), "Native")
            loadUrl("file:///android_asset/index.html")
        }
        // Edge-to-edge is forced on Android 15, so keep the page clear of the system bars.
        val root = FrameLayout(this).apply { setBackgroundColor(bg); fitsSystemWindows = true }
        root.addView(web, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        setContentView(root)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("window.__back && window.__back()") { handled -> if (handled != "true") finish() }
    }
}
