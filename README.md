<div align="center">

# 旅界（LvJie）

**AI 驱动的多世界观开放世界文字游戏**

[简体中文](README.md) · [English](README.en.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Android-blue.svg)](https://github.com/Fly143/LvJie-WanJie/releases)
[![Release](https://img.shields.io/badge/release-v0.4.0-blue)](https://github.com/Fly143/LvJie-WanJie/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848f.svg)](https://www.electronjs.org/)

选择修仙 / 玄幻 / 武侠 / 职场 / 末世 / 西幻，接入自定义大模型 API，实时生成剧情与数据变化。

</div>

---

## 功能

- 六套完整世界观包：等级表、货币、场景行动、升级动词、主题皮肤、AI 铁律
- **自定义世界包**：JSON 导入，或按书名/设定用 AI 生成草稿（欢迎页「🛠 自定义世界」）
- 自定义模型接入：Base URL + API Key + 模型，协议支持 **chat** / **response**
- **内置免费通道**：无配置时自动探测可用免费模型并开箱即用；自己填 Key 时不会被覆盖
- 可「刷新模型列表」从 `GET {Base URL}/models` 拉取选用
- 事件循环：行动 / 选项 / 自由输入 → JSON `changes` 自动落库（货币、进度、物品、地图、同伴、任务）
- AI 风格四档可调：开挂 / 慷慨 / 正常 / 艰难（设置里切换，实时改变判定松紧与奖励厚薄）
- 委托任务可追踪：接取/完成/失败进侧栏「任务」，奖励同步写入数值
- 背景音乐支持 mp3 与 **MIDI**（Web Audio 合成）
- chat 协议流式输出；changes 单轮数值熔断；设置里可导出/导入存档 JSON（不含 Key）
- 人物记忆：同伴/场景 NPC 进存档；点名找人时按需注入档案
- **同伴同行与队伍**：邀请同伴随行后随你移动、始终在场；队伍栏显示队伍战力/同行天数/近况，每人每天可「切磋交流」；同伴年龄随游戏天数推进
- **界面多语言**：简体中文 / 繁體中文 / English / 日本語
- 按世界观独立存档槽，切换世界即读档
- API Key 加密保存（桌面 safeStorage / 安卓 Android Keystore），不入存档

## 目录

| 路径 | 说明 |
|------|------|
| `app/` | 游戏本体（HTML/CSS/ESM JS） |
| `app/js/engine/` | 引擎：存档、进度、背包、地图、提示词、LLM、i18n |
| `app/js/engine/book-ingest.js` | 整本抽样与设定合并 |
| `app/js/engine/book-web.js` | 联网补充（维基/设定页） |
| `app/js/engine/worldpack.js` | 声明式世界包 schema（校验 / 草稿提示词） |
| `app/js/engine/custom-packs.js` | 自定义世界包存取 |
| `app/js/worldviews/` | 内置世界观包（词表 / 数值 / 地图 / 规则） |
| `main.js` / `preload.js` | Electron 主进程 / 渲染桥 |
| `android/` | Android WebView 壳（与 `app/` 共用引擎） |
| `runtime/` | 官方 Electron 发行版 + 同步后的游戏本体（**不入库**） |
| `scripts/` | 启动、同步/重建 runtime、冒烟脚本 |

## 运行

### Windows（免构建）

从 [Releases](https://github.com/Fly143/LvJie-WanJie/releases) 下载 `LvJie-*-win-x64.zip`，解压后双击 **`AgentWorlds.exe`**。

### Linux / 开发机（免打包）

```bash
npm install
npx electron .
```

（`electron` 仅开发依赖；游戏本体为原生 ESM，无 bundler。）

### Windows 本地从源码启动

```bash
npm start    # 同步 app/ → runtime/resources/app/ 并拉起 AgentWorlds.exe
```

若缺少 `runtime/`：`npm run rebuild:runtime`（可用 `AW_ELECTRON_ZIP` 指定官方 Electron zip）。

开发中只更新资源：`npm run sync`

## API 配置

**开箱即用：内置免费通道**。首次启动且没有任何配置时，应用会自动拉取上游免费模型名单并逐个探测，取第一个可用的作为默认——无需自备 Key。调用失败（403/426/429 等）会自动切换到下一个免费模型。免费名单由上游随时更换：**每次启动都会拉一次最新名单**，名单没变就跳过连接测试（`GET /models` 不占对话额度），名单变了才重新测。

API 设置里是两种使用方式，顶部切换：

| 方式 | 说明 |
| --- | --- |
| **内置免费** | 从探测到的免费模型里挑一个（默认取第一个可用的），可点「通道自检」重新探测；一键启用。上游额度约 **100 次/天**（次日重置），面板会显示本机今日已用次数 |
| **自定义** | 自己的 Base URL / API Key / 模型，支持保存多条配置并切换；可点「测试连接」验证是否真的能用 |

> 内置通道通过注入客户端指纹工作，属**实验性**：上游一调整校验就可能整体失效，届时请改用自己的 API Key。额度用完（429 `FreeUsageLimitError`）时会明确提示原因与已用次数，建议此时换用自己的 Key 继续；内置通道可用时也建议自备 Key（更稳、模型可选、没有日限）。

用自己的模型时，**自定义**面板里：

1. 选择协议
   - `chat` → `POST {Base URL}/chat/completions`
   - `response` → `POST {Base URL}/responses`
2. 填写 Base URL、模型名、API Key
3. 需要时点 **刷新模型列表**（`GET {Base URL}/models`）

已有自己的配置时，内置通道不会覆盖它。Key 优先经系统安全存储加密落盘，不会写入存档 JSON。

### 常用服务商一键快填

「自定义」面板顶部有常用服务商预设，点一下会：

1. 自动填好协议 / Base URL / 模型 / 备注名
2. 在下方展开该家的**申请步骤**（打开哪个网址、点哪里、粘到哪里、怎么选模型）
3. 给出申请 Key 的地址（只读输入框，方便复制）

| 类别 | 服务商 | Base URL | 默认模型 | 申请 Key（点进去创建后复制） |
| --- | --- | --- | --- | --- |
| **免费** | **书生·浦语（Intern-AI）** | `https://chat.intern-ai.org.cn/api/v1` | `intern-latest` | https://internlm.intern-ai.org.cn/api/access-token |
| | **讯飞星火** | `https://spark-api-open.xf-yun.com/v1` | `lite` | https://console.xfyun.cn/services/cbm |
| **其他主流服务商** | 小米 MiMo | `https://api.xiaomimimo.com/v1` | `mimo-v2.6-pro` | https://platform.xiaomimimo.com/#/console/api-keys |
| | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | https://platform.deepseek.com/api_keys |
| | 阿里通义千问（百炼） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | https://bailian.console.aliyun.com/?apiKey=1 |
| | 月之暗面 Kimi | `https://api.moonshot.cn/v1` | `kimi-k2.6` | https://platform.moonshot.cn/console/api-keys |
| | 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.5-flash` | https://open.bigmodel.cn/usercenter/apikeys |
| | 字节豆包（火山方舟） | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-2.0-pro` | https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey |
| | 硅基流动 | `https://api.siliconflow.cn/v1` | `Qwen/Qwen3-8B` | https://cloud.siliconflow.cn/account/ak |
| | 商汤日日新 | `https://api.sensenova.cn/compatible-mode/v2` | `SenseChat-5` | https://platform.sensenova.cn/ （登录后左侧「API Key 管理」） |
| | 腾讯混元（TokenHub） | `https://tokenhub.tencentmaas.com/v1` | `hy3` | https://console.cloud.tencent.com/tokenhub/apikey |

> 只有**书生·浦语**与**讯飞星火**在游戏内写了免费政策备注（免费政策最容易过期，其余家不写以免误导）。两点提醒：**智谱免费的 Flash 档一般要求账号里有余额**；**商汤文本模型是付费的**——它长期免费的是图片模型 `sensenova-u1.5-lite`（文生图），本应用用不到。各家额度以官方公告与定价页为准。

#### 书生·浦语（Intern-AI）申请步骤

> 官方长期免费开放，**推荐作为首选**（比实验性的内置通道稳定得多）。

1. 打开 **https://sso.openxlab.org.cn/login** —— 用手机号注册并登录书生账号
2. 登录后打开 API 控制台：**https://internlm.intern-ai.org.cn/api/access-token**
3. 在控制台点「创建 / 生成 API Token」，**复制完整 token**：只在首次创建时完整显示一次，**有效期 6 个月**（失效后需重建）
4. 回到游戏：**设置 → 🔑 API → 自定义 → 点「书生·浦语（Intern-AI）」**，把 token 粘到「API Key」输入框（**不用手动加 `Bearer`**，应用会自己加）
5. **选模型**：
   - 默认 `intern-latest` —— 官方说明它会自动指向最新版（当前为 `intern-s2`）
   - 想指定版本：预设自带下拉，含 `intern-s2` / `intern-s1-pro` / `intern-s1` / `intern-s1-mini` / `internvl-latest`
   - 想看全量：点「**刷新模型列表**」——它调用的正是官方 `GET https://chat.intern-ai.org.cn/api/v1/models`，会返回整个书生系列供选择
6. 点「测试连接」验证（成功会显示耗时与模型回话）→ 点「保存并选用」

> 免费额度：官方文档未标注具体数值，第三方整理约为 **30 RPM、每月 9000 万 tokens**，以平台公告为准。该端点**不支持 `response_format`**，应用会自动跳过该字段（靠提示词输出合同 + 补写链兜底），不会因参数不被支持而反复重试。

## 自定义世界

欢迎页 **🛠 自定义世界**：

1. **从作品生成**：填书名 + 设定摘要（可选等级表），用已配置的 API 生成世界包草稿
2. **整本小说**：上传/粘贴 TXT，自动抽样开头/中段/结尾章节考据 → 合并设定 → 生成草稿
3. **联网补充**：优先萌娘百科/百度百科，可选维基回退；或粘贴设定帖 URL 抓正文
4. **人物 NPC**：从考据选出主要人物，生成 8~12 个带档案的 `map.people` 种子
5. **粘贴 JSON**：按 `worldpack.js` 字段校验后保存
6. 自定义世界出现在欢迎页，拥有独立存档槽；可导出 JSON 分享

## 世界观一览

| 包 | 升级 | 进度 | 场景示例 |
|----|------|------|----------|
| 修仙 | 突破 | 修为 | 游历、除妖、打坐 |
| 玄幻 | 破境 | 灵力 | 闯荡、挑战、吐纳 |
| 武侠 | 精进 | 内力 | 闯江湖、切磋、运功 |
| 职场 | 晋升 | 声望经验 | 谈判、社交、找机会 |
| 末世 | 进化 | 进化点 | 搜刮、狩猎、守夜 |
| 西幻 | 晋阶 | 魔力/经验 | 冒险、讨伐、冥想 |

## 从源码构建

本仓库 `master` 同时包含 **Windows 桌面** 与 **Android** 工程。

### Windows 可执行 / 便携包

```bash
npm install                # 可选，仅 electron devDependency
npm run rebuild:runtime    # 或自备 runtime/（Electron 发行版）
npm start                  # 同步 app/ 并启动
# 便携 zip：把 runtime/ 整目录打包即可
```

### Android APK

```bash
node scripts/sync-android.js   # 把 app/ 同步进 android assets
cd android
# 需 JDK17 + Android SDK 35（设置 JAVA_HOME / ANDROID_HOME）
gradlew.bat assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

## 脚本

```bash
npm install           # 安装依赖
npm start             # 同步 runtime 并启动
npm run sync          # 仅同步 app → runtime/resources/app
npm run rebuild:runtime
npm run smoke:engine
npm run smoke:book
npm run smoke:chars
npm run smoke:npc
npm run smoke:quest
npm run smoke:llm
npm run smoke:stage
```

## 注意

- 游戏进度按世界观分槽存 localStorage，清站点/应用数据会丢档
- API Key 单独加密保存；删某一世界档会保留 Key 与其它世界存档
- 剧情由 AI 生成，可能包含虚构或错误内容

## 许可

[MIT](LICENSE) © Fly143

变更记录见 [CHANGELOG.md](CHANGELOG.md)。
