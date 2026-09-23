package com.audioplayer.analysis

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Streaming feature extraction that mirrors the desktop Music Lens analyzer
 * (lens/analyze.ts + Essentia) closely enough that mood/tone classifications agree.
 * Samples are pushed one chunk at a time so a whole song never has to sit in memory.
 */
class FeatureExtractor(private val sampleRate: Int) {

    private val levels = LevelStats(sampleRate)
    private val envelope = EnvelopeFrames(sampleRate)
    private val spectral = SpectralStats(sampleRate)
    private val chroma = ChromaAccumulator(sampleRate)
    private val spectralGrabber = FrameGrabber(SpectralStats.FFT_SIZE, (sampleRate * 0.25).roundToInt()) { spectral.process(it) }
    private val chromaGrabber = FrameGrabber(ChromaAccumulator.FFT_SIZE, (sampleRate * 0.5).roundToInt()) { chroma.process(it) }

    var samplesSeen = 0L
        private set

    fun push(chunk: FloatArray, length: Int = chunk.size) {
        for (i in 0 until length) {
            val s = chunk[i]
            levels.push(s)
            envelope.push(s)
            spectralGrabber.push(s)
            chromaGrabber.push(s)
        }
        samplesSeen += length
    }

    fun finish(): Features {
        val lv = levels.finish()
        val env = envelope.finish()
        val key = KeyDetector.detect(chroma.average())
        return Features(
            rmsDb = lv.rmsDb,
            peakDb = lv.peakDb,
            drDb = lv.drDb,
            centroid = spectral.centroid(),
            bandLow = spectral.band(0),
            bandMid = spectral.band(1),
            bandHigh = spectral.band(2),
            danceability = Danceability.compute(env),
            key = key.tonic,
            scale = key.scale,
            keyStrength = key.strength,
            fallbackBpm = TempoFallback.estimate(env),
            analyzedSeconds = samplesSeen.toDouble() / sampleRate
        )
    }
}

data class Features(
    val rmsDb: Double,
    val peakDb: Double,
    val drDb: Double,
    val centroid: Double,
    val bandLow: Double,
    val bandMid: Double,
    val bandHigh: Double,
    val danceability: Double,
    val key: String,
    val scale: String,
    val keyStrength: Double,
    val fallbackBpm: Double,
    val analyzedSeconds: Double
)

/** Emits overlapping or gapped fixed-size frames from a sample stream using a ring buffer. */
private class FrameGrabber(private val size: Int, hop: Int, private val onFrame: (DoubleArray) -> Unit) {
    private val hop = hop.coerceAtLeast(1)
    private val ring = FloatArray(size)
    private val frame = DoubleArray(size)
    private var writePos = 0
    private var count = 0L
    private var nextStart = 0L

    fun push(sample: Float) {
        ring[writePos] = sample
        writePos = if (writePos + 1 == size) 0 else writePos + 1
        count++
        if (count - size == nextStart) {
            // writePos now points at the oldest sample of the completed frame.
            for (i in 0 until size) {
                val idx = writePos + i
                frame[i] = ring[if (idx >= size) idx - size else idx].toDouble()
            }
            onFrame(frame)
            nextStart += hop
        }
    }
}

private fun db(x: Double): Double = 20.0 * log10(max(x, 1e-9))

private class LevelStats(sampleRate: Int) {
    private var sumSq = 0.0
    private var peak = 0.0
    private var count = 0L
    private val window = (sampleRate * 0.4).roundToInt().coerceAtLeast(1)
    private var winSum = 0.0
    private var winCount = 0
    private val shortTerm = ArrayList<Double>()

    fun push(s: Float) {
        val d = s.toDouble()
        val sq = d * d
        sumSq += sq
        val a = abs(d)
        if (a > peak) peak = a
        count++
        winSum += sq
        if (++winCount == window) {
            val l = db(sqrt(winSum / window))
            if (l > -60) shortTerm.add(l)
            winSum = 0.0
            winCount = 0
        }
    }

    data class Result(val rmsDb: Double, val peakDb: Double, val drDb: Double)

    fun finish(): Result {
        shortTerm.sort()
        fun pct(p: Double): Double =
            if (shortTerm.isEmpty()) 0.0 else shortTerm[min(shortTerm.size - 1, floor(p * shortTerm.size).toInt())]
        return Result(
            rmsDb = db(sqrt(sumSq / max(1L, count))),
            peakDb = db(peak),
            drDb = if (shortTerm.isEmpty()) 0.0 else pct(0.95) - pct(0.1)
        )
    }
}

