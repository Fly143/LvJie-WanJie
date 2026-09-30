# Changelog

本项目版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)，记录格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-09

### Added
- **同伴同行**：同伴页可「邀请同行 / 结束同行」。同行者随你移动（旅行时自动跟随并切换到新场景），始终出现在当前场景人物表里，卡片显示「同行中」；行踪不明的同伴也可邀请，明确在别处的则要求同场景
- **队伍栏**：同伴页顶部新增「队伍」区，显示队伍战力、成员档位/战力/好感/同行天数/最近近况，可直接切磋交流或结束同行
- **队伍战力**：同行者按配合系数（0.6）计入总战力，并出现在人物页战力明细的「同伴」一项；伴侣已计入关系加成，不重复计
- **每日互动**：「切磋交流」每人每天一次，+2 好感（同步到关系网）并写入近况；按钮显示「今日已互动」
- **解除同行**：结束同行时可选「留在原地」或「返回原处」（邀请时记住出发点，行踪不明者无出发点、只留在原地）；队伍栏另有「解散全队」，可让全员各自返回原处
- **状态随天数推进**：已结识 NPC 的年龄随游戏天数自动增长（旅行与 AI 推进时间都会带上），未知年龄保持未知、不凭空生成
- **同伴近况**：`f.history` 此前只建字段、无人写入（提示词里的「近期交谈」永远是空的）——现在交谈、记忆更新、同行起止、切磋都会自动累积近况（去重、上限 50 条，兼容旧档对象格式），并注入提示词与按需档案
- 提示词新增【同行者】块：同行者必须与玩家同场景、随行且不得凭空消失，并给出队伍合力，要求写战斗时把同行者算进去；同行状态由界面切换，模型不得直写 `party`

### Changed
- `changes.friends` 的 `mem` 更新同时写入近况，AI 侧人物状态与「近况」栏保持一致

## [0.2.1] - 2026-09

### Fixed
- API 设置：切换已保存配置后点「保存并选用」会回到原来那条 —— 弹窗打开后表单没有跟着切换走，保存时按旧表单内容匹配并把选择改了回来；现在切换即同步表单，且表单未改动时只切换选用、不再重复写库
- API 设置：手机窄屏下「已保存 · 不显示」被压成一字一行（竖排）、卡片拥挤 —— 改为两行结构 + `nowrap`/省略号，备注名与模型名过长自动截断（无头排版校验：修复前 6×125px 竖排 → 修复后 81×18px 横排）
- 配置匹配忽略 Base URL 结尾斜杠、兼容旧 `style` 字段，避免同一配置被存成重复条目

### Added
- `smoke:keys` 回归脚本：配置切换/匹配判定 18 个用例
- `scripts/ui-layout-check.js`：用系统 Edge 无头渲染，量化校验窄屏排版（含复刻旧样式的对照组）

## [0.2.0] - 2026-09

### Added
- 剧情数据补写链：LLM 回合缺少 JSON 数据块时自动恢复（AI 恢复抽取 → 正则兜底 → 仅保留正文），连续缺块上限 2 轮强制收束事件；设置中关掉轮数上限则完全不限
- 设置新增文案（i18n）导出 / 导入 / 重置

### Fixed
- 赠与「到手了吗」判定：仅条件许诺、征询意见、展示观看、明确拒绝的物品不再写入奖励（「若你赢了便送你」「推到你面前要不要」「婉拒没接」均不入包，推辞后收下正常入包）；宁可漏记不误记
- 补写链正则兜底接入同一到手判定，杜绝「提到没给」的物品被写成奖励
- 存档导出统一到 `文档/AgentWorlds/` 目录；轮数上限弹窗文案修正

## [0.1.0] - 2026-09

### Added
- 「开挂」AI 风格真实生效：移除 `cheatUnlocked` 死门槛，四档风格（开挂/慷慨/正常/艰难）全部按设置生效
- 冒烟脚本体系：`smoke:engine/book/chars/npc/quest` 五连 + `smoke:llm` 端点探测 + `smoke:stage` 启动探测

### Changed
- 版本号规范固定为三段式 `主.次.补丁`，不再使用四位版本；0.1.0 作为「安全加固完成」里程碑基线
- 一次性迁移脚本归档不再入库（本地留存于 `scripts/migrations-archive/`）

### Security
- main.js 五项安全加固：fetchChecked 逐跳校验、资产读取双白名单、跨域敏感头剥离、safeStorage 密钥持久化、SSRF 防护
- 世界包导入原型污染防护（`__proto__` / `constructor` 键过滤）

### Fixed
- 数值通道 NaN 防御；relType 与婚姻状态解耦；toast / i18n 转义修复
- 引擎稳定性批修：空指针防御、changes 单轮熔断、流式超时

## [0.0.7.1] - 2025-09

### Fixed
- 选项去掉重复序号，不再显示「1. 1.xxx」

