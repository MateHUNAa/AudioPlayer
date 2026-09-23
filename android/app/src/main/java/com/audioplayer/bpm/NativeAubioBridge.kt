package com.audioplayer.bpm

object NativeAubioBridge {

    init {
        System.loadLibrary("aubio_jni")
    }

    @JvmStatic
    external fun nativeCreateTempoDetector(bufSize: Int, hopSize: Int, sampleRate: Int): Long

    @JvmStatic
    external fun nativeProcessFrame(handle: Long, buffer: FloatArray, length: Int): Float

    @JvmStatic
    external fun nativeGetBpm(handle: Long): Float

    @JvmStatic
    external fun nativeGetTotalBeats(handle: Long): Int

    @JvmStatic
    external fun nativeDestroyTempoDetector(handle: Long)
}
