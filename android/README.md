# 旅界 Android（WebView 壳，复用桌面端 `app/` 引擎）

本目录是 **WebView 壳**：不包含任何游戏逻辑，加载与 Windows 桌面端同一套 `app/` 引擎（ESM）。
壳层由 `app/src/main/java/com/lvjie/app/MainActivity.kt` 实现，核心是两件事：

1. 内嵌一个 **本地静态服务器**（`ServerSocket`，`127.0.0.1`），从 APK assets 里出 `www/` 静态资源；
2. 向页面注入 **`window.awHost` 桥**，LLM 请求与 API Key 存取都走该桥（与桌面 Electron 端口径一致）。

当前版本：**versionCode 13 / versionName 0.4.0**（与根 `package.json` 的 `version` 一致）。

## 环境要求

- **JDK 17**（`compileOptions` source/target 与 Kotlin `jvmTarget` 均为 17）
- **Android SDK 35**（`compileSdk = 35`、`targetSdk = 35`；`minSdk = 24`），设置 `JAVA_HOME` / `ANDROID_HOME`
- Node.js（仅用于跑 `scripts/sync-android.js` 同步资源）
- Gradle：使用目录内 `gradlew` / `gradlew.bat` 即可

## 目录结构

```
android/
├─ app/src/main/java/com/lvjie/app/MainActivity.kt   # 壳：本地静态服 + awHost 桥 + 密钥加密存储
├─ app/src/main/assets/www/                          # ⚠ 同步产物（勿手改），见下文「资源同步」
├─ app/src/main/res/xml/network_security_config.xml  # 明文流量仅放行 localhost / 127.0.0.1
└─ app/src/main/AndroidManifest.xml                  # INTERNET 权限、networkSecurityConfig
```

## 构建步骤

```bash
# 1) 先同步资源（必做，见「资源同步」）
node scripts/sync-android.js

# 2) 构建
cd android
./gradlew assembleDebug      # Windows 下用 gradlew.bat assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
# 用途：本地调试、快速验证

./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
# 用途：对外分发（根 README 的发布口径；release 使用 debug 签名配置，未开启混淆）
```

两个变体都可用：**debug** 用于日常开发调试，**release** 用于出分发包（根 `README.md` 的构建命令即 `assembleRelease`）。两者产物均在 `app/build/outputs/apk/{debug,release}/` 下。

## 与桌面版的差异

### 本地静态服务器（替代 WebViewAssetLoader / file://）

实现**不是** `WebViewAssetLoader`（`https://appassets.androidplatform.net/...` 是旧文档的说法，已废弃）：

- `startLocalServer()` 启动一个 `ServerSocket` 绑定 `127.0.0.1`：优先端口 **8765**，被占用时回退到系统分配的随机端口；
- WebView 加载 `http://127.0.0.1:$port/index.html`；
- 静态文件从 APK assets 的 `www/` 目录读出（路径经 URL 解码以支持中文文件名，拒绝 `..` 路径穿越，按扩展名给出 MIME，含 `.mid`/`.mp3`）；
- 服务器仅在进程存活期间监听，`onDestroy()` 时关闭。

### `awHost` 桥（LLM 不直连网络）

页面注入完整 `window.awHost`，与桌面 Electron 端同一套 API；LLM 调用走该桥而不是页面 `fetch`：

- **`awHost.http`**
  - `request({url, method, headers, body, timeoutMs})` → Promise（非流式，底层 `AndroidHttp.httpRequest`）
  - `stream({url, method, headers, body, timeoutMs})` → `{ok, id}`（流式，底层 `AndroidHttp.httpStream`，SSE 文本按 chunk 透传，解析在 JS 层）
  - `abort(id)` → 取消进行中的流
  - `onChunk(fn)` / `onEnd(fn)`（及 head 回调）→ 注册流式事件订阅，返回退订函数
