const fs = require('fs')

// 1) 版本号 0.0.7
{
  const p = 'D:/DS/AgentWorlds/package.json'
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  j.version = '0.0.7'
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
  console.log('pkg', j.version)
}
{
  const p = 'D:/DS/AgentWorlds/android/app/build.gradle.kts'
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace('versionCode = 6', 'versionCode = 7').replace('versionName = "0.0.6"', 'versionName = "0.0.7"')
  fs.writeFileSync(p, t)
  console.log(t.match(/versionCode.*/)[0], t.match(/versionName.*/)[0])
}

// 2) README 徽章
for (const p of ['D:/DS/AgentWorlds/README.md', 'D:/DS/AgentWorlds/README.en.md']) {
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace('release-v0.0.6-blue', 'release-v0.0.7-blue')
  fs.writeFileSync(p, t)
  console.log('badge', p)
}

// 3) CHANGELOG
{
  const p = 'D:/DS/AgentWorlds/CHANGELOG.md'
  let t = fs.readFileSync(p, 'utf8')
  // 清掉 Unreleased 段里的旧条目，换成 0.0.7
  const unreleasedOld = `## [Unreleased]

### Added
- 末世开启婚姻；求婚按钮常显，低好感可被拒（婉拒提示）
`
  const neu = `## [Unreleased]

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
`
  if (t.includes(unreleasedOld)) {
    t = t.replace(unreleasedOld, neu)
  } else {
    t = t.replace('## [Unreleased]', neu.split('## [0.0.7]')[0] + '## [0.0.7]' + neu.split('## [0.0.7]')[1])
  }
  t = t.replace(
    '[Unreleased]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.6...HEAD',
    '[Unreleased]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.7...HEAD\n[0.0.7]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.6...v0.0.7'
  )
  fs.writeFileSync(p, t, 'utf8')
  console.log('changelog has 0.0.7', t.includes('## [0.0.7]'))
}
