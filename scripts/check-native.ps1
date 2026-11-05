$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$hbuilderxExecutable = if ($env:FREETV_HBUILDERX) { $env:FREETV_HBUILDERX } else { Join-Path $projectRoot '.tools\HBuilderX-5.26\HBuilderX\HBuilderX.exe' }
$plugins = Join-Path (Split-Path $hbuilderxExecutable -Parent) 'plugins'
$env:JAVA_HOME = Join-Path $plugins 'amazon-corretto'
$nativeClasspath = Get-Content -LiteralPath (Join-Path $projectRoot '.cache\native-check\classpath.txt') -Raw
$nativeSources = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src\uni_modules\freetv-player\utssdk\app-android') -Filter '*.kt' -File | Select-Object -ExpandProperty FullName
$compilerLibraries = Join-Path $plugins 'uniapp-runextension\kotlinc\lib\*'
& (Join-Path $env:JAVA_HOME 'bin\java.exe') '-Dfile.encoding=UTF-8' -cp $compilerLibraries org.jetbrains.kotlin.cli.jvm.K2JVMCompiler @nativeSources -classpath $nativeClasspath.Trim() -jvm-target 17 -no-stdlib -no-reflect -d (Join-Path $projectRoot '.cache\native-check\player-check.jar')
if ($LASTEXITCODE -ne 0) { throw 'Native Kotlin compilation failed.' }
