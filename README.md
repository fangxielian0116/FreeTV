<p align="center">
  <img src="src/static/brand/icon-1024.png" alt="FreeTV" width="96" height="96">
</p>
<h1 align="center">FreeTV</h1>
<p align="center">面向 Android 手机与电视的影视目录和原生播放器。</p>
<p align="center">
  <a href="https://github.com/fangxielian0116/FreeTV/actions/workflows/ci.yml"><img src="https://github.com/fangxielian0116/FreeTV/actions/workflows/ci.yml/badge.svg" alt="构建检查"></a>
  <img src="https://img.shields.io/badge/Android-6.0%2B-3DDC84?logo=android&logoColor=white" alt="Android 6.0 及以上">
  <img src="https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white" alt="TypeScript 5.6">
</p>
<p align="center">
  <a href="#下载安装">下载安装</a> · <a href="#功能">功能</a> · <a href="#快速开始">快速开始</a> · <a href="#编译与打包">编译与打包</a> · <a href="#开发文档">开发文档</a>
</p>

FreeTV 使用 uni-app、Vue 3 和 TypeScript 构建界面，通过 UTS/Kotlin 接入 GSYVideoPlayer 与 Media3。手机与 TV 共用目录、收藏、进度和播放恢复逻辑，分别提供触屏与遥控器交互。

## 下载安装

