# 手机与 TV 的共享功能

`E:\FreeTV` 是唯一的源码项目。HBuilderX 中的 `android-stage` 和 `android-tv-stage` 是打包脚本生成的目录，分别产出手机、TV 安装包；不要在 `.cache` 目录中修改功能，重新构建时其中内容会被替换。

| 修改内容 | 修改位置 | 生效范围 |
| --- | --- | --- |
| 连播、切集、保存进度、重试和播放恢复 | `src/pages/player/player.vue`、`src/domain`、`src/services` | 手机和 TV 共用 |
| 视频解码、缓冲、播放状态和原生桥接 | `src/uni_modules/freetv-player/utssdk/app-android` | 手机和 TV 共用 |
| TV 遥控器和播放控制栏 | `TVPlaybackControls.kt`，通过 `uiMode: tv` 启用 | TV |
| TV 大屏和焦点、字母键盘 | `src/components/TV*.vue`、`src/styles/tv.css` | TV |
| 构建入口和清单 | `scripts/prepare-android-stage.mjs`、`scripts/build-tv.mjs` | 按构建目标生成 |

原生播放器也只有一份源码。两端构建将同一份 Kotlin 实现编成原生库；构建记录保存输入哈希和签名，避免生成目录里的临时改动混入交付。

## 自动播放下一集

手机和 TV 使用同一个播放页面控制器：原生播放器发出 `ended` 后，保存本集完成状态，按当前线路的剧集顺序打开下一集，起始进度为 0。播放速度由原生播放会话保留。暂停、缓冲、错误及旧会话的通知不会触发连播；同一会话重复通知也只处理一次，避免连跳或最后一集重复返回。最后一集播放完成后返回详情选集页，不循环到第一集或跳到另一条线路。

顺序判断和完成通知去重在 `src/domain/episode-navigation.ts`，页面调用保留在共用的 `src/pages/player/player.vue`。`tests/episode-navigation.test.ts` 会执行该页面的实际控制代码，分别覆盖手机和 TV 模式，原生 I/O 由测试替代；正式 APK 另做原生结束事件和进度持久化验收。

以后添加“跳过片头片尾”“统一播放设置”等通用需求，只改上述共享层并同时跑两种模式的测试。交互和布局不同的部分留在各自界面适配中，避免把业务逻辑复制成两份。手机 0.2.1 和 TV 0.3.2 已分别打包，均包含同一份共用连播逻辑。手机搜索保持触屏输入方式，仅修正搜索提示，并从手机构建中排除 TV 词库与遥控组件。
