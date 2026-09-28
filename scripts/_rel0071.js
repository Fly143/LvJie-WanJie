const fs = require('fs')

{
  const p = 'D:/DS/AgentWorlds/package.json'
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  j.version = '0.0.7.1'
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
  console.log('pkg', j.version)
}
{
  const p = 'D:/DS/AgentWorlds/android/app/build.gradle.kts'
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace('versionCode = 7', 'versionCode = 8').replace('versionName = "0.0.7"', 'versionName = "0.0.7.1"')
  fs.writeFileSync(p, t)
  console.log(t.match(/versionCode.*/)[0], t.match(/versionName.*/)[0])
}
for (const p of ['D:/DS/AgentWorlds/README.md', 'D:/DS/AgentWorlds/README.en.md']) {
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace('release-v0.0.7-blue', 'release-v0.0.7.1-blue')
  fs.writeFileSync(p, t)
}
{
  const p = 'D:/DS/AgentWorlds/CHANGELOG.md'
  let t = fs.readFileSync(p, 'utf8')
  const old = '## [Unreleased]\n\n## [0.0.7]'
  const neu = `## [Unreleased]

## [0.0.7.1] - 2025-09

### Fixed
- 选项去掉重复序号，不再显示「1. 1.xxx」

## [0.0.7]`
  if (!t.includes(old)) { console.log('marker missing'); process.exit(1) }
  t = t.replace(old, neu)
  t = t.replace(
    '[Unreleased]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.7...HEAD',
    '[Unreleased]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.7.1...HEAD\n[0.0.7.1]: https://github.com/Fly143/LvJie-WanJie/compare/v0.0.7...v0.0.7.1'
  )
  fs.writeFileSync(p, t, 'utf8')
  console.log('changelog', t.includes('## [0.0.7.1]'))
}
