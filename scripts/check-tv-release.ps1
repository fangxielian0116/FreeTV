param([switch]$NativeOnly,[switch]$Resume)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$out=Join-Path $root 'artifacts\tv'
$adb=Join-Path $root '.tools\AndroidSDK\platform-tools\adb.exe'
$deviceArgs=@('-P','5038','-s','emulator-5556')
$receipt=Get-Content -LiteralPath (Join-Path $out 'tv-build-receipt.json') -Raw | ConvertFrom-Json
$digest=(Get-FileHash -LiteralPath $receipt.apk -Algorithm SHA256).Hash.ToLowerInvariant()
if($digest -ne $receipt.sha256){throw 'APK differs from final receipt'}
& $adb @deviceArgs install -r $receipt.apk
if($LASTEXITCODE -ne 0){throw 'TV APK install failed'}
# A second install checks the same signed upgrade path without clearing records.
& $adb @deviceArgs install -r $receipt.apk
if($LASTEXITCODE -ne 0){throw 'TV APK upgrade failed'}
$packagePath=((& $adb @deviceArgs shell pm path com.fxl.freetv.demo) -join '').Trim() -replace '^package:',''
if($packagePath -notmatch '^/data/app/[A-Za-z0-9_~+=./-]+/base\.apk$'){throw 'Unexpected installed APK path'}
$installed=(& $adb @deviceArgs shell sha256sum $packagePath) -join ''
if(-not $installed.StartsWith($digest)){throw 'Installed APK hash differs'}
"INSTALLED_APK_SHA256 $digest" | Set-Content -LiteralPath (Join-Path $out 'release-install-check.log')
& $adb @deviceArgs install -r (Join-Path $root 'artifacts\0.2.0\freetv-player-checks.apk')
if($LASTEXITCODE -ne 0){throw 'Release-only instrumentation install failed'}
& $adb @deviceArgs reverse tcp:8754 tcp:8754
function RunCheck([string]$label,[string]$runner,[string[]]$options){
    $path=Join-Path $out ($label+'.log')
    if($Resume -and (Test-Path -LiteralPath $path)){
        $old=Get-Content -LiteralPath $path -Raw
        if($old.Contains("APK_SHA256 $digest") -and $old -match 'checks passed' -and $old -notmatch 'check failed|checks failed|INSTRUMENTATION_FAILED|Process crashed|AssertionError'){Write-Output "PASS $label (same APK already checked)";return}
    }
    "APK_SHA256 $digest" | Set-Content -LiteralPath $path
    & $adb @deviceArgs shell am instrument -w @options ('com.fxl.freetv.test/com.fxl.freetv.test.'+$runner) | Add-Content -LiteralPath $path
    $text=Get-Content -LiteralPath $path -Raw
    if($text -match 'checks failed|check failed|INSTRUMENTATION_FAILED|Process crashed|AssertionError' -or $text -notmatch 'checks passed'){throw "TV check failed: $label; inspect $path"}
    Write-Output "PASS $label"
}
try{
    if(-not $NativeOnly){
        foreach($profile in @(
            @{name='ui-1080-journey';size='1920x1080';density='320';mode='journey'},
            @{name='ui-720-release';size='1280x720';density='213';mode='ui'},
            @{name='ui-4k-release';size='3840x2160';density='640';mode='ui'},
            @{name='ui-1080-density240-release';size='1920x1080';density='240';mode='ui'}
        )){
            & $adb @deviceArgs shell wm size $profile.size
            & $adb @deviceArgs shell wm density $profile.density
            & $adb @deviceArgs shell am force-stop com.fxl.freetv.demo
            RunCheck $profile.name 'TVChecks' @('-e','mode',$profile.mode)
        }
    }
    & $adb @deviceArgs shell wm size 1920x1080
    & $adb @deviceArgs shell wm density 320
    RunCheck 'native-tv-release' 'PlayerChecks' @('-e','tv','true','-e','mode','tvPlayback','-e','position','0')
    try{
        & $adb @deviceArgs shell wm size 3840x2160
        & $adb @deviceArgs shell wm density 640
        RunCheck 'native-tv-4k-release' 'PlayerChecks' @('-e','tv','true','-e','mode','tvPlayback','-e','position','0')
    }finally{
        & $adb @deviceArgs shell wm size 1920x1080
        & $adb @deviceArgs shell wm density 320
    }
    RunCheck 'native-completion-release' 'PlayerChecks' @('-e','tv','true','-e','mode','completion','-e','position','42')
    RunCheck 'native-recovery-release' 'PlayerChecks' @('-e','tv','true')
    RunCheck 'native-lifecycle-release' 'PlayerChecks' @('-e','tv','true','-e','mode','lifecycle')
    & $adb @deviceArgs shell am force-stop com.fxl.freetv.demo
    RunCheck 'sync-cold-first' 'TVChecks' @('-e','mode','syncPolicy')
    $syncLog=Get-Content -LiteralPath (Join-Path $out 'sync-cold-first.log') -Raw
    $previousTime=[regex]::Match($syncLog,'TV_COLD_SYNC (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})').Groups[1].Value.Replace(' ','T')
    if(-not $previousTime){throw 'Missing cold-start refresh timestamp'}
    & $adb @deviceArgs shell am force-stop com.fxl.freetv.demo
    RunCheck 'sync-cold-second' 'TVChecks' @('-e','mode','syncPolicy','-e','previousTime',$previousTime)
}finally{
    & $adb @deviceArgs shell wm size 1920x1080
    & $adb @deviceArgs shell wm density 320
}
