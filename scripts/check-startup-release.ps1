param([switch]$TimingOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$artifactDirectory = Join-Path $projectRoot 'artifacts\0.2.0'
$receipt = Get-Content -LiteralPath (Join-Path $artifactDirectory 'apk-build-receipt.json') -Raw | ConvertFrom-Json
$apkDigest = (Get-FileHash -LiteralPath $receipt.apk -Algorithm SHA256).Hash.ToLowerInvariant()
if ($apkDigest -ne $receipt.sha256) { throw 'Generated APK differs from the build receipt.' }
$adb = Join-Path $projectRoot '.tools\AndroidSDK\platform-tools\adb.exe'
$deviceArgs = @('-P','5038','-s','127.0.0.1:5555')
if (-not $TimingOnly) {
    & $adb @deviceArgs install -r $receipt.apk
    if ($LASTEXITCODE -ne 0) { throw 'Release APK installation failed.' }
}
$packageOutput = (& $adb @deviceArgs shell pm path com.fxl.freetv.demo) -join "`n"
$packagePath = $packageOutput.Trim() -replace '^package:',''
if ($packagePath -notmatch '^/data/app/[A-Za-z0-9_~+=./-]+/base\.apk$') { throw 'Unexpected installed package path.' }
$deviceDigest = (& $adb @deviceArgs shell sha256sum $packagePath) -join "`n"
if ($deviceDigest -notmatch '^([a-fA-F0-9]{64})\s') { throw 'Installed package hash unavailable.' }
if ($Matches[1].ToLowerInvariant() -ne $apkDigest) { throw 'Installed APK differs from the generated artifact.' }
"INSTALLED_APK_SHA256 $apkDigest" | Set-Content -LiteralPath (Join-Path $artifactDirectory 'startup-release-install-check.log') -Encoding utf8
& $adb @deviceArgs install -r (Join-Path $artifactDirectory 'freetv-player-checks.apk')
if ($LASTEXITCODE -ne 0) { throw 'Release-only test APK installation failed.' }
& $adb @deviceArgs reverse tcp:8754 tcp:8754
if ($LASTEXITCODE -ne 0) { throw 'Fixture forwarding failed.' }
& $adb @deviceArgs reverse tcp:8756 tcp:8756
if ($LASTEXITCODE -ne 0) { throw 'Startup fixture forwarding failed.' }
function Invoke-ReleaseCheck([string]$LogName, [string]$Expected, [string[]]$ExtraArgs) {
    $targetLog = Join-Path $artifactDirectory $LogName
    "APK_SHA256 $apkDigest" | Set-Content -LiteralPath $targetLog -Encoding utf8
    & $adb @deviceArgs shell am instrument -w @ExtraArgs com.fxl.freetv.test/com.fxl.freetv.test.PlayerChecks | Tee-Object -FilePath $targetLog -Append
    if ($LASTEXITCODE -ne 0) { throw "Instrumentation failed: $LogName" }
    $output = Get-Content -LiteralPath $targetLog -Raw
    if ($output.Contains('check failed') -or -not $output.Contains($Expected)) { throw "Native assertions did not pass: $LogName" }
}
if (-not $TimingOnly) { Invoke-ReleaseCheck 'startup-release-warmup-check.log' 'FreeTV startup warmup checks passed' @('-e','mode','startupCache') }
$fixtureRun = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$sourceArgs = @('-e','mode','sources','-e','startup','true','-e','readyApp','true','-e','skipCatalog','true','-e','expectLandscape','true','-e','input','startup-playback-input.json','-e','source','xigua','-e','seconds','1')
if (-not $TimingOnly) {
    Invoke-ReleaseCheck 'startup-release-redirect-check.log' 'Source sampling completed' ($sourceArgs + @('-e','expectWarmup','true','-e','url',"http://127.0.0.1:8756/case/release-$fixtureRun/entry.m3u8"))
    Invoke-ReleaseCheck 'startup-release-playback-check.log' 'FreeTV native playback checks passed' @()
    Invoke-ReleaseCheck 'startup-release-lifecycle-check.log' 'Existing activity accepted a fresh playback session' @('-e','mode','lifecycle')
}
Invoke-ReleaseCheck 'startup-release-controlled-repeat.log' 'Source sampling completed' ($sourceArgs + @('-e','repeat','3','-e','url',"http://127.0.0.1:8756/case/slow-release-$fixtureRun/entry.m3u8"))
Invoke-ReleaseCheck 'startup-after-release-repeat.log' 'Source sampling completed' ($sourceArgs + @('-e','repeat','3'))
Invoke-ReleaseCheck 'startup-release-cleanup.log' 'Only synthetic fixture pending progress was cleared' @('-e','mode','cleanupFixture')
Write-Output 'Installed release regression and startup samples completed; run verify-android-artifact.mjs --startup to validate the records.'