- **`awHost.secrets`**：`save(payload)` / `load()` / `clear()`（底层 `AndroidHttp.secretsSave/secretsLoad/secretsClear`）——API Key 加密存取，见下「安全说明」。

桥**只注入到本机静态服页面**（`isTrustedPage`：`http://127.0.0.1` 或 `http://localhost`），其他页面拿不到 `awHost`。非本机地址一律不加载（`shouldOverrideUrlLoading` 只放行 `127.0.0.1`）。

### 其他差异

- **存档**：localStorage（WebView `domStorageEnabled`，持久化在应用私有数据中）；**API Key 不进 localStorage**，走 `awHost.secrets` 加密存储。
- **文件选择**：`WebChromeClient.onShowFileChooser` 支持导入/导出文件。
- **MIDI**：无系统 MIDI 代理时 MIDI 可能降级；可用 mp3 / 自定义本地音频。
- WebView 设置：`allowFileAccess=false`、`allowContentAccess=false`、`mixedContentMode=MIXED_CONTENT_NEVER_ALLOW`、`LOAD_NO_CACHE`、`mediaPlaybackRequiresUserGesture=false`；竖屏、软键盘 `adjustResize`。

## 资源同步（重要）

`app/src/main/assets/www/` 是 **`scripts/sync-android.js` 的同步产物**，不是源码：

- 该脚本会**整目录清空重拷**：把仓库根 `app/` → `android/app/src/main/assets/www/`，再把仓库根 `assets/`（音乐/图标等）→ `www/assets/`。
- **改了 `app/`（或根 `assets/`）之后，必须先执行 `node scripts/sync-android.js`，再重新 `assemble`**；否则 APK 里打进的还是旧的 `www/`，两端行为会分叉。
- 不要直接编辑 `assets/www/` 下的文件，改动会在下次同步时被覆盖。

## 安全说明

- **HTTP 桥 SSRF 防护**（`isAllowedApiUrl`）：
  - 仅允许 `http`/`https`；拒绝空 host 及 `0.0.0.0`、`169.254.169.254`、`metadata.google.internal` 等元数据/链路本地地址；
  - 本机地址（`localhost`/`127.0.0.1`/`::1`）允许 `http`，**对外只允许 `https`**；
  - 允许的方法仅 `GET/POST/PUT/PATCH/DELETE/HEAD`；超时限制在 1s–180s（`coerceIn(1000, 180000)`）。
- **重定向逐跳校验**：关闭 `instanceFollowRedirects`，手动跟随最多 5 跳，**每一跳**都重新做地址白名单校验，防 30x 绕过；303/301/302 触发降级为 `GET` 并丢弃 body。
- **跨 origin 剥认证头**：`httpRequest` 重定向跨 origin（host+protocol 变化）时丢弃 `Authorization` / `Cookie` / `Proxy-Authorization`，防 Bearer Key 外带（注意：`httpStream` 的重定向目前仅做地址白名单校验，未剥认证头）。
- **明文流量约束**：`AndroidManifest.xml` 虽写 `usesCleartextTraffic="true"`，但实际由 `network_security_config.xml` 约束——`base-config` 禁止明文，**仅** `localhost` / `127.0.0.1` 放行明文（即本机静态服），对外 API 一律 https；WebView 侧还叠加了 `MIXED_CONTENT_NEVER_ALLOW`。
- **API Key 加密存储**：`Android Keystore` 生成 AES-256 密钥（alias `lvjie_apikeys_v1`），`AES/GCM/NoPadding`（128-bit tag）加密后以 `iv:密文` 存入应用私有 SharedPreferences（`lvjie_secrets`）；密钥明文**绝不落 localStorage**（保存时顺带清除可能的历史明文键 `agentworlds_apikeys_v1`），应用 `allowBackup="false"`。
- **桥注入面**：`awHost` 仅注入 `127.0.0.1`/`localhost` 的本机页面；WebView 禁用文件/内容访问。
