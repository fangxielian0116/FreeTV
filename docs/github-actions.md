# GitHub Actions 在线构建

工作流在 GitHub 托管的 Ubuntu 22.04 上使用 Node.js 24 从仓库源码构建。自动检查使用 HBuilderX 5.26.2026091802，签名 APK 使用 JDK 17、Gradle 8.14.5 和 Android SDK 36。

## 自动检查与资源构建

推送 `main`、提交 PR 或手动运行 **Checks and resource builds**，执行 `npm ci`、类型检查、单元测试，安装 HBuilderX / Maven 依赖，编译当前 Kotlin 源码，再构建手机和 TV 的 H5 / Android 资源。输出 `phone-tv-resources` artifact，保留 7 天。

该工作流不需要账号或签名。Android 资源不是独立 APK。

## 配置 APK 打包

在仓库 **Settings → Secrets and variables → Actions → New repository secret** 中添加：

| Secret | 值 |
| --- | --- |
| `FREETV_DCLOUD_APPKEY` | 与 `src/manifest.json` 中的 AppID、Android 包名及原签名证书绑定的 DCloud Android 离线 AppKey |
| `ANDROID_KEYSTORE_BASE64` | 原 Android JKS / keystore 文件的 Base64 内容 |
| `ANDROID_KEY_ALIAS` | 证书别名 |
| `ANDROID_KEY_PASSWORD` | 私钥密码 |
| `ANDROID_STORE_PASSWORD` | 证书库密码 |

Windows 可复制证书的 Base64 到剪贴板，再粘贴进 Secret 输入框：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\android.jks')) | Set-Clipboard
```

沿用原签名，以便覆盖安装。密码、证书和真实签名配置不进入工作流源码、README 或 Issue。

## 生成与下载 APK

1. 打开 **Actions → Android APK → Run workflow**。
2. 在 `main` 上选择 `phone`、`tv` 或 `both`。
3. 工作流验证 Secrets、安装依赖、执行检查，再调用 `pack:offline` 对应的 Gradle 打包脚本。GitHub 托管的运行器完成编译和签名，无需登录 DCloud，也不占用云打包额度。
4. 成功后从运行页面 **Artifacts** 下载 `FreeTV-目标-运行编号`，内含签名 APK 与构建记录，保留 14 天。

签名文件不进入 artifact 或缓存；结束时清理临时签名配置。APK 工作流仅手动触发，不在 PR 上读取 Secrets，同一仓库的 APK 打包串行进行。

工作流从私有仓库的 `build-deps/dcloud-sdk` 依赖分支检出固定提交，校验 DCloud 离线 SDK 压缩包的 SHA-256 后解压到 `.tools/`。更新 SDK 时需同步更新依赖分支、工作流引用的提交与校验值，以及打包脚本中的 SDK 版本。SDK 获取与 AppKey 配置见 [本地构建与签名](build.md)。

## 排查

| 失败步骤 | 检查内容 |
| --- | --- |
| Validate required secrets | 五个 Secret 是否齐全、命名是否正确 |
| Install Android and Gradle build tools | Gradle 下载源是否可达，Android SDK 组件是否可安装 |
| Check out pinned DCloud offline SDK | SDK 依赖提交是否可访问 |
| Verify and extract DCloud offline SDK | 压缩包和 SHA-256 是否与工作流匹配 |
| Build signed APK | 编译日志、证书别名与密码、APK 签名和应用标识 |
| Artifact 上传 | 前一步是否真正生成 APK |

安装后若出现 AppKey 校验问题，请核对 AppKey 绑定的 AppID、包名和签名证书指纹，并在设备上验证应用启动。
