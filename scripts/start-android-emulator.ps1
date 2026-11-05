param([switch]$ColdBoot, [switch]$Headless, [ValidateSet('auto','host','software','swiftshader','swangle')] [string]$Gpu = 'auto', [ValidateRange(1024,65535)] [int]$AdbServerPort = 5037)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$env:ANDROID_HOME = Join-Path $projectRoot '.tools\AndroidSDK'
$env:ANDROID_USER_HOME = Join-Path $projectRoot '.tools\AndroidData'
$env:ANDROID_EMULATOR_HOME = $env:ANDROID_USER_HOME
$env:ANDROID_AVD_HOME = Join-Path $env:ANDROID_USER_HOME 'avd'
$env:ANDROID_ADB_SERVER_PORT = [string]$AdbServerPort
$env:TEMP = Join-Path $projectRoot '.tools\emulator-temp'
$env:TMP = $env:TEMP
$env:PATH = (Join-Path $env:ANDROID_HOME 'platform-tools') + ';' + $env:PATH
$emulator = Join-Path $env:ANDROID_HOME 'emulator\emulator.exe'
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $emulator)) { throw 'Android emulator is not installed.' }
# Start-Process -Wait also waits for the detached adb daemon on Windows.
# Wait for the client only, so a newly started server cannot block VM launch.
& $adb -P $AdbServerPort start-server
if ($LASTEXITCODE -ne 0) { throw 'Unable to start the Android debug server.' }
$runningDevices = & $adb -P $AdbServerPort devices
if ($runningDevices -match '^(emulator-5554|127\.0\.0\.1:5555)\s+device') {
    Write-Output 'FreeTV Android emulator is already running.'
    exit 0
}
$arguments = @('-avd','FreeTV_Android','-port','5554','-gpu',$Gpu,'-feature','-Vulkan','-no-boot-anim','-no-metrics')
if ($ColdBoot) { $arguments += '-no-snapshot-load' }
if ($Headless) { $arguments += '-no-window' }
$launchStyle = if ($Headless) { 'Hidden' } else { 'Normal' }
Start-Process -FilePath $emulator -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle $launchStyle -RedirectStandardOutput (Join-Path $env:ANDROID_USER_HOME 'emulator-output.log') -RedirectStandardError (Join-Path $env:ANDROID_USER_HOME 'emulator-error.log')


