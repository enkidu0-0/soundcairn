# Soundcairn for Android

A plain Android app (no Capacitor): a WebView showing the shared page from `../desktop/app`, plus a small Kotlin bridge that runs yt-dlp
and ffmpeg on the phone with [youtubedl-android](https://github.com/yausername/youtubedl-android).

```bash
./build-www.sh                                         # copies the page from ../desktop into the app assets
export JAVA_HOME=/path/to/jdk17 ANDROID_HOME=/path/to/android-sdk
./gradlew assembleDebug                                # app/build/outputs/apk/debug/app-debug.apk
```

Android 10 or newer, arm64 phones. Files are saved in the app's Music folder; the three-dots menu copies a file to `Download/Soundcairn`.

## License

Because it uses youtubedl-android (GPL-3.0), this folder is licensed under the **GNU GPL v3**, see `LICENSE` here.
The rest of the repository is MIT.