/** Standard deviation of every 10 ms block; the input to Essentia-style danceability (DFA). */
private class EnvelopeFrames(sampleRate: Int) {
    private val frameSize = sampleRate * 0.01
    private val values = GrowableDoubles()
    private var frameIndex = 0
    private var frameEnd = floor(frameSize).toLong()
    private var position = 0L
    private var sum = 0.0
    private var sumSq = 0.0
    private var n = 0

    fun push(s: Float) {
        val d = s.toDouble()
        sum += d
        sumSq += d * d
        n++
        position++
        if (position == frameEnd) {
            val mean = sum / n
            values.add(sqrt(max(0.0, sumSq / n - mean * mean)))
            frameIndex++
            frameEnd = floor((frameIndex + 1) * frameSize).toLong()
            sum = 0.0
            sumSq = 0.0
            n = 0
        }
    }

    fun finish(): DoubleArray = values.toArray()
}

private class SpectralStats(private val sampleRate: Int) {
    private val window = Fft.hann(FFT_SIZE)
    private val re = DoubleArray(FFT_SIZE)
    private val im = DoubleArray(FFT_SIZE)
    private val binHz = sampleRate.toDouble() / FFT_SIZE
    private val lowEnd = floor(250 / binHz).toInt()
    private val midEnd = floor(4000 / binHz).toInt()
    private val bands = DoubleArray(3)
    private var centroidSum = 0.0
    private var centroidFrames = 0

    fun process(frame: DoubleArray) {
        var energy = 0.0
        for (i in 0 until FFT_SIZE) {
            val s = frame[i]
            energy += s * s
            re[i] = s * window[i]
            im[i] = 0.0
        }
        if (energy / FFT_SIZE < 1e-6) return
        Fft.transform(re, im)
        var magSum = 0.0
        var weighted = 0.0
        for (k in 1 until FFT_SIZE / 2) {
            val p = re[k] * re[k] + im[k] * im[k]
            when {
                k < lowEnd -> bands[0] += p
                k < midEnd -> bands[1] += p
                else -> bands[2] += p
            }
            val m = sqrt(p)
            magSum += m
            weighted += m * k * binHz
        }
        if (magSum > 0) {
            centroidSum += weighted / magSum
            centroidFrames++
        }
    }

    fun centroid(): Double = if (centroidFrames > 0) centroidSum / centroidFrames else 0.0

    fun band(i: Int): Double {
        val total = bands[0] + bands[1] + bands[2]
        return if (total > 0) bands[i] / total else 0.0
    }

    companion object {
        const val FFT_SIZE = 2048
    }
}

/**
 * Harmonic pitch-class profile: spectral peaks folded onto 12 pitch classes, with
 * sub-harmonic contributions and cosine weighting between neighbouring semitones.
 */
private class ChromaAccumulator(sampleRate: Int) {
    private val window = Fft.hann(FFT_SIZE)
    private val re = DoubleArray(FFT_SIZE)
    private val im = DoubleArray(FFT_SIZE)
    private val mag = DoubleArray(FFT_SIZE / 2 + 1)
    private val binHz = sampleRate.toDouble() / FFT_SIZE
    private val minBin = kotlin.math.ceil(40 / binHz).toInt().coerceAtLeast(1)
    private val maxBin = min(floor(3500 / binHz).toInt(), FFT_SIZE / 2 - 2)
    private val acc = DoubleArray(12)
    private val frame = DoubleArray(12)
    private val peakFreq = DoubleArray(MAX_PEAKS)
    private val peakMag = DoubleArray(MAX_PEAKS)
    private var frames = 0

