package com.audioplayer.bpm

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class BpmAnalyzerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val cache = BpmCache(reactContext.applicationContext)
    private val analyzer = BpmAnalyzer(cache)

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun analyzeBpm(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val bpm = analyzer.analyze(filePath)
                promise.resolve(bpm)
            } catch (e: BpmAnalysisException) {
                promise.reject(ERROR_ANALYSIS, e.message, e)
            } catch (e: Exception) {
                promise.reject(ERROR_UNKNOWN, "BPM analysis failed: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun getCachedBpm(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val fileHash = FileHasher.computeSha256(filePath)
                val cached = cache.get(fileHash)
                if (cached != null) {
                    promise.resolve(cached)
                } else {
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                promise.reject(ERROR_CACHE, "Cache lookup failed: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun clearBpmCache(promise: Promise) {
        try {
            cache.clear()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject(ERROR_CACHE, "Failed to clear BPM cache: ${e.message}", e)
        }
    }

    @ReactMethod
    fun removeCachedBpm(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val fileHash = FileHasher.computeSha256(filePath)
                cache.remove(fileHash)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject(ERROR_CACHE, "Failed to remove cached BPM: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun getCacheSize(promise: Promise) {
        try {
            promise.resolve(cache.size)
        } catch (e: Exception) {
            promise.reject(ERROR_CACHE, "Failed to get cache size: ${e.message}", e)
        }
    }

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }

    companion object {
        const val MODULE_NAME = "BpmAnalyzerModule"
        private const val ERROR_ANALYSIS = "E_BPM_ANALYSIS"
        private const val ERROR_CACHE = "E_BPM_CACHE"
        private const val ERROR_UNKNOWN = "E_BPM_UNKNOWN"
    }
}
