package com.audioplayer.analysis

import com.audioplayer.bpm.AudioDecoder
import com.audioplayer.bpm.NativeAubioBridge
import java.util.concurrent.CancellationException

data class TrackAnalysisResult(
    val bpm: Double,
    val bpmSource: String,
    val features: Features,
    val durationSec: Double,
    val windowStartSec: Double
)

class TrackAnalysisException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Decodes (part of) a file once and feeds the samples to both aubio's tempo tracker and the
 * [FeatureExtractor]. Songs longer than [FULL_TRACK_MAX_SEC] are analyzed on a 2-minute window
 * around the middle, which keeps phone analysis ~3x faster with negligible accuracy loss.
 */
object TrackAnalyzer {
    private const val FULL_TRACK_MAX_SEC = 150.0
    private const val WINDOW_SEC = 120.0
    private const val MIN_ANALYZED_SEC = 5.0

    @Volatile
    private var aubioAvailable: Boolean? = null

    fun analyze(path: String, isCancelled: () -> Boolean): TrackAnalysisResult {
        val decoder = AudioDecoder(path)
        var tempo: AubioTempo? = null
        try {
            decoder.initialize()
            val durationSec = decoder.format.durationUs / 1_000_000.0
            val startSec = if (durationSec > FULL_TRACK_MAX_SEC) durationSec / 2 - WINDOW_SEC / 2 else 0.0
            val limitSec = if (durationSec > FULL_TRACK_MAX_SEC) WINDOW_SEC else FULL_TRACK_MAX_SEC
            decoder.seekTo((startSec * 1_000_000).toLong())

            var extractor: FeatureExtractor? = null
            var limitSamples = Long.MAX_VALUE

            decoder.decodeChunks { chunk ->
                if (isCancelled()) throw CancellationException("Analysis cancelled")
                val fx = extractor ?: run {
                    // The real output rate is only known once the codec has produced audio.
                    val rate = decoder.format.sampleRate
                    limitSamples = (limitSec * rate).toLong()
                    tempo = AubioTempo.create(rate)
                    FeatureExtractor(rate).also { extractor = it }
                }
                val remaining = limitSamples - fx.samplesSeen
                val length = if (chunk.size > remaining) remaining.toInt() else chunk.size
                fx.push(chunk, length)
                tempo?.push(chunk, length)
                fx.samplesSeen < limitSamples
            }

            val fx = extractor ?: throw TrackAnalysisException("No audio decoded")
            val features = fx.finish()
            if (features.analyzedSeconds < MIN_ANALYZED_SEC) {
                throw TrackAnalysisException("Audio too short to analyze")
            }

            val aubioBpm = tempo?.finish() ?: 0.0
            val (bpm, source) = when {
                aubioBpm > 0 -> foldBpm(aubioBpm) to "aubio"
                features.fallbackBpm > 0 -> foldBpm(features.fallbackBpm) to "envelope"
                else -> 0.0 to "none"
            }

            return TrackAnalysisResult(
                bpm = Math.round(bpm * 2) / 2.0,
                bpmSource = source,
                features = features,
                durationSec = if (durationSec > 0) durationSec else features.analyzedSeconds,
                windowStartSec = startSec
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: TrackAnalysisException) {
            throw e
        } catch (e: Throwable) {
            throw TrackAnalysisException(e.message ?: e.javaClass.simpleName, e)
        } finally {
            tempo?.close()
            decoder.close()
        }
    }

    /** Keeps tempos in the 70-180 range the desktop analyzer reports, halving/doubling as needed. */
    private fun foldBpm(bpm: Double): Double {
        var b = bpm
        while (b > 180) b /= 2
        while (b > 0 && b < 70) b *= 2
        return b
    }

    private class AubioTempo private constructor(private val handle: Long, private val hop: Int) {
        private val staging = FloatArray(hop * 16)
        private var filled = 0

        fun push(chunk: FloatArray, length: Int) {
            var offset = 0
            while (offset < length) {
                val n = minOf(staging.size - filled, length - offset)
                System.arraycopy(chunk, offset, staging, filled, n)
                filled += n
                offset += n
                if (filled == staging.size) flush()
            }
        }

        private fun flush() {
            val usable = (filled / hop) * hop
            if (usable > 0) NativeAubioBridge.nativeProcessFrame(handle, staging, usable)
            val rest = filled - usable
            if (rest > 0) System.arraycopy(staging, usable, staging, 0, rest)
            filled = rest
        }

        fun finish(): Double {
            flush()
            val bpm = NativeAubioBridge.nativeGetBpm(handle).toDouble()
            val beats = NativeAubioBridge.nativeGetTotalBeats(handle)
            return if (bpm > 0 && beats >= 2) bpm else 0.0
        }

        fun close() = NativeAubioBridge.nativeDestroyTempoDetector(handle)

        companion object {
            fun create(sampleRate: Int): AubioTempo? {
                if (TrackAnalyzer.aubioAvailable == false) return null
                return try {
                    val hop = when {
                        sampleRate >= 88200 -> 2048
                        sampleRate >= 44100 -> 1024
                        else -> 512
                    }
                    val handle = NativeAubioBridge.nativeCreateTempoDetector(hop * 2, hop, sampleRate)
                    TrackAnalyzer.aubioAvailable = true
                    if (handle != 0L) AubioTempo(handle, hop) else null
                } catch (t: Throwable) {
                    // Missing .so for this ABI: fall back to the envelope tempo estimate.
                    TrackAnalyzer.aubioAvailable = false
                    null
                }
            }
        }
    }
}
