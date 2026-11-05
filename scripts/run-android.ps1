param([string]$Device = 'emulator-5554', [Parameter(Mandatory=$true)] [string]$Apk)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$adb = Join-Path $projectRoot '.tools\AndroidSDK\platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb)) { throw 'Run npm run doctor to check Android tools.' }
$apkFile = (Resolve-Path -LiteralPath $Apk).Path
if ([IO.Path]::GetExtension($apkFile) -ne '.apk') { throw 'Provide a generated Android APK.' }
& $adb -s $Device get-state
if ($LASTEXITCODE -ne 0) { throw 'Android device is unavailable.' }
& $adb -s $Device install -r $apkFile
if ($LASTEXITCODE -ne 0) { throw 'APK installation failed.' }
& $adb -s $Device shell am start -n 'com.fxl.freetv.demo/io.dcloud.PandoraEntry'
if ($LASTEXITCODE -ne 0) { throw 'Android launch failed.' }