在 GitHub Releases 下载已签名的 APK。仓库为私有仓库，下载需要登录有访问权限的 GitHub 账号。[下载最新版](https://github.com/fangxielian0116/FreeTV/releases/latest)

- **Android 手机**用 `FreeTV-<版本>-phone.apk`，支持触屏操作。
- **Android TV** 用 `FreeTV-<版本>-tv.apk`，支持遥控器和电视桌面入口。

最低支持 Android 6.0。两个版本共用包名 `com.fxl.freetv.demo`，同一设备上只能安装其中一个。覆盖升级需沿用原签名。

## 功能

- **国内外影视资源**，汇集西瓜、魔都、非凡等第三方公开片源，涵盖国产剧、港台剧、日韩剧、欧美剧等国内外主流影视内容，并支持浏览电影、综艺和动漫。
- **目录与搜索**：分类浏览、搜索、详情和选集；设置中可选自动或固定片库。
- **原生播放**：播放、暂停、倍速、切集、进度保存和自动播放下一集。
- **本机记录**：收藏、观看历史和进度保存在设备上，并绑定对应来源。
- **播放恢复**：匹配同剧同集、验证备用视频后尝试接力；无法确认时保留当前状态。
- **TV 交互**：横屏界面、方向键焦点、原生播放器按键，以及繁简、全拼、简拼片名联想。
- **配置更新**：静态片源清单、双快照回退，失败保留最近有效配置。

## 平台与状态

| 目标 | 源码版本 | 说明 |
| --- | --- | --- |
| Android 手机 | 0.3.4 / 304 | 触屏界面、原生播放器 |
| Android TV | 0.3.4 / 304 | 横屏界面、遥控器交互 |
| H5 | 开发预览 | 页面调试，不能替代 Android 原生播放验收 |

手机原生播放和 TV 模拟器已有验收记录。海信真机尚未验证。

## 快速开始

使用 Node.js **22.12+**（推荐 **24**）、npm 和仓库中的锁文件。

```powershell
git clone https://github.com/fangxielian0116/FreeTV.git
cd FreeTV
npm ci
npm run dev:h5
```

浏览器打开 <http://127.0.0.1:5173>。Windows PowerShell 如限制脚本执行，可将 `npm` 替换为 `npm.cmd`。

## 编译与打包

### GitHub Actions 构建签名 APK

在仓库打开 **Actions → Android APK → Run workflow**，选择 `main` 和目标 `both`、`phone` 或 `tv`。成功后在该次运行的 **Artifacts** 下载签名 APK。首次配置需要离线 AppKey、Android 签名 Secrets 和固定版本的 SDK 附件。[GitHub Actions 配置说明](docs/github-actions.md)

### 本地构建签名 APK

准备 **JDK 17+、Gradle 8.14.5、Android SDK Platform 36、Build Tools 36.0.0、DCloud Android 离线 SDK 5.26.82680_20260914**，以及与包名和签名证书匹配的离线 AppKey。签名和工具路径按详细说明配置。[本地构建与签名](docs/build.md#gradle-离线打包)

```powershell
npm ci
npm run pack:offline
```

| 目标 | 命令 | APK 输出 |
| --- | --- | --- |
| 手机与 TV | `npm run pack:offline` | 下列两个目录 |
| 仅手机 | `npm run pack:android` | `artifacts/offline/phone/` |
| 仅 TV | `npm run pack:tv` | `artifacts/offline/tv/` |

本地和 GitHub Actions 共用同一套 Gradle 打包流程。首次下载工具和依赖需要联网，打包无需登录 DCloud。

### 开发检查与资源编译

用 `npm run typecheck` 和 `npm test` 检查代码。编译 H5 和 Android 资源前，先配置 HBuilderX **5.26.2026091802** 和 Android UTS 组件，再运行 `npm run prepare:native`。[原生工具链配置](docs/build.md#工具与依赖)

| 目标 | H5 资源 | Android 资源 |
| --- | --- | --- |
| 手机 | `npm run build:h5` → `dist/build/h5/` | `npm run build:android` → `dist/build/app/` |
| TV | `npm run build:tv:h5` → `dist/build/tv-h5/` | `npm run build:tv` → `dist/build/tv-app/` |

以上命令输出资源。可安装的签名 APK 由 `pack:*` 命令生成。

## 项目结构

```text
src/components/                  手机与 TV 界面组件
src/data/                        内置片名联想词库
src/domain/                      分类、匹配、剧集导航与恢复规则
src/services/                    目录、配置、收藏、历史和进度
src/pages/                       首页、搜索、详情、设置和播放页
src/platform/                    平台适配和播放器桥接
src/uni_modules/freetv-player/    UTS / Kotlin 原生播放器
scripts/                         构建、打包与验证工具
scripts/android/gradle/          打包用 Gradle 和 Android 配置模板
tests/                           业务逻辑和 Android 测试
docs/                            构建、交互和实现说明
.github/workflows/               持续集成工作流
```

手机与 TV 共用 `src/` 中的应用源码。打包脚本按目标生成 `.cache/` 中的临时 Gradle 工程。依赖、工具、缓存、调研资料、签名、日志和构建产物通过 `.gitignore` 排除。

## 开发文档

- [本地构建与签名](docs/build.md)
- [GitHub Actions 在线构建](docs/github-actions.md)
- [Android 构建与设备测试](docs/device-setup.md)
- [TV 开发、遥控器和验收](docs/tv-guide.md)
- [手机与 TV 的共享功能](docs/shared-mobile-tv.md)
- [播放器与恢复机制](docs/playback.md)

提交改动前运行 `npm run typecheck` 和 `npm test`；涉及原生代码时，还需对应资源构建、APK 打包和设备验收。报告问题时附上版本、设备型号、复现步骤及去除敏感信息后的日志。

## 依赖与致谢

- [uni-app](https://github.com/dcloudio/uni-app)、[Vue](https://github.com/vuejs/core)：跨端界面与组件。
- [GSYVideoPlayer](https://github.com/CarGuo/GSYVideoPlayer) 14.0.0 与 [AndroidX Media3](https://github.com/androidx/media) 1.10.1：原生播放与 HLS。
- [video_freevip](https://github.com/whyyy-404/video_freevip)：公开片源清单数据，不执行远程脚本。
- [js-spatial-navigation](https://github.com/luke-chang/js-spatial-navigation)：TV 空间焦点导航。
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro)、[opencc-js](https://github.com/nk2028/opencc-js)：拼音检索与繁简处理。

第三方依赖遵循各自的许可证。

## 免责声明

FreeTV 提供影视目录检索和播放工具。片名、封面、简介及播放链接均来自第三方公开网络，视频由各来源站点提供和托管。FreeTV 独立于这些片源及相关视频平台，影视内容和品牌标识的权利归各自权利人所有。

请仅访问和播放你有权使用的内容。资源可用性取决于第三方服务及网络环境。
