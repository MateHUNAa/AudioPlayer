cmake_minimum_required(VERSION 3.13)
project(aubio_native)

set(AUBIO_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/aubio/src")

if(NOT EXISTS "${AUBIO_SRC_DIR}/aubio.h")
    message(FATAL_ERROR
        "aubio source not found at ${AUBIO_SRC_DIR}. "
        "Run the downloadAubio Gradle task or manually place aubio source in ${CMAKE_CURRENT_SOURCE_DIR}/aubio/")
endif()

set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -DHAVE_STDLIB_H=1 -DHAVE_STDIO_H=1 -DHAVE_MATH_H=1 -DHAVE_STRING_H=1 -DHAVE_LIMITS_H=1 -DHAVE_STDARG_H=1 -DHAVE_ERRNO_H=1 -DHAVE_MEMCPY_HACKS=1")

file(GLOB AUBIO_CORE_SRC
    "${AUBIO_SRC_DIR}/*.c"
)

file(GLOB AUBIO_TEMPORAL_SRC
    "${AUBIO_SRC_DIR}/temporal/*.c"
)

file(GLOB AUBIO_SPECTRAL_SRC
    "${AUBIO_SRC_DIR}/spectral/*.c"
)

file(GLOB AUBIO_ONSET_SRC
    "${AUBIO_SRC_DIR}/onset/*.c"
)

file(GLOB AUBIO_TEMPO_SRC
    "${AUBIO_SRC_DIR}/tempo/*.c"
)

file(GLOB AUBIO_PITCH_SRC
    "${AUBIO_SRC_DIR}/pitch/*.c"
)

file(GLOB AUBIO_UTILS_SRC
    "${AUBIO_SRC_DIR}/utils/*.c"
)

set(AUBIO_ALL_SRC
    ${AUBIO_CORE_SRC}
    ${AUBIO_TEMPORAL_SRC}
    ${AUBIO_SPECTRAL_SRC}
    ${AUBIO_ONSET_SRC}
    ${AUBIO_TEMPO_SRC}
    ${AUBIO_PITCH_SRC}
    ${AUBIO_UTILS_SRC}
)

list(FILTER AUBIO_ALL_SRC EXCLUDE REGEX ".*/io/.*")
list(FILTER AUBIO_ALL_SRC EXCLUDE REGEX ".*/synth/.*")
list(FILTER AUBIO_ALL_SRC EXCLUDE REGEX ".*/notes/.*")

add_library(aubio STATIC ${AUBIO_ALL_SRC})

target_include_directories(aubio PUBLIC
    "${AUBIO_SRC_DIR}"
    "${AUBIO_SRC_DIR}/.."
)

target_compile_options(aubio PRIVATE
    -O2
    -ffast-math
    -fPIC
    -Wno-unused-parameter
    -Wno-sign-compare
    -Wno-missing-field-initializers
)

target_link_libraries(aubio m)

add_library(aubio_jni SHARED
    aubio_jni.c
)

target_include_directories(aubio_jni PRIVATE
    "${AUBIO_SRC_DIR}"
    "${AUBIO_SRC_DIR}/.."
)

find_library(log-lib log)

target_link_libraries(aubio_jni
    aubio
    ${log-lib}
    m
)

target_compile_options(aubio_jni PRIVATE
    -O2
    -ffast-math
    -Wall
)
