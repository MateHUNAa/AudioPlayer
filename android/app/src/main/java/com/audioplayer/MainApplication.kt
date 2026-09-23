package com.audioplayer

import android.app.Application
import android.os.Environment
import com.audioplayer.bpm.BpmAnalyzerPackage
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.util.Date

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(BpmAnalyzerPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    installCrashLogger()
    loadReactNative(this)
  }

  /** Appends native crashes to Documents/AudioPlayer/native-crash-log.txt so they can be diagnosed later. */
  private fun installCrashLogger() {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val dir = File(Environment.getExternalStorageDirectory(), "Documents/AudioPlayer")
        dir.mkdirs()
        val log = File(dir, "native-crash-log.txt")
        if (log.length() > 256 * 1024) log.delete()
        val trace = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
        log.appendText("[${Date()}] thread=${thread.name}\n$trace\n")
      } catch (_: Throwable) {
      }
      previous?.uncaughtException(thread, error)
    }
  }
}
