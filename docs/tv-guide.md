# TV 版开发与验收

TV 目标为独立 APK，包名与现有安装一致：`com.fxl.freetv.demo`，沿用本机签名。TV 版本为 0.3.2 / 302，手机源码清单保留 0.2.1 / 201；TV 包可覆盖电视上原有版本。两种界面通过构建常量隔离，不依赖国产电视是否声明 leanback。

## 构建

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build:tv
npm.cmd run build:tv:h5
npm.cmd run pack:tv
```

HBuilderX 未运行时，先执行 `.tools/HBuilderX-5.26/HBuilderX/cli.exe open`。TV 构建在 `.cache/android-tv-stage` 生成独立清单、横屏配置、普通/leanback 启动入口和 banner；不会修改手机清单及手机 APK。签名数据继续只从本机 `.signing` 读取。

云端排队期间若继续调整页面，使用 `node scripts/build-tv.mjs --preview` 生成独立预览构建目录，避免覆盖正在打包的目录。云端原生包返回后执行 `node scripts/finalize-tv.mjs` 合入当前 UI。该命令检查源码和编译产物指纹、原生源码哈希、签名一致性及全部原生 dex/so 保持不变。TV 原生代码有变化时，必须重新安心打包。

最终包为 `artifacts/tv/FreeTV-0.3.2-tv.apk`；`tv-build-receipt.json` 记录对应源码、原生基座及最终包校验值。`FreeTV-TV-UI-preview.apk` 只使用手机原生基座，不能作为 TV 发布包。

TV staging 使用内置 Kotlin 编译器将当前播放器源码编成 JAR，通过 [uni-app 官方 libs 入口](https://uniapp.dcloud.net.cn/plugin/uts-plugin.html#libs) 打包，避免 HBuilderX 5.26 的 Kotlin 声明生成器解析私有实现时异常退出。仓库保留全部 Kotlin 源码；仅 staging 中移除重复源码。原生库的源码和 JAR 哈希写入构建记录，依赖仍沿用原有 GSY/Media3 配置。

首页的搜索入口与 Logo、导航放在同一行，导航中不再另设搜索按钮。提交搜索后收起键盘，结果占据页面并将焦点移到第一张海报；可用“修改搜索”恢复当前关键词。播放器控制栏仅保留上一集、下一集及带当前倍率的倍速按钮，错误时增加重试。隐藏控制栏时确认键暂停/继续，左右仅显示短暂进度提示，上下打开控制栏；返回先收起已打开的控制栏，再返回详情选集。

## 模拟器

本机新增 `FreeTV_TV` AVD：官方 Android TV API 30 x86 镜像、`tv_1080p` 配置、2GB 内存、无触屏硬件、D-pad。使用独立设备端口 5556 与项目 ADB 服务 5038，不修改原有手机 AVD。

```powershell
.\scripts\start-tv-emulator.ps1 # 显示 TV 模拟器窗口
.\scripts\start-tv-emulator.ps1 -Headless
node scripts/player-fixtures.mjs
node scripts/build-player-checks.mjs
.\scripts\check-tv-release.ps1
```

启动脚本会等待 TV 开机并检查虚拟 Wi-Fi。此网络下默认 Google HTTPS 联网检测超时，会使 Android 11 将 `AndroidWifi` 标记为无互联网并禁止自动连接；脚本仅为 `FreeTV_TV` AVD 配置可达的华为 HTTP/HTTPS 204 检测地址，并在需要时重连，保留 HTTPS 联网校验。模拟器已运行时也可再次执行脚本修复连接，不修改电脑或实体电视的网络设置。

播放器测试使用已有本机合成 HLS 素材，服务仅监听 127.0.0.1:8754。正式 APK 不包含测试入口；安装的测试 APK 使用同一签名访问目标应用。正式验收必须安装普通 `freetv-player-checks.apk`，不能使用带源码覆盖的 overlay 测试 APK。

测试脚本核对安装后 APK 哈希，验证覆盖安装，以及 720p/213dpi、1080p/320dpi、4K/640dpi 和 1080p/240dpi。所有页面操作均注入 Android 按键，长按确认键使用 D-pad 设备来源；截图输出至模拟器 Download/FreeTV。

## 热门片名

片名来自豆瓣公开电影/剧集分类，与播放源独立。每类最多 100 条，优先电影热门、剧集热门、国产剧、最新电影；随后补充地区剧集、动画、综艺和纪录片。每次冷启动异步更新一轮，立即使用已有本地词库；普通后台返回不重新同步，播放/后台期间暂停，返回后仅继续当前轮未完成的分类。取消周期定时器；请求失败保留旧库，本轮不自动重试，可手动更新或下次冷启动再试。新的冷启动从优先热门分类开始，避免次要分类失败阻塞热门更新。

只存名称、豆瓣 ID、类型和榜单次序等索引字段，不下载封面或逐片详情。保留近 90 天热门，最多一万条，双快照校验与回退。接口变化、网络故障时保留旧词库并重试，不增加常驻服务。可运行 `node node_modules/tsx/dist/cli.mjs scripts/check-tv-titles.ts` 实测来源。

搜索支持中文片段、繁简、全拼与简拼；选择联想后将中文片名交给现有视频源搜索，不把词库条目当成可播放资源。系统中文输入单独启用，片库弹窗直接使用方向键选择，避免输入法抢焦点。

## 真机边界

模拟器结果不代表海信固件、WebView 或硬件解码器完全一致。海信真机需另外检查：电视桌面图标、六列布局及屏幕边缘、长按遥控器、系统输入法、休眠恢复、声音、画面比例和实际视频解码。模拟器证据与真机结果分开记录。
