param([switch]$Headless,[ValidateSet('host','swiftshader','auto')][string]$Gpu='host')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$env:ANDROID_HOME=Join-Path $root '.tools\AndroidSDK'
$env:ANDROID_USER_HOME=Join-Path $root '.tools\AndroidData'
$env:ANDROID_EMULATOR_HOME=$env:ANDROID_USER_HOME
$env:ANDROID_AVD_HOME=Join-Path $env:ANDROID_USER_HOME 'avd'
$env:ANDROID_ADB_SERVER_PORT='5038'
$env:TEMP=Join-Path $root '.tools\emulator-temp';$env:TMP=$env:TEMP
$adb=Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
& $adb -P 5038 start-server
if($LASTEXITCODE -ne 0){throw 'Unable to start the project ADB server'}
$devices=& $adb -P 5038 devices
if($devices -match '^emulator-5556\s+(device|offline)'){
  Write-Output 'FreeTV TV emulator is already running.'
}else{
  if(-not (Test-Path -LiteralPath (Join-Path $env:ANDROID_AVD_HOME 'FreeTV_TV.avd\config.ini'))){throw 'Create the FreeTV_TV AVD with the Android TV API 30 x86 image and tv_1080p profile first.'}
  $arguments=@('-avd','FreeTV_TV','-port','5556','-gpu',$Gpu,'-no-boot-anim','-no-snapshot','-no-metrics','-feature','-Vulkan')
  $windowStyle='Normal'
  if($Headless){$arguments+='-no-window';$windowStyle='Hidden'}
  Start-Process -FilePath (Join-Path $env:ANDROID_HOME 'emulator\emulator.exe') -ArgumentList $arguments -WindowStyle $windowStyle -WorkingDirectory $root -RedirectStandardOutput (Join-Path $env:ANDROID_USER_HOME 'tv-output.log') -RedirectStandardError (Join-Path $env:ANDROID_USER_HOME 'tv-error.log')
}

$bootDeadline=(Get-Date).AddSeconds(120)
do{
  $devices=& $adb -P 5038 devices
  if($devices -match '^emulator-5556\s+device$'){
    $booted=& $adb -P 5038 -s emulator-5556 shell getprop sys.boot_completed
    if($LASTEXITCODE -eq 0 -and "$booted".Trim() -eq '1'){break}
  }
  if((Get-Date) -ge $bootDeadline){throw 'FreeTV TV emulator did not finish booting within 120 seconds.'}
  Start-Sleep -Seconds 2
}while($true)

# Restrict connectivity changes to this project-owned virtual TV, never a phone or physical TV.
$avdName=& $adb -P 5038 -s emulator-5556 emu avd name
if($LASTEXITCODE -ne 0 -or $avdName -notcontains 'FreeTV_TV'){throw 'Port 5556 is not the FreeTV_TV AVD; network settings were not changed.'}
function Invoke-TvAdb {
  param([string[]]$AdbArguments)
  $result=& $adb -P 5038 -s emulator-5556 @AdbArguments
  if($LASTEXITCODE -ne 0){throw "TV ADB command failed: $($AdbArguments -join ' ')"}
  return $result
}

# Keep HTTPS validation enabled. The default www.google.com probe times out on this network
# and Android 11 then permanently disables autojoin for the virtual AndroidWifi network.
$probeChanged=$false
foreach($scheme in @('https','http')){
  $key="captive_portal_${scheme}_url"
  $url="${scheme}://connectivitycheck.platform.hicloud.com/generate_204"
  $current=Invoke-TvAdb -AdbArguments @('shell','settings','get','global',$key)
  if("$current".Trim() -ne $url){
    Invoke-TvAdb -AdbArguments @('shell','settings','put','global',$key,$url) | Out-Null
    $probeChanged=$true
  }
}
$wifiNetwork=Invoke-TvAdb -AdbArguments @('shell','dumpsys','connectivity') | Where-Object {$_ -match 'NetworkAgentInfo.*type: WIFI'}
if($probeChanged -or -not ($wifiNetwork -match '\bVALIDATED\b')){
  Invoke-TvAdb -AdbArguments @('shell','cmd','wifi','set-wifi-enabled','disabled') | Out-Null
  Start-Sleep -Seconds 1
  Invoke-TvAdb -AdbArguments @('shell','cmd','wifi','set-wifi-enabled','enabled') | Out-Null
  Invoke-TvAdb -AdbArguments @('shell','cmd','wifi','connect-network','AndroidWifi','open') | Out-Null
}
$networkDeadline=(Get-Date).AddSeconds(30)
do{
  $wifiNetwork=Invoke-TvAdb -AdbArguments @('shell','dumpsys','connectivity') | Where-Object {$_ -match 'NetworkAgentInfo.*type: WIFI'}
  if($wifiNetwork -match '\bVALIDATED\b'){Write-Output 'FreeTV TV emulator Wi-Fi is connected and internet validation passed.';break}
  if((Get-Date) -ge $networkDeadline){throw 'TV Wi-Fi could not validate internet access within 30 seconds. Check the host connection and tv-output.log.'}
  Start-Sleep -Seconds 2
}while($true)
