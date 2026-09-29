const fs = require('fs')

// 1) 版本号 0.0.6
{
  const p = 'D:/DS/AgentWorlds/package.json'
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  j.version = '0.0.6'
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
  console.log('pkg', j.version)
}
{
  const p = 'D:/DS/AgentWorlds/android/app/build.gradle.kts'
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace('versionCode = 5', 'versionCode = 6').replace('versionName = "0.0.5"', 'versionName = "0.0.6"')
  fs.writeFileSync(p, t)
  console.log(t.match(/versionCode.*/)[0], t.match(/versionName.*/)[0])
}

// 2) README 徽章
for (const p of ['D:/DS/AgentWorlds/README.md', 'D:/DS/AgentWorlds/README.en.md']) {
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace('release-v0.0.5-blue', 'release-v0.0.6-blue')
  fs.writeFileSync(p, t)
  console.log('badge', p)
}

// 3) CHANGELOG
{
  const p = 'D:/DS/AgentWorlds/CHANGELOG.md'
  let t = fs.readFileSync(p, 'utf8')
  if (!t.includes('## [0.0.5]')) {
    const old = '## [Unreleased]'
    const neu = `## [Unreleased]

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
`
    if (!t.includes(old)) { console.error('Unreleased missing'); process.exit(1) }
    // put 0.0.6/0.0.5 after Unreleased, keep rest
    t = t.replace(old + '\n', neu)
    // fix compare links
    t = t.replace(
      '[Unreleased]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.3...HEAD',
      '[Unreleased]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.6...HEAD\n[0.0.6]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.5...v0.0.6\n[0.0.5]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.3...v0.0.5'
    )
    fs.writeFileSync(p, t)
    console.log('changelog updated')
  } else {
    console.log('changelog already has 0.0.5')
  }
}
