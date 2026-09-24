# Agent万象

AI 驱动的**多世界观**开放世界文字游戏。选择修仙 / 玄幻 / 武侠 / 都市 / 末世 / 西幻，接入自定义大模型 API，实时生成剧情与数据变化。

## 功能

- 六套完整世界观包：等级表、货币、场景行动、升级动词、主题皮肤、AI 铁律
- **自定义世界包**：JSON 导入，或按书名/设定用 AI 生成草稿（欢迎页「🛠 自定义世界」）
- 自定义模型接入：Base URL + API Key + 模型，协议支持 **chat** / **response**
- 可「刷新模型列表」从 `GET {Base URL}/models` 拉取选用
- 事件循环：行动 / 选项 / 自由输入 → JSON `changes` 自动落库（货币、进度、物品、地图、同伴）
- 按世界观独立存档槽，切换世界即读档；API Key 加密保存在本机

## 目录

| 路径 | 说明 |
|------|------|
| `app/` | 游戏本体（HTML/CSS/ESM JS） |
| `app/js/engine/` | 引擎：存档、进度、背包、地图、提示词、LLM |
| `app/js/engine/worldpack.js` | 声明式世界包 schema（校验 / 草稿提示词） |
| `app/js/engine/custom-packs.js` | 自定义世界包存取 |
| `app/js/worldviews/` | 内置世界观包（词表 / 数值 / 地图 / 规则） |
| `main.js` / `preload.js` | Electron 主进程 / 渲染桥 |
| `runtime/` | 官方 Electron 发行版 + 同步后的游戏本体（**不入库**） |
| `scripts/` | 启动、同步/重建 runtime、冒烟脚本 |

## 运行

依赖清单在 **`package.json`**（Node 项目里它相当于 Python 的 `requirements.txt`）；锁定文件是 **`package-lock.json`**。二者都已入库。

```bash
# 1）安装依赖（当前仅 devDependency：electron，可选）
npm install

# 2）启动（同步 app → runtime/resources/app 后拉起游戏）
npm start
```

说明：
- **游戏本体零 npm 运行时依赖**，浏览器侧是原生 ESM，不需要 bundler
- `electron` 只是开发辅助；日常运行用本地 **`runtime/AgentWorlds.exe`**（见 `runtime/README.md`）
- 若机器上没有 `runtime/`，执行 `npm run rebuild:runtime`（可用 `AW_ELECTRON_ZIP` 指定官方 Electron zip）

`npm start` 会把 `app/`、`main.js`、`preload.js`、`assets/` 同步到 `runtime/resources/app/`，再启动 `runtime/AgentWorlds.exe`。

开发改代码后重新 `npm start` 即可；也可只执行：

```bash
npm run sync
```

## API 配置

顶栏 **🔑 API**：

1. 选择协议  
   - `chat` → `POST {Base URL}/chat/completions`  
   - `response` → `POST {Base URL}/responses`
2. 填写 Base URL、模型名、API Key  
3. 需要时点 **刷新模型列表**（`GET {Base URL}/models`）

不附带任何内置 Key。Key 优先经系统安全存储（safeStorage）加密落盘，不会写入存档 JSON。

## 自定义世界

欢迎页 **🛠 自定义世界**：

1. **从作品生成**：填书名 + 设定摘要（可选等级表），用已配置的 API 生成世界包草稿  
2. **整本小说**：上传/粘贴 TXT，自动抽样开头/中段/结尾章节考据 → 合并设定 → 生成草稿（不是全文直塞模型）  
3. **粘贴 JSON**：按 `worldpack.js` 的字段校验后保存  
4. 自定义世界出现在欢迎页，拥有独立存档槽；可导出 JSON 分享

## 世界观一览

| 包 | 升级 | 进度 | 场景示例 |
|----|------|------|----------|
| 修仙 | 突破 | 修为 | 游历、除妖、打坐 |
| 玄幻 | 突破 | 斗气 | 闯荡、猎魔兽、炼气 |
| 武侠 | 冲关 | 内力 | 闯江湖、切磋、运功 |
| 都市 | 晋升 | 声望经验 | 谈判、社交、找机会 |
| 末世 | 跃迁 | 进化点 | 搜刮、狩猎、守夜 |
| 西幻 | 晋阶 | 魔力/经验 | 冒险、讨伐、冥想 |

## 脚本

```bash
npm install           # 按 package.json / package-lock.json 安装依赖
npm start             # 同步 runtime 并启动
npm run sync          # 仅同步 app → runtime/resources/app
npm run rebuild:runtime
npm run smoke:engine
npm run smoke:book
npm run smoke:llm
npm run smoke:stage
```

## 注意

- 游戏进度按世界观分槽存 localStorage，清站点/应用数据会丢档
- API Key 单独加密保存；删某一世界档会保留 Key 与其它世界存档
- 剧情由 AI 生成，可能包含虚构或错误内容
- `runtime/`、`node_modules/`、日志与冒烟产物请勿提交到 git

## License

MIT
