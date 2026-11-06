param([string]$Serial='emulator-5554',[switch]$Resume,[string]$ReceiptFile)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
if(-not $ReceiptFile){$ReceiptFile=Join-Path $root 'artifacts/offline/phone/offline-build-receipt.json'}
$ReceiptFile=(Resolve-Path -LiteralPath $ReceiptFile).ProviderPath
$out=Split-Path -Parent $ReceiptFile
$adb=Join-Path $root '.tools/AndroidSDK/platform-tools/adb.exe'
$deviceArgs=@('-P','5038','-s',$Serial)
$avd=& $adb @deviceArgs emu avd name
if($Serial -notmatch '^emulator-' -or $avd -notcontains 'FreeTV_Android'){throw 'Phone checks must run only on the owned FreeTV_Android AVD.'}
$receipt=Get-Content -LiteralPath $ReceiptFile -Raw | ConvertFrom-Json
$digest=(Get-FileHash -LiteralPath $receipt.apk -Algorithm SHA256).Hash.ToLowerInvariant()
if($digest -ne $receipt.sha256){throw 'Phone APK checksum differs'}
& $adb @deviceArgs install -r $receipt.apk
if($LASTEXITCODE -ne 0){throw 'Phone installation failed'}
& $adb @deviceArgs install -r $receipt.apk
if($LASTEXITCODE -ne 0){throw 'Phone upgrade failed'}
$packagePath=((& $adb @deviceArgs shell pm path com.fxl.freetv.demo) -join '').Trim() -replace '^package:',''
if($packagePath -notmatch '^/data/app/[A-Za-z0-9_~+=./-]+/base\.apk$'){throw 'Unexpected installed package path'}
$installed=(& $adb @deviceArgs shell sha256sum $packagePath) -join ''
if(-not $installed.StartsWith($digest)){throw 'Installed phone APK differs'}
"INSTALLED_APK_SHA256 $digest" | Set-Content (Join-Path $out 'release-install-check.log')
& $adb @deviceArgs install -r (Join-Path $root 'artifacts/0.2.0/freetv-player-checks.apk')
if($LASTEXITCODE -ne 0){throw 'Instrumentation install failed'}
& $adb @deviceArgs reverse tcp:8754 tcp:8754
function RunCheck([string]$label,[string[]]$options){
  $path=Join-Path $out ($label+'.log')
  if($Resume -and (Test-Path -LiteralPath $path)){
    $old=Get-Content -LiteralPath $path -Raw
    if($old.Contains("APK_SHA256 $digest") -and $old -match 'checks passed' -and $old -notmatch 'check failed|checks failed|INSTRUMENTATION_FAILED|Process crashed|AssertionError'){Write-Output "PASS $label (same APK already checked)";return}
  }
  "APK_SHA256 $digest" | Set-Content -LiteralPath $path
  & $adb @deviceArgs shell am instrument -w @options com.fxl.freetv.test/com.fxl.freetv.test.PlayerChecks | Add-Content -LiteralPath $path
  $text=Get-Content -LiteralPath $path -Raw
  if($text -notmatch 'checks passed' -or $text -match 'check failed|checks failed|INSTRUMENTATION_FAILED|Process crashed|AssertionError'){throw "Phone check failed: $label"}
  Write-Output "PASS $label"
}
RunCheck 'phone-categories' @('-e','mode','categories')
RunCheck 'phone-posters' @('-e','mode','posters','-e','phase','warm')
RunCheck 'phone-search-empty' @('-e','mode','searchState')
try{
  & $adb @deviceArgs shell cmd wifi set-wifi-enabled disabled
  & $adb @deviceArgs shell svc data disable
  Start-Sleep -Seconds 3
  RunCheck 'phone-search-error' @('-e','mode','searchState','-e','offline','true')
}finally{
  & $adb @deviceArgs shell svc data enable
  & $adb @deviceArgs shell cmd wifi set-wifi-enabled enabled
  & $adb @deviceArgs shell cmd wifi connect-network AndroidWifi open
}
RunCheck 'native-completion-release' @('-e','mode','completion','-e','position','42')
RunCheck 'native-recovery-release' @()
RunCheck 'native-lifecycle-release' @('-e','mode','lifecycle')
