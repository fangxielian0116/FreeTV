# 本地构建与签名

## 工具与依赖

使用 Node.js 24（最低 22.12）和 HBuilderX 5.26.2026091802。DCloud npm 依赖已按 uni-app 5.26 成组锁定，不要单独升级一个包。

Windows 安装 HBuilderX 及 App 开发、Android UTS、内置 JDK/Kotlin 和安心打包组件，然后执行：

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

## 签名与 APK

打开 HBuilderX，登录有权使用 AppID `__UNI__E70B510` 的 DCloud 账号。使用官方 [CLI 安心打包](https://hx.dcloud.net.cn/cli/pack)，需要账号权限及可用打包配额。

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

```powershell
npm run pack:android
npm run pack:tv
```

手机输出 `artifacts/phone/FreeTV-0.2.1-phone.apk`，TV 输出 `artifacts/tv/FreeTV-0.3.2-tv.apk`，同时记录源码、原生输入及 APK 哈希。需要看到最终文件和成功记录，单凭 CLI 返回码不能确认打包成功。

## 源码上传范围

源码、原生模块、品牌资源、依赖锁文件、构建脚本、测试和文档进入 Git。

`.gitignore` 排除依赖、SDK / 工具、staging、构建产物、调研下载、日志、环境配置、签名与证书。安装和构建步骤重新生成派生文件；账号和签名由本机配置或 [GitHub Secrets](github-actions.md) 提供，不上传开发电脑的登录状态或 classpath。
