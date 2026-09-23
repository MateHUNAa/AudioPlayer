#include <jni.h>
#include <stdlib.h>
#include <string.h>
#include <android/log.h>
#include <aubio.h>

#define LOG_TAG "AubioJNI"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

typedef struct {
    aubio_tempo_t *tempo;
    fvec_t *inputBuf;
    fvec_t *outputBuf;
    uint_t hopSize;
    uint_t sampleRate;
    float lastBpm;
    uint_t totalBeats;
} TempoDetectorHandle;

JNIEXPORT jlong JNICALL
Java_com_audioplayer_bpm_NativeAubioBridge_nativeCreateTempoDetector(
    JNIEnv *env, jclass clazz, jint bufSize, jint hopSize, jint sampleRate)
{
    TempoDetectorHandle *handle = (TempoDetectorHandle *)calloc(1, sizeof(TempoDetectorHandle));
    if (!handle) {
        LOGE("Failed to allocate TempoDetectorHandle");
        return 0;
    }

    handle->hopSize = (uint_t)hopSize;
    handle->sampleRate = (uint_t)sampleRate;
    handle->lastBpm = 0.0f;
    handle->totalBeats = 0;

    handle->tempo = new_aubio_tempo("default", (uint_t)bufSize, (uint_t)hopSize, (uint_t)sampleRate);
    if (!handle->tempo) {
        LOGE("Failed to create aubio_tempo (buf=%d, hop=%d, sr=%d)", bufSize, hopSize, sampleRate);
        free(handle);
        return 0;
    }

    handle->inputBuf = new_fvec((uint_t)hopSize);
    if (!handle->inputBuf) {
        LOGE("Failed to allocate input fvec");
        del_aubio_tempo(handle->tempo);
        free(handle);
        return 0;
    }

    handle->outputBuf = new_fvec(1);
    if (!handle->outputBuf) {
        LOGE("Failed to allocate output fvec");
        del_fvec(handle->inputBuf);
        del_aubio_tempo(handle->tempo);
        free(handle);
        return 0;
    }

    return (jlong)(intptr_t)handle;
}

JNIEXPORT jfloat JNICALL
Java_com_audioplayer_bpm_NativeAubioBridge_nativeProcessFrame(
    JNIEnv *env, jclass clazz, jlong handlePtr, jfloatArray buffer, jint length)
{
    if (handlePtr == 0) {
        return 0.0f;
    }

    TempoDetectorHandle *handle = (TempoDetectorHandle *)(intptr_t)handlePtr;
    jfloat *samples = (*env)->GetFloatArrayElements(env, buffer, NULL);
    if (!samples) {
        return 0.0f;
    }

    uint_t hopSize = handle->hopSize;
    uint_t framesProcessed = 0;
    float detectedBpm = 0.0f;

    while (framesProcessed + hopSize <= (uint_t)length) {
        memcpy(handle->inputBuf->data, samples + framesProcessed, hopSize * sizeof(float));
        aubio_tempo_do(handle->tempo, handle->inputBuf, handle->outputBuf);

        if (handle->outputBuf->data[0] != 0.0f) {
            handle->totalBeats++;
        }

        float currentBpm = aubio_tempo_get_bpm(handle->tempo);
        if (currentBpm > 0.0f) {
            handle->lastBpm = currentBpm;
            detectedBpm = currentBpm;
        }

        framesProcessed += hopSize;
    }

    (*env)->ReleaseFloatArrayElements(env, buffer, samples, JNI_ABORT);
    return detectedBpm;
}

JNIEXPORT jfloat JNICALL
Java_com_audioplayer_bpm_NativeAubioBridge_nativeGetBpm(
    JNIEnv *env, jclass clazz, jlong handlePtr)
{
    if (handlePtr == 0) {
        return 0.0f;
    }

    TempoDetectorHandle *handle = (TempoDetectorHandle *)(intptr_t)handlePtr;
    float bpm = aubio_tempo_get_bpm(handle->tempo);

    if (bpm > 0.0f) {
        return bpm;
    }

    return handle->lastBpm;
}

JNIEXPORT jint JNICALL
Java_com_audioplayer_bpm_NativeAubioBridge_nativeGetTotalBeats(
    JNIEnv *env, jclass clazz, jlong handlePtr)
{
    if (handlePtr == 0) {
        return 0;
    }

    TempoDetectorHandle *handle = (TempoDetectorHandle *)(intptr_t)handlePtr;
    return (jint)handle->totalBeats;
}

JNIEXPORT void JNICALL
Java_com_audioplayer_bpm_NativeAubioBridge_nativeDestroyTempoDetector(
    JNIEnv *env, jclass clazz, jlong handlePtr)
{
    if (handlePtr == 0) {
        return;
    }

    TempoDetectorHandle *handle = (TempoDetectorHandle *)(intptr_t)handlePtr;

    if (handle->outputBuf) {
        del_fvec(handle->outputBuf);
    }
    if (handle->inputBuf) {
        del_fvec(handle->inputBuf);
    }
    if (handle->tempo) {
        del_aubio_tempo(handle->tempo);
    }

    free(handle);
}