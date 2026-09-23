package com.audioplayer.bpm

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

class AudioDecoderException(message: String, cause: Throwable? = null) : Exception(message, cause)

data class AudioFormat(
    val sampleRate: Int,
    val channelCount: Int,
    val durationUs: Long,
    val floatPcm: Boolean = false
)

class AudioDecoder(private val filePath: String) : AutoCloseable {

    private var extractor: MediaExtractor? = null
    private var codec: MediaCodec? = null
    private var audioFormat: AudioFormat? = null
    private var isEndOfStream = false
    private var isCodecStarted = false

    val format: AudioFormat
        get() = audioFormat ?: throw AudioDecoderException("Decoder not initialized")

    fun initialize() {
        val file = File(filePath)
        if (!file.exists()) {
            throw AudioDecoderException("File not found: $filePath")
        }
        if (file.length() == 0L) {
            throw AudioDecoderException("File is empty: $filePath")
        }

        val ext = MediaExtractor()
        try {
            ext.setDataSource(filePath)
        } catch (e: Exception) {
            ext.release()
            throw AudioDecoderException("Failed to set data source: ${e.message}", e)
        }

        val trackIndex = findAudioTrack(ext)
        if (trackIndex < 0) {
            ext.release()
            throw AudioDecoderException("No audio track found in: $filePath")
        }

        ext.selectTrack(trackIndex)
        val mediaFormat = ext.getTrackFormat(trackIndex)

        val mime = mediaFormat.getString(MediaFormat.KEY_MIME)
            ?: run {
                ext.release()
                throw AudioDecoderException("No MIME type found for audio track")
            }

        val sampleRate = mediaFormat.getIntSafe(MediaFormat.KEY_SAMPLE_RATE) ?: run {
            ext.release()
            throw AudioDecoderException("No sample rate found in media format")
        }

        val channelCount = mediaFormat.getIntSafe(MediaFormat.KEY_CHANNEL_COUNT) ?: run {
            ext.release()
            throw AudioDecoderException("No channel count found in media format")
        }

        val durationUs = mediaFormat.getLongSafe(MediaFormat.KEY_DURATION) ?: 0L

        if (durationUs > 0 && durationUs < 500_000L) {
            ext.release()
            throw AudioDecoderException("Audio too short for analysis (${durationUs / 1000}ms)")
        }

        val decoder = try {
            MediaCodec.createDecoderByType(mime)
        } catch (e: Exception) {
            ext.release()
            throw AudioDecoderException("Unsupported audio format: $mime", e)
        }

        try {
            mediaFormat.setInteger(
                MediaFormat.KEY_PCM_ENCODING,
                android.media.AudioFormat.ENCODING_PCM_16BIT
            )
            decoder.configure(mediaFormat, null, null, 0)
            decoder.start()
        } catch (e: Exception) {
            decoder.release()
            ext.release()
            throw AudioDecoderException("Failed to configure decoder for $mime: ${e.message}", e)
        }

        extractor = ext
        codec = decoder
        audioFormat = AudioFormat(sampleRate, channelCount, durationUs)
        isEndOfStream = false
        isCodecStarted = true
    }

