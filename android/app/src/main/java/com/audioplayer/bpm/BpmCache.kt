package com.audioplayer.bpm

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

class BpmCache(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun get(fileHash: String): Double? {
        if (!prefs.contains(fileHash)) return null
        val stored = prefs.getFloat(fileHash, Float.MIN_VALUE)
        if (stored == Float.MIN_VALUE) return null
        return stored.toDouble()
    }

    @Synchronized
    fun put(fileHash: String, bpm: Double) {
        prefs.edit { putFloat(fileHash, bpm.toFloat()) }
    }

    @Synchronized
    fun has(fileHash: String): Boolean = prefs.contains(fileHash)

    @Synchronized
    fun remove(fileHash: String) {
        prefs.edit { remove(fileHash) }
    }

    @Synchronized
    fun clear() {
        prefs.edit { clear() }
    }

    val size: Int
        @Synchronized get() = prefs.all.size

    companion object {
        private const val PREFS_NAME = "com.audioplayer.bpm_cache"
    }
}