    fun process(samples: DoubleArray) {
        var energy = 0.0
        for (i in 0 until FFT_SIZE) {
            val s = samples[i]
            energy += s * s
            re[i] = s * window[i]
            im[i] = 0.0
        }
        if (energy / FFT_SIZE < 1e-6 || maxBin <= minBin) return
        Fft.transform(re, im)

        var maxMag = 0.0
        for (k in 0..FFT_SIZE / 2) {
            mag[k] = sqrt(re[k] * re[k] + im[k] * im[k])
            if (k in minBin..maxBin && mag[k] > maxMag) maxMag = mag[k]
        }
        if (maxMag <= 0) return

        // Keep the strongest MAX_PEAKS local maxima (insertion into a small sorted list).
        var peakCount = 0
        val floorMag = maxMag * 1e-3
        for (k in minBin..maxBin) {
            val b = mag[k]
            if (b <= mag[k - 1] || b < mag[k + 1] || b <= floorMag) continue
            val a = mag[k - 1]
            val c = mag[k + 1]
            val denom = a - 2 * b + c
            val p = if (denom != 0.0) 0.5 * (a - c) / denom else 0.0
            val f = (k + p) * binHz
            val m = b - 0.25 * (a - c) * p
            if (peakCount < MAX_PEAKS) {
                var pos = peakCount++
                while (pos > 0 && peakMag[pos - 1] < m) {
                    peakMag[pos] = peakMag[pos - 1]; peakFreq[pos] = peakFreq[pos - 1]; pos--
                }
                peakMag[pos] = m; peakFreq[pos] = f
            } else if (m > peakMag[MAX_PEAKS - 1]) {
                var pos = MAX_PEAKS - 1
                while (pos > 0 && peakMag[pos - 1] < m) {
                    peakMag[pos] = peakMag[pos - 1]; peakFreq[pos] = peakFreq[pos - 1]; pos--
                }
                peakMag[pos] = m; peakFreq[pos] = f
            }
        }

        frame.fill(0.0)
        for (i in 0 until peakCount) {
            for (h in 1..HARMONICS) {
                val f0 = peakFreq[i] / h
                if (f0 < 25) break
                val semis = 12 * log2(f0 / 440.0) + 9 // 0 = C
                val nearest = semis.roundToInt()
                val d = semis - nearest
                val hw = HARMONIC_SLOPE.pow(h - 1)
                val c = cos(PI * d)
                val w0 = c * c
                frame[Math.floorMod(nearest, 12)] += peakMag[i] * hw * w0
                val other = if (d > 0) nearest + 1 else nearest - 1
                frame[Math.floorMod(other, 12)] += peakMag[i] * hw * (1 - w0)
            }
        }
        var fm = 0.0
        for (v in frame) fm = max(fm, v)
        if (fm <= 0) return
        for (i in 0 until 12) acc[i] += frame[i] / fm
        frames++
    }

    fun average(): DoubleArray = DoubleArray(12) { if (frames > 0) acc[it] / frames else 0.0 }

    companion object {
        const val FFT_SIZE = 8192
        private const val MAX_PEAKS = 60
        private const val HARMONICS = 4
        private const val HARMONIC_SLOPE = 0.6
    }
}

/**
 * Temperley key profiles expanded with harmonics and I/IV/V chord weighting.
 * Calibrated against Essentia's KeyExtractor on the desktop library (83% major/minor agreement).
 */
object KeyDetector {
    private val NOTES = arrayOf("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
    private val MAJOR = expand(doubleArrayOf(5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0))
    private val MINOR = expand(doubleArrayOf(5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0))

    data class Result(val tonic: String, val scale: String, val strength: Double)

    private fun expand(profile: DoubleArray): DoubleArray {
        val harmonicOffsets = intArrayOf(0, 0, 7, 0)
        val poly = DoubleArray(12)
        for (i in 0 until 12) {
            for (h in 0 until 4) poly[(i + harmonicOffsets[h]) % 12] += profile[i] * 0.6.pow(h)
        }
        return DoubleArray(12) { poly[it] + 0.5 * poly[(it + 5) % 12] + 0.5 * poly[(it + 7) % 12] }
    }

    private fun pearson(pcp: DoubleArray, profile: DoubleArray, rotation: Int): Double {
        var ma = 0.0
        var mb = 0.0
        for (i in 0 until 12) { ma += pcp[i]; mb += profile[i] }
        ma /= 12; mb /= 12
        var num = 0.0
        var da = 0.0
        var db = 0.0
        for (i in 0 until 12) {
            val x = pcp[(i + rotation) % 12] - ma
            val y = profile[i] - mb
            num += x * y; da += x * x; db += y * y
        }
        val denom = sqrt(da * db)
        return if (denom > 0) num / denom else 0.0
    }

    fun detect(pcp: DoubleArray): Result {
        var best = Result("C", "major", -2.0)
        for (t in 0 until 12) {
            val rMajor = pearson(pcp, MAJOR, t)
            val rMinor = pearson(pcp, MINOR, t)
            if (rMajor > best.strength) best = Result(NOTES[t], "major", rMajor)
            if (rMinor > best.strength) best = Result(NOTES[t], "minor", rMinor)
        }
        return best
    }
}

/** Detrended fluctuation analysis, following Essentia's Danceability algorithm. */
object Danceability {
    fun compute(envelope: DoubleArray): Double {
        val n = envelope.size
        if (n < 100) return 0.0
        val s = envelope.copyOf()
        var mean = 0.0
        for (v in s) mean += v
        mean /= n
        for (i in 0 until n) s[i] -= mean
        for (i in 1 until n) s[i] += s[i - 1]

        val taus = ArrayList<Int>()
        var tau = 310.0
        while (tau <= 8800.0) {
            taus.add(floor(tau / 10).toInt())
            tau *= 1.1
        }
        val f = DoubleArray(taus.size)
        for (t in taus.indices) {
            val size = taus[t]
            val jump = max(size / 50, 1)
            var sum = 0.0
            var cnt = 0
            var k = 0
            while (k < n - size) {
                sum += residual(s, k, k + size)
                cnt++
                k += jump
            }
            f[t] = if (cnt > 0) sqrt(sum / cnt) else 0.0
        }
        var d = 0.0
        for (t in 0 until taus.size - 1) {
            if (f[t + 1] > 0 && f[t] > 0) {
                d += log10(f[t + 1] / f[t]) / log10((taus[t + 1] + 3.0) / (taus[t] + 3.0))
            }
        }
        d /= (taus.size - 1)
        return if (d > 0) 1 / d else 0.0
    }

