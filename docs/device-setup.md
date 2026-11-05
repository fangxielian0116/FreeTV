# Android 构建与测试

工程使用本机 HBuilderX 5.26、GSYVideoPlayer 14.0.0 和其配套 Media3 1.10.1。保留 AppID `__UNI__E70B510`、包名 `com.fxl.freetv.demo`、已有签名及 Android 6.0 最低要求。

## 构建

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build:h5
npm.cmd run build:android
node scripts/prepare-native-check.mjs
.\scripts\check-native.ps1
node scripts/pack-android.mjs
```

资源构建和 Kotlin 编译通过不等于 APK 验收通过。独立 APK 使用安心打包：原生模块、依赖和 Android 配置交给 DCloud 构建，前端资源和签名在本机合入。自定义调试基座不支持安心打包，本工程已禁用该云端路径。签名配置在 `.signing/android-test.json`，不得打印或分发；重建时继续使用已有身份。

每次打包会保存 `artifacts/0.2.0/native-build-input.zip` 和原生输入哈希记录。检查 HBuilderX 的实际生成结果，并对最终文件完成签名检查、覆盖安装和运行验证。

## 模拟器与真机

统一使用 `.tools/AndroidSDK/platform-tools/adb.exe`，避免系统 PATH 中的旧版 ADB 干扰设备连接。

```powershell
.\scripts\start-android-emulator.ps1 -Headless
.\scripts\run-android.ps1 -Apk 'E:\FreeTV\dist\release\apk\实际安装包.apk'
```

图形渲染有异常时可在关闭本项目模拟器后使用 `-ColdBoot -Gpu swiftshader` 冷启动，保留模拟器数据。真机需本人确认 USB 调试授权，随后使用相同的安装脚本并指定设备编号。

## 原生播放测试

```powershell
node scripts/prepare-player-fixtures.mjs
node scripts/player-fixtures.mjs
node scripts/build-player-checks.mjs
```

测试服务只监听本机，素材是 FFmpeg 生成的合成 HLS。测试 APK 不增加正式 APK 的导出调试入口。通过 `adb reverse tcp:8754 tcp:8754` 连接本机服务，安装测试 APK，再执行 `am instrument -w com.fxl.freetv.test/com.fxl.freetv.test.PlayerChecks`。

测试覆盖真实解码、首帧、三秒缓存、验证上限、备用实例不打断当前播放、提交与回退、慢速候选和异常分片拒绝、取消验证。六秒是优化目标，按用户要求优先保证结果可信；后台验证上限初设十二秒，就绪后的进度对齐最多五秒，条件满足立即提交。首帧、缓存和下载余量门槛保持不变，分别记录耗时及不确定结果。Android TV 在手机端验收后继续适配与验证。
