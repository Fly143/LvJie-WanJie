const fs = require('fs')

// 1) 版本号 0.0.5
{
  const p = 'package.json'
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  j.version = '0.0.5'
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
  console.log('pkg', j.version)
}
{
  const p = 'android/app/build.gradle.kts'
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace('versionCode = 4', 'versionCode = 5').replace('versionName = "0.0.4"', 'versionName = "0.0.5"')
  fs.writeFileSync(p, t)
  console.log(t.match(/versionCode.*/)[0], t.match(/versionName.*/)[0])
}

// 2) CHANGELOG
{
  const p = 'CHANGELOG.md'
  let t = fs.readFileSync(p, 'utf8')
  const old = `## [Unreleased]

## [0.0.4]`
  const neu = `## [Unreleased]

## [0.0.5] - 2025-07

### Added
- Responses API previous_response_id 服务端对话链，断链自动回退全量历史
- 界面 UI 多语言：简体中文 / 繁體中文 / English / 日本語
- 欢迎页语言切换；各世界观 startBtn 多语言；开局弹窗设角色名与初始年龄
- 婚姻侧栏（按世界观用词：道侣/眷侣/配偶/伴侣）；常驻自由行动输入框
- 自定义世界支持游戏/动画/漫画/影视，维基为独立可选信源
- 生成失败自动重连（最多 3 次）；Android 真流式 SSE 输出
- 双语 README、LICENSE（MIT）、CHANGELOG

### Fixed
- API Key 双缓存打通，resolveKey 回退全局密钥仓
- 事件并发闸误用 loading 导致 AI 一直「叙事中」
- 流式回调注册顺序竞态、8s 快退误伤进行中输出
- 欢迎页空存档崩溃；返回键改为侧栏菜单；欢迎页与游戏界面重叠
- 新地图自动落位；同据点路程 1 天；低阶速度不再放慢
- BGM 后台暂停、回前台防叠音；对话上下文完整回放

### Security
- API Key 安卓 Keystore AES-256-GCM 加密，堵死明文 localStorage 回退
- HTTP 桥 SSRF 防护、跨 origin 重定向剥离认证头、toast XSS 转义

## [0.0.4]`
  if (!t.includes(old)) {
    console.log('CHANGELOG pattern miss, insert before 0.0.4')
    t = t.replace('## [0.0.4]', `## [0.0.5] - 2025-07\n\n### Added\n- Responses API previous_response_id 链 + 断链回退\n- UI 多语言四语；开局年龄自定义；婚姻侧栏；常驻自由行动\n- 生成失败自动重连；Android 真流式\n\n### Fixed\n- Key 双缓存；并发闸 loading；流式竞态；地图落位/路程；BGM 生命周期\n\n## [0.0.4]`)
  } else {
    t = t.split(old).join(neu)
  }
  t = t.replace('[Unreleased]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.4...HEAD',
    '[Unreleased]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.5...HEAD\n[0.0.5]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.4...v0.0.5')
  fs.writeFileSync(p, t)
  console.log('changelog ok')
}

// 3) README 徽章带版本号（可选静态标注）
{
  for (const f of ['README.md', 'README.en.md']) {
    let t = fs.readFileSync(f, 'utf8')
    t = t.replace('https://img.shields.io/github/v/release/Fly143/LvJie-WanJie?include_prereleases',
      'https://img.shields.io/badge/release-v0.0.5-blue')
    fs.writeFileSync(f, t)
    console.log(f, 'badge')
  }
}

console.log('done')