    private fun residual(s: DoubleArray, begin: Int, end: Int): Double {
        val n = end - begin
        val mx = (n - 1) / 2.0
        var my = 0.0
        for (i in begin until end) my += s[i]
        my /= n
        var cov = 0.0
        var vx = 0.0
        for (i in 0 until n) {
            val dx = i - mx
            cov += dx * (s[begin + i] - my)
            vx += dx * dx
        }
        val slope = if (vx > 0) cov / vx else 0.0
        var err = 0.0
        for (i in 0 until n) {
            val r = s[begin + i] - (my + slope * (i - mx))
            err += r * r
        }
        return err / n
    }
}

/**
 * Tempo estimate from the 10 ms energy envelope (onset strength autocorrelation).
 * Only used when the aubio native library is unavailable.
 */
object TempoFallback {
    private const val FRAMES_PER_SECOND = 100.0

    fun estimate(envelope: DoubleArray): Double {
        val n = envelope.size
        if (n < 600) return 0.0
        val novelty = DoubleArray(n)
        for (i in 1 until n) {
            val diff = ln(envelope[i] + 1e-6) - ln(envelope[i - 1] + 1e-6)
            novelty[i] = if (diff > 0) diff else 0.0
        }
        var mean = 0.0
        for (v in novelty) mean += v
        mean /= n
        for (i in 0 until n) novelty[i] -= mean

        val minLag = (FRAMES_PER_SECOND * 60 / 200).toInt()
        val maxLag = (FRAMES_PER_SECOND * 60 / 60).toInt()
        var bestLag = 0
        var bestScore = Double.NEGATIVE_INFINITY
        val scores = DoubleArray(maxLag + 2)
        for (lag in minLag..maxLag + 1) {
            var ac = 0.0
            for (i in lag until n) ac += novelty[i] * novelty[i - lag]
            val bpm = FRAMES_PER_SECOND * 60 / lag
            val octaves = log2(bpm / 120.0)
            val score = ac * exp(-0.5 * octaves * octaves / (0.9 * 0.9))
            scores[lag] = score
            if (lag <= maxLag && score > bestScore) {
                bestScore = score
                bestLag = lag
            }
        }
        if (bestLag <= minLag || bestScore <= 0) return 0.0
        val a = scores[bestLag - 1]
        val b = scores[bestLag]
        val c = scores[bestLag + 1]
        val denom = a - 2 * b + c
        val refined = if (denom != 0.0) bestLag + 0.5 * (a - c) / denom else bestLag.toDouble()
        return FRAMES_PER_SECOND * 60 / refined
    }
}

private class GrowableDoubles {
    private var data = DoubleArray(4096)
    private var size = 0

    fun add(v: Double) {
        if (size == data.size) data = data.copyOf(size * 2)
        data[size++] = v
    }

    fun toArray(): DoubleArray = data.copyOf(size)
}