    /** Must be called after [initialize] and before [decodeChunks]. */
    fun seekTo(positionUs: Long) {
        val ext = extractor ?: throw AudioDecoderException("Decoder not initialized")
        if (positionUs > 0) {
            ext.seekTo(positionUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        }
    }

    /**
     * Decodes the stream into mono float chunks. [onChunk] returns false to stop early,
     * which lets callers analyze only part of a long file.
     */
    fun decodeChunks(onChunk: (FloatArray) -> Boolean) {
        val ext = extractor ?: throw AudioDecoderException("Decoder not initialized")
        val dec = codec ?: throw AudioDecoderException("Decoder not initialized")
        val bufferInfo = MediaCodec.BufferInfo()
        var inputDone = false
        var idleAfterInput = 0
        val timeoutUs = 10_000L

        while (!isEndOfStream) {
            if (!inputDone) {
                val inputIndex = dec.dequeueInputBuffer(timeoutUs)
                if (inputIndex >= 0) {
                    val inputBuffer = dec.getInputBuffer(inputIndex)
                    if (inputBuffer != null) {
                        val bytesRead = ext.readSampleData(inputBuffer, 0)
                        if (bytesRead < 0) {
                            dec.queueInputBuffer(
                                inputIndex, 0, 0, 0,
                                MediaCodec.BUFFER_FLAG_END_OF_STREAM
                            )
                            inputDone = true
                        } else {
                            dec.queueInputBuffer(inputIndex, 0, bytesRead, ext.sampleTime, 0)
                            ext.advance()
                        }
                    }
                }
            }

            val outputIndex = dec.dequeueOutputBuffer(bufferInfo, timeoutUs)

            when {
                outputIndex >= 0 -> {
                    idleAfterInput = 0
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        isEndOfStream = true
                    }

                    var keepGoing = true
                    if (bufferInfo.size > 0) {
                        val outputBuffer = dec.getOutputBuffer(outputIndex)
                        if (outputBuffer != null) {
                            val fmt = format
                            val monoSamples = extractMonoFloat(
                                outputBuffer, bufferInfo.offset, bufferInfo.size, fmt.channelCount, fmt.floatPcm
                            )
                            if (monoSamples.isNotEmpty()) {
                                keepGoing = onChunk(monoSamples)
                            }
                        }
                    }

                    dec.releaseOutputBuffer(outputIndex, false)
                    if (!keepGoing) {
                        isEndOfStream = true
                    }
                }
                outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    val newFormat = dec.outputFormat
                    val newSampleRate = newFormat.getIntSafe(MediaFormat.KEY_SAMPLE_RATE)
                    val newChannelCount = newFormat.getIntSafe(MediaFormat.KEY_CHANNEL_COUNT)
                    val encoding = newFormat.getIntSafe(MediaFormat.KEY_PCM_ENCODING)
                    val fmt = format
                    audioFormat = fmt.copy(
                        sampleRate = newSampleRate ?: fmt.sampleRate,
                        channelCount = newChannelCount ?: fmt.channelCount,
                        floatPcm = encoding == android.media.AudioFormat.ENCODING_PCM_FLOAT
                    )
                }
                outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    // Some decoders keep a few frames buffered after the input EOS; give them time.
                    if (inputDone && ++idleAfterInput > MAX_IDLE_POLLS_AFTER_INPUT) {
                        isEndOfStream = true
                    }
                }
            }
        }
    }

    override fun close() {
        if (isCodecStarted) {
            try {
                codec?.stop()
            } catch (_: Exception) { }
            isCodecStarted = false
        }
        try {
            codec?.release()
        } catch (_: Exception) { }
        try {
            extractor?.release()
        } catch (_: Exception) { }
        codec = null
        extractor = null
    }

    companion object {
        private const val MAX_IDLE_POLLS_AFTER_INPUT = 50

        private fun findAudioTrack(extractor: MediaExtractor): Int {
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                if (mime.startsWith("audio/")) {
                    return i
                }
            }
            return -1
        }

        private fun extractMonoFloat(
            buffer: ByteBuffer,
            offset: Int,
            size: Int,
            channelCount: Int,
            floatPcm: Boolean
        ): FloatArray {
            val channels = channelCount.coerceAtLeast(1)
            buffer.position(offset)
            buffer.limit(offset + size)
            val data = buffer.slice().order(ByteOrder.LITTLE_ENDIAN)

            if (floatPcm) {
                val floats = data.asFloatBuffer()
                val monoCount = floats.remaining() / channels
                val mono = FloatArray(monoCount)
                val scale = 1.0f / channels
                for (i in 0 until monoCount) {
                    var sum = 0f
                    for (ch in 0 until channels) sum += floats.get(i * channels + ch)
                    mono[i] = sum * scale
                }
                return mono
            }

            val shorts = data.asShortBuffer()
            val monoCount = shorts.remaining() / channels
            if (monoCount == 0) return FloatArray(0)
            val mono = FloatArray(monoCount)
            val scale = 1.0f / (32768.0f * channels)
            for (i in 0 until monoCount) {
                var sum = 0f
                for (ch in 0 until channels) sum += shorts.get(i * channels + ch).toFloat()
                mono[i] = sum * scale
            }
            return mono
        }

        private fun MediaFormat.getIntSafe(key: String): Int? =
            try { if (containsKey(key)) getInteger(key) else null } catch (_: Exception) { null }

        private fun MediaFormat.getLongSafe(key: String): Long? =
            try { if (containsKey(key)) getLong(key) else null } catch (_: Exception) { null }
    }
}
