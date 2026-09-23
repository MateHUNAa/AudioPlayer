package com.audioplayer.bpm

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap

class BpmAnalysisException(message: String, cause: Throwable? = null) : Exception(message, cause)

class BpmAnalyzer(private val cache: BpmCache) {

    private val inflightMutex = Mutex()
    private val inflight = ConcurrentHashMap<String, CompletableDeferred<Double>>()

    suspend fun analyze(filePath: String): Double = withContext(Dispatchers.Default) {
        val fileHash = try {
            FileHasher.computeSha256(filePath)
        } catch (e: Exception) {
            throw BpmAnalysisException("Failed to hash file: ${e.message}", e)
        }

        val cached = cache.get(fileHash)
        if (cached != null) return@withContext cached

        val existingDeferred = inflight[fileHash]
        if (existingDeferred != null) {
            return@withContext existingDeferred.await()
        }

        val deferred = CompletableDeferred<Double>()
        val isOwner: Boolean

        inflightMutex.withLock {
            val raceCheck = inflight[fileHash]
            if (raceCheck != null) {
                isOwner = false
                deferred.complete(0.0)
                return@withContext raceCheck.await()
            }
            inflight[fileHash] = deferred
            isOwner = true
        }

        if (!isOwner) {
            return@withContext deferred.await()
        }

        try {
            val bpm = performAnalysis(filePath)
            cache.put(fileHash, bpm)
            deferred.complete(bpm)
            bpm
        } catch (e: Exception) {
            deferred.completeExceptionally(e)
            throw e
        } finally {
            inflight.remove(fileHash)
        }
    }

    private fun performAnalysis(filePath: String): Double {
        val decoder = AudioDecoder(filePath)
        var handle = 0L

        try {
            decoder.initialize()
            val fmt = decoder.format

            val hopSize = selectHopSize(fmt.sampleRate)
            val bufSize = hopSize * 2
            handle = NativeAubioBridge.nativeCreateTempoDetector(bufSize, hopSize, fmt.sampleRate)
            if (handle == 0L) {
                throw BpmAnalysisException("Failed to create aubio tempo detector")
            }

            var residualBuffer = FloatArray(0)
            var totalSamplesProcessed = 0L

            decoder.decodeChunks { chunk ->
                val combined = if (residualBuffer.isNotEmpty()) {
                    FloatArray(residualBuffer.size + chunk.size).also {
                        residualBuffer.copyInto(it)
                        chunk.copyInto(it, residualBuffer.size)
                    }
                } else {
                    chunk
                }

                val usableLength = (combined.size / hopSize) * hopSize
                if (usableLength > 0) {
                    val frameBuffer = if (usableLength == combined.size) {
                        combined
                    } else {
                        combined.copyOf(usableLength)
                    }
                    NativeAubioBridge.nativeProcessFrame(handle, frameBuffer, usableLength)
                    totalSamplesProcessed += usableLength
                }

                residualBuffer = if (usableLength < combined.size) {
                    combined.copyOfRange(usableLength, combined.size)
                } else {
                    FloatArray(0)
                }
                true
            }

            if (residualBuffer.isNotEmpty()) {
                val padded = FloatArray(hopSize)
                residualBuffer.copyInto(padded)
                NativeAubioBridge.nativeProcessFrame(handle, padded, hopSize)
                totalSamplesProcessed += hopSize
            }

            val bpm = NativeAubioBridge.nativeGetBpm(handle).toDouble()
            val totalBeats = NativeAubioBridge.nativeGetTotalBeats(handle)

            if (bpm <= 0.0 || totalBeats < MIN_BEATS_THRESHOLD) {
                val fmt2 = decoder.format
                val durationSec = if (fmt2.durationUs > 0) {
                    fmt2.durationUs / 1_000_000.0
                } else {
                    totalSamplesProcessed.toDouble() / fmt2.sampleRate
                }

                if (durationSec < MIN_DURATION_SECONDS) {
                    throw BpmAnalysisException(
                        "Audio too short for reliable BPM detection (${String.format("%.1f", durationSec)}s)"
                    )
                }

                return 0.0
            }

            return clampBpm(bpm)
        } catch (e: BpmAnalysisException) {
            throw e
        } catch (e: AudioDecoderException) {
            throw BpmAnalysisException("Decoding failed: ${e.message}", e)
        } catch (e: Exception) {
            throw BpmAnalysisException("BPM analysis failed: ${e.message}", e)
        } finally {
            if (handle != 0L) {
                NativeAubioBridge.nativeDestroyTempoDetector(handle)
            }
            decoder.close()
        }
    }

    companion object {
        private const val MIN_BEATS_THRESHOLD = 2
        private const val MIN_DURATION_SECONDS = 1.0
        private const val BPM_FLOOR = 30.0
        private const val BPM_CEILING = 300.0

        private fun selectHopSize(sampleRate: Int): Int = when {
            sampleRate >= 88200 -> 2048
            sampleRate >= 44100 -> 1024
            else -> 512
        }

        private fun clampBpm(bpm: Double): Double {
            if (bpm <= 0.0) return 0.0
            var result = bpm
            while (result > BPM_CEILING) result /= 2.0
            while (result < BPM_FLOOR) result *= 2.0
            return if (result in BPM_FLOOR..BPM_CEILING) {
                Math.round(result * 10.0) / 10.0
            } else {
                0.0
            }
        }
    }
}
