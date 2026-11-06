# 本地构建与签名

## 工具与依赖

使用 Node.js 24（最低 22.12）和 HBuilderX 5.26.2026091802。DCloud npm 依赖已按 uni-app 5.26 成组锁定，不要单独升级一个包。

Windows 安装 HBuilderX 及 App 开发、Android UTS 和内置 JDK/Kotlin 组件，然后执行：

```powershell
$env:FREETV_HBUILDERX = 'C:\Tools\HBuilderX\HBuilderX.exe'
npm ci
npm run prepare:native
npm run typecheck
npm test
npm run build:h5
npm run build:android
npm run build:tv:h5
npm run build:tv
```

`prepare:native` 从 Maven Central 和 Google Maven 下载固定版本依赖，生成 `.cache/native-check/classpath.txt`。该文件包含当前机器的绝对路径，必须在新机器重新生成。`build` 会将仓库的 Kotlin 源码编成 JAR，再放入本次生成的 staging 目录。

Linux 使用 [官方 HBuilderX Linux CLI 完整包](https://hx.dcloud.net.cn/Tutorial/install/linux-cli)，设置 `FREETV_HBUILDERX` 为解压目录下的 `HBuilderX`。GitHub Actions 自动安装工具链。

## Gradle 离线打包

手机和 TV 共用 `src/` 中的应用源码、包名和版本，分别生成触屏和遥控界面的 APK。npm 编译器生成前端资源和 UTS 的 Kotlin 源码，打包脚本将这些产物和 `scripts/android/gradle/` 中的配置模板组装成 `.cache/` 下的临时工程。首次准备 Gradle 依赖需要联网。

1. 准备 JDK 17 或更新版、Gradle 8.14.5、Android SDK Platform 36 和 Build Tools 36.0.0。
2. 从 [DCloud Android 离线 SDK 历史版本](https://nativesupport.dcloud.net.cn/AppDocs/download/android.html) 获取 `Android-SDK_5.26.82680_20260914.zip`，解压后应包含 `SDK/libs` 和 `SDK/assets/data`。
3. 为 `__UNI__E70B510` 和 `com.fxl.freetv.demo` 按原证书的 SHA-1 和 SHA-256 指纹配置 [Android 离线 AppKey](https://nativesupport.dcloud.net.cn/AppDocs/usesdk/appkey)。把值保存到 `.signing/dcloud-appkey.txt`，或通过 `FREETV_DCLOUD_APPKEY` 提供。继续使用下节的 `.signing/android-test.json` 签名配置。

```powershell
$env:JAVA_HOME = 'C:\Tools\jdk-17'
$env:ANDROID_HOME = 'C:\Tools\AndroidSDK'
$env:FREETV_GRADLE_HOME = 'C:\Tools\gradle-8.14.5'
$env:FREETV_DCLOUD_ANDROID_SDK = 'C:\Tools\DCloud-Android-SDK-5.26'
npm ci
npm run pack:offline
```

默认工具目录为 `.tools/AndroidSDK`、`.tools/gradle-8.14.5` 和 `.tools/DCloud-Android-SDK-5.26`。`JAVA_HOME` 未设置时使用已安装 HBuilderX 的 JDK。`npm run pack:android` 和 `npm run pack:tv` 分别通过同一脚本打一个版本。通过签名、包名、版本和启动入口检查后，APK 与校验记录会写入 `artifacts/offline/phone/` 和 `artifacts/offline/tv/`。

在已装有历史版本的手机和 TV 模拟器上覆盖安装新 APK，验证应用启动、原生播放和 TV 遥控入口。按[设备测试说明](device-setup.md)准备测试素材和模拟器后，运行对应验收脚本。

```powershell
.\scripts\check-phone-release.ps1
.\scripts\check-tv-release.ps1
```

离线 SDK、AppKey、签名和打包产物保存在本机忽略目录。

## Android 签名

已有安装必须沿用原来的证书。将证书保存在本机 `.signing/`，并创建 `.signing/android-test.json`：

```json
{
  "certalias": "your-key-alias",
  "certfile": "C:/path/to/FreeTV/.signing/android.jks",
  "certpassword": "your-key-password",
  "storepassword": "your-keystore-password"
}
```

示例值均需替换。首次独立部署且没有历史签名时，可用 `node scripts/prepare-android-signing.mjs` 创建测试证书，不会覆盖已有签名。

## 源码上传范围

源码、原生模块、品牌资源、依赖锁文件、构建脚本、测试和文档进入 Git。

`.gitignore` 排除依赖、SDK / 工具、staging、构建产物、调研下载、日志、环境配置、签名与证书。安装和构建步骤重新生成派生文件。离线 AppKey 和签名由本机配置或 [GitHub Secrets](github-actions.md) 提供。
