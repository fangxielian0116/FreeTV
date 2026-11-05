# GitHub Actions 在线构建

工作流运行于 GitHub 托管的 Ubuntu 22.04，使用 Node.js 24 和官方 HBuilderX 5.26.2026091802 Linux 完整 CLI 包。从仓库源码构建，不需要开发电脑在线。

## 自动检查与资源构建

推送 `main`、提交 PR 或手动运行 **Checks and resource builds**，执行 `npm ci`、类型检查、单元测试，安装 HBuilderX / Maven 依赖，编译当前 Kotlin 源码，再构建手机和 TV 的 H5 / Android 资源。输出 `phone-tv-resources` artifact，保留 7 天。

该工作流不需要账号或签名。Android 资源不是独立 APK。

## 配置 APK 打包

在仓库 **Settings → Secrets and variables → Actions → New repository secret** 中添加：

| Secret | 值 |
| --- | --- |
| `DCLOUD_USERNAME` | 有权使用当前 AppID 的 DCloud 登录账号 |
| `DCLOUD_PASSWORD` | DCloud 登录密码 |
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
3. 工作流验证 Secrets、安装依赖、执行检查，登录 DCloud 并运行安心打包。
4. 成功后从运行页面 **Artifacts** 下载 `FreeTV-目标-运行编号`，内含签名 APK 与构建记录，保留 14 天。

签名文件不进入 artifact 或缓存；结束时清理临时签名配置。APK 工作流仅手动触发，不在 PR 上读取 Secrets，同一仓库的 APK 打包串行进行。

## 排查

| 失败步骤 | 检查内容 |
| --- | --- |
| Validate required secrets | 六个 Secret 是否齐全、命名是否正确 |
| 安装工具或 Maven 依赖 | 官方下载源是否可达，重跑失败任务 |
| 原生编译 | HBuilderX 版本、路径及 Kotlin 错误 |
| DCloud login | 账号密码、账号验证和 AppID 权限 |
| 安心打包 | DCloud 配额、平台支持、证书别名与密码 |
| Artifact 上传 | 前一步是否真正生成 APK |

账号验证、AppID 权限和配额需由账号所有者配置。完成 Secrets 后，实际跑通一次 **Android APK** 才能确认该账号的在线 APK 打包已验收；资源构建成功不能替代此步骤。

参考：[官方 Linux CLI](https://hx.dcloud.net.cn/Tutorial/install/linux-cli)、[登录命令](https://hx.dcloud.net.cn/cli/user)、[云打包与 CI](https://hx.dcloud.net.cn/cli/pack)。