## [0.0.7] - 2025-09

### Added
- 婚姻：末世开启；取向（不限/女/男）；求婚成功/婉拒均走 AI 剧情
- NPC 年龄（age_days）与展示；求婚确认改应用内弹窗
- 货币四档（下/中/上/极品）：修仙灵晶、玄幻灵石、武侠西幻金银铜、现代元、自定义原设定
- 付款高抵低 1:100 并找零；极品持有后才显示；不自动进位
- BGM 全局偏好持久化；多 API Key 按协议分条保存

### Fixed
- Response 流式过滤思考链；chat 连续轮 JSON 回放防丢数据块
- MIDI 安卓播放（asset.read 回退 + 本地服 URL 解码中文文件名）
- 生成剧情滚回整页顶部；render ageLabel 导入崩溃

## [0.0.6] - 2025-09

### Added
- 自定义世界生成可视化进度：步骤状态 / 计时 / 失败标红 / 长任务心跳
- 生成失败可从断点续接（缓存设定圣经与出包上下文）
- 联网补充扩展：萌娘相关页、Bangumi、AniList、Fandom / 灰机（失败自动跳过）
- 萌娘检索改用 opensearch（修复 list=search 401）

### Fixed
- 流式只展示 narrative 并反转义，消除 JSON 与字面换行转义刷屏、结束跳变
- 自定义世界 Key 走引擎仓；丹药等赠品识别与兜底落库
- 游戏事件输出改为单一 JSON 对象 + response_format 强制，杜绝漏数据块
- 生成按钮与婚姻提示去掉 UI 历史说明，只留操作指引

## [0.0.5] - 2025-07

### Added
- Responses API previous_response_id 服务端对话链，断链自动回退全量历史
- 界面 UI 多语言：简体中文 / 繁體中文 / English / 日本語
- 欢迎页语言切换；各世界观 startBtn 多语言；开局弹窗设角色名与初始年龄
- 婚姻侧栏（按世界观用词）；常驻自由行动输入框
- 自定义世界支持游戏/动画/漫画/影视，维基为独立可选信源
- 生成失败自动重连（最多 3 次）；Android 真流式 SSE 输出

### Fixed
- API Key 双缓存打通，resolveKey 回退全局密钥仓
- 事件并发闸误用 loading 导致 AI 一直「叙事中」
- 流式回调注册顺序竞态、8s 快退误伤进行中输出
- 欢迎页与游戏界面重叠；新地图自动落位；同据点路程 1 天
- BGM 后台暂停、回前台防叠音；对话上下文完整回放

## [0.0.3] - 2025-07

### Added
- 完整界面 UI 多语言：简体中文 / 繁體中文 / English / 日本語
- 欢迎页「🌐 语言」入口，新开局继承全局语言偏好
- 双语 README、LICENSE（MIT）、CHANGELOG

### Security
- API Key 安卓端改为 Android Keystore AES-256-GCM 加密；堵死明文 localStorage 回退
- HTTP 桥 SSRF 防护、跨 origin 重定向剥离认证头、toast XSS 转义
- 三审批修：Key 空写覆盖、recover 竞态、progress 白名单、流式串扰

## [0.0.2.1] - 2025-06

### Fixed
- 婚姻性别规则与场景 NPC 性别显示
- NPC 点名档案
- 独立审查问题批修（Key / API 保存 / MIDI / 弹窗 / 恩怨 / 任务 / 流式）

## [0.0.2] - 2025-05

### Added
- 恩怨手动增删；负好感自动写入恩怨 / 仇人
- NPC 关系网双向同步与界面展示
- 流式输出、changes 熔断与存档导出导入
- 书籍人物考据并种子为游戏 NPC
- 自定义世界：JSON 导入 / 从书 AI 生成 / 联网补充设定
- 世界观切换改为独立存档槽

### Fixed
- XSS 与 Electron 安全面加固
- 联网补充改为国内信源优先

## [0.0.1] - 2025-04

### Added
- 初版：六世界观、自定义模型接入、事件循环与 JSON changes 落库
- 委托任务、背景音乐（mp3 / MIDI）、人物记忆
- Windows 便携包与 Android APK 发布

[Unreleased]: https://github.com/Fly143/LvJie-WanJie/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Fly143/LvJie-WanJie/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Fly143/LvJie-WanJie/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Fly143/LvJie-WanJie/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.7.1...v0.1.0
[0.0.7.1]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.7...v0.0.7.1
[0.0.7]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.3...v0.0.5
[0.0.3]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.2.1...v0.0.3
[0.0.2.1]: https://github.com/Fly143/LvJie-WanJie/releases/tag/v0.0.2.1
[0.0.2]: https://github.com/Fly143/LvJie-WanJie/releases/tag/v0.0.2
[0.0.1]: https://github.com/Fly143/LvJie-WanJie/releases/tag/v0.0.1
