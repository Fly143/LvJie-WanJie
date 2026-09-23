export function buildXuanhuanRules({ cheatOn }) {
  const head = cheatOn ? '（开挂档：仅作背景参考）' : '（必须严格遵守）'
  return `${head}
- 斗阶从低到高：斗之气→斗者→斗师→大斗师→斗灵→斗王→斗皇→斗宗→斗尊→斗圣→斗帝。
- 人界势力顶峰约斗皇~斗宗；天罗界以斗尊为主；帝域才有斗圣/斗帝。
- 物物品阶必须与所在世界匹配，不得在人界白给帝晶/帝阶功法。
- 斗气突破由玩家界面完成，你只增减 cultivation/progress（斗气）。升级动词是「突破」。
- 炼药、铸兵等副业用 skills 字段提升。`
}
