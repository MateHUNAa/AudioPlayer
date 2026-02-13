@echo off
setlocal enabledelayedexpansion

set "OUT_FILE="
set "IN_FILE="
set "NEXT_IS_OUT=0"
set "SOURCE_MAP=0"

for %%a in (%*) do (
    if "!NEXT_IS_OUT!"=="1" (
        set "OUT_FILE=%%~a"
        set "NEXT_IS_OUT=0"
    ) else if "%%~a"=="-out" (
        set "NEXT_IS_OUT=1"
    ) else if "%%~a"=="-output-source-map" (
        set "SOURCE_MAP=1"
    ) else if "%%~a"=="-w" (
        rem skip
    ) else if "%%~a"=="-emit-binary" (
        rem skip
    ) else if "%%~a"=="-O" (
        rem skip
    ) else (
        set "CHECK=%%~a"
        if "!CHECK:~0,21!"=="-max-diagnostic-width" (
            rem skip
        ) else if not "!CHECK:~0,1!"=="-" (
            if exist "%%~a" (
                set "IN_FILE=%%~a"
            )
        )
    )
)

if not defined IN_FILE (
    echo hermesc-passthrough: no input file found 1>&2
    exit /b 1
)

if not defined OUT_FILE (
    echo hermesc-passthrough: no output file specified 1>&2
    exit /b 1
)

copy /y "%IN_FILE%" "%OUT_FILE%" >nul 2>&1
if errorlevel 1 (
    echo hermesc-passthrough: failed to copy "%IN_FILE%" to "%OUT_FILE%" 1>&2
    exit /b 1
)

if "!SOURCE_MAP!"=="1" (
    echo {"version":3,"sources":[],"mappings":""}> "%OUT_FILE%.map"
)

exit /b 0
