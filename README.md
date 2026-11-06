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
  <a href="#功能">功能</a> · <a href="#快速开始">快速开始</a> · <a href="#构建-apk">构建 APK</a> · <a href="#开发文档">开发文档</a> · <a href="#免责声明">免责声明</a>
</p>

FreeTV 使用 uni-app、Vue 3 和 TypeScript 构建界面，通过 UTS/Kotlin 接入 GSYVideoPlayer 与 Media3。手机与 TV 共用目录、收藏、进度和播放恢复逻辑，分别提供触屏与遥控器交互。

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

最低支持 Android 6.0。手机与 TV 当前共用包名 `com.fxl.freetv.demo`，在同一设备上安装时会覆盖已有版本。已有手机 APK 原生播放与 TV 模拟器验收记录；海信真机尚未验证。本机历史资料位于 `artifacts/`，不随源码提交。

## 快速开始

使用 Node.js **22.12+**（推荐 **24**）、npm 和仓库中的锁文件。

```powershell
git clone https://github.com/fangxielian0116/FreeTV.git
cd FreeTV
npm ci
npm run typecheck
npm test
npm run dev:h5
```

浏览器打开 <http://127.0.0.1:5173>。Windows PowerShell 如限制脚本执行，可将 `npm` 替换为 `npm.cmd`。

### 准备原生构建

安装 **HBuilderX 5.26.2026091802**，包含 App 开发、Android UTS 和内置 JDK/Kotlin。设置路径并准备资源构建所需的原生依赖：

```powershell
$env:FREETV_HBUILDERX = 'C:\Tools\HBuilderX\HBuilderX.exe'
npm run prepare:native
npm run check
```

也可使用默认目录 `.tools/HBuilderX-5.26/HBuilderX/`。完整 Kotlin 源码保存在仓库；Maven 依赖、classpath 和编译产物在新机器重新生成。Linux 使用官方完整 CLI 包，见 [本地构建与签名](docs/build.md)。

## 构建 APK

| 命令 | 用途 / 输出 |
| --- | --- |
| `npm run dev:h5` | 手机页面预览，端口 5173 |
| `npm run dev:tv` | TV 页面预览，端口 5174；需原生工具链 |
| `npm run prepare:native` | Maven 依赖与当前机器的原生 classpath |
| `npm run check` | 类型检查、测试、手机 H5 与 Android 资源构建 |
| `npm run build:tv:h5` | TV H5 资源 → `dist/build/tv-h5/` |
| `npm run build:tv` | TV Android 资源 → `dist/build/tv-app/` |
| `npm run pack:offline` | 用 Gradle 离线生成手机和 TV 的签名 APK → `artifacts/offline/` |
| `npm run pack:android` | 仅打手机 APK → `artifacts/offline/phone/FreeTV-0.3.4-phone.apk` |
| `npm run pack:tv` | 仅打 TV APK → `artifacts/offline/tv/FreeTV-0.3.4-tv.apk` |

`build:android` 和 `build:tv` 生成应用资源。所有 APK 打包命令都使用同一套 Gradle 流程，读取 `src/`、DCloud Android 离线 SDK、离线 AppKey 和签名配置。已有安装需要沿用原签名。详见 [本地构建与签名](docs/build.md)。

在 GitHub 上手动运行 **Android APK**，可由 GitHub Actions 使用 Gradle 构建和签名手机、TV 或双端 APK。打包完成后在工作流页面下载产物。配置步骤见 [GitHub Actions 在线构建](docs/github-actions.md)。

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
