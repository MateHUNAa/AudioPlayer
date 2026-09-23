package com.audioplayer.analysis

import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.joinAll
import java.util.concurrent.CancellationException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class AudioAnalyzerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    // Low-priority threads so analysis never competes with playback or the UI.
    private val dispatcher = Executors.newFixedThreadPool(WORKERS) { runnable ->
        Thread({
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND)
            runnable.run()
        }, "audio-analyzer").apply { isDaemon = true }
    }.asCoroutineDispatcher()
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    private var batchJob: Job? = null
    private var batchCancelled = AtomicBoolean(false)

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun analyzeTrack(path: String, promise: Promise) {
        scope.launch {
            try {
                promise.resolve(toMap(TrackAnalyzer.analyze(path) { false }))
            } catch (e: Throwable) {
                promise.reject(ERROR_ANALYSIS, e.message ?: "Analysis failed", e)
            }
        }
    }

    /**
     * Analyzes every job in the background, emitting [EVENT_RESULT] per track and [EVENT_DONE]
     * at the end. Starting a new batch cancels the previous one.
     */
    @ReactMethod
    fun startBatch(jobs: ReadableArray, promise: Promise) {
        cancelRunningBatch()
        val items = ArrayList<Pair<String, String>>(jobs.size())
        for (i in 0 until jobs.size()) {
            val job = jobs.getMap(i) ?: continue
            val id = job.getString("id") ?: continue
            val path = job.getString("path") ?: continue
            items.add(id to path)
        }

        val cancelled = AtomicBoolean(false)
        batchCancelled = cancelled
        val processed = AtomicInteger(0)
        val failed = AtomicInteger(0)
        val permits = Semaphore(WORKERS)

        batchJob = scope.launch {
            items.map { (id, path) ->
                launch {
                    permits.withPermit {
                        if (cancelled.get()) return@withPermit
                        val event = Arguments.createMap()
                        event.putString("id", id)
                        event.putString("path", path)
                        try {
                            event.putMap("result", toMap(TrackAnalyzer.analyze(path) { cancelled.get() }))
                            processed.incrementAndGet()
                        } catch (e: CancellationException) {
                            return@withPermit
                        } catch (e: Throwable) {
                            failed.incrementAndGet()
                            event.putString("error", e.message ?: "Analysis failed")
                        }
                        if (!cancelled.get()) emit(EVENT_RESULT, event)
                    }
                }
            }.joinAll()

            val done = Arguments.createMap()
            done.putInt("processed", processed.get())
            done.putInt("failed", failed.get())
            done.putBoolean("cancelled", cancelled.get())
            emit(EVENT_DONE, done)
        }
        promise.resolve(items.size)
    }

    @ReactMethod
    fun cancelBatch(promise: Promise) {
        cancelRunningBatch()
        promise.resolve(null)
    }

    private fun cancelRunningBatch() {
        batchCancelled.set(true)
        batchJob = null
    }

    /**
     * Null-safe replacement for react-native-music-metadata, which throws (and crashes the app)
     * on files with a missing duration or characters Uri.parse mangles, like '#', '?' or '%'.
     */
    @ReactMethod
    fun readMetadata(paths: ReadableArray, promise: Promise) {
        val list = ArrayList<String>(paths.size())
        for (i in 0 until paths.size()) paths.getString(i)?.let { list.add(it) }
        scope.launch {
            val out = Arguments.createArray()
            for (path in list) out.pushMap(readOne(path))
            promise.resolve(out)
        }
    }

    private fun readOne(path: String): WritableMap {
        val map = Arguments.createMap()
        map.putString("uri", path)
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(path)
            fun put(key: String, field: Int) {
                val value = retriever.extractMetadata(field)?.trim()
                if (!value.isNullOrEmpty()) map.putString(key, value)
            }
            put("title", MediaMetadataRetriever.METADATA_KEY_TITLE)
            put("artist", MediaMetadataRetriever.METADATA_KEY_ARTIST)
            put("albumName", MediaMetadataRetriever.METADATA_KEY_ALBUM)
            put("albumArtist", MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST)
            put("genre", MediaMetadataRetriever.METADATA_KEY_GENRE)
            put("year", MediaMetadataRetriever.METADATA_KEY_YEAR)
            put("trackNumber", MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER)
            put("bitrate", MediaMetadataRetriever.METADATA_KEY_BITRATE)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toDoubleOrNull()
                ?.let { map.putDouble("duration", it / 1000.0) }
        } catch (e: Throwable) {
            map.putString("error", e.message ?: "Unreadable file")
        } finally {
            try {
                retriever.release()
            } catch (_: Throwable) { }
        }
        return map
    }

    @ReactMethod
    fun hasAllFilesAccess(promise: Promise) {
        promise.resolve(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Environment.isExternalStorageManager() else true
        )
    }

    /** Opens the system screen where the user can allow "All files access" (needed to read the backup after a reinstall). */
    @ReactMethod
    fun requestAllFilesAccess(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(true)
            return
        }
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:${reactApplicationContext.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(false)
        } catch (e: Throwable) {
            try {
                reactApplicationContext.startActivity(
                    Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
                promise.resolve(false)
            } catch (inner: Throwable) {
                promise.reject(ERROR_PERMISSION, inner.message ?: "Cannot open settings", inner)
            }
        }
    }

    // Required by NativeEventEmitter on Android.
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    private fun emit(event: String, payload: WritableMap) {
        val ctx = reactApplicationContext
        if (ctx.hasActiveReactInstance()) {
            ctx.emitDeviceEvent(event, payload)
        }
    }

    private fun toMap(result: TrackAnalysisResult): WritableMap {
        val f = result.features
        return Arguments.createMap().apply {
            putDouble("bpm", result.bpm)
            putString("bpmSource", result.bpmSource)
            putString("key", f.key)
            putString("scale", f.scale)
            putDouble("keyStrength", f.keyStrength)
            putDouble("rmsDb", f.rmsDb)
            putDouble("peakDb", f.peakDb)
            putDouble("drDb", f.drDb)
            putDouble("centroid", f.centroid)
            putDouble("bandLow", f.bandLow)
            putDouble("bandMid", f.bandMid)
            putDouble("bandHigh", f.bandHigh)
            putDouble("danceability", f.danceability)
            putDouble("analyzedSeconds", f.analyzedSeconds)
            putDouble("duration", result.durationSec)
            putDouble("windowStart", result.windowStartSec)
        }
    }

    override fun invalidate() {
        cancelRunningBatch()
        scope.cancel()
        dispatcher.close()
        super.invalidate()
    }

    companion object {
        const val MODULE_NAME = "AudioAnalyzerModule"
        const val EVENT_RESULT = "AudioAnalyzer:result"
        const val EVENT_DONE = "AudioAnalyzer:done"
        private const val WORKERS = 2
        private const val ERROR_ANALYSIS = "E_ANALYSIS"
        private const val ERROR_PERMISSION = "E_PERMISSION"
    }
}
