// 常用服务商预设：一键填好 Base URL / 模型 / 协议，并给出「怎么申请 Key、填哪里、怎么选模型」的分步说明。
// 都必须是 OpenAI 兼容的 chat/completions 端点（我们只用这一种协议接第三方）。
//
// 维护说明：URL 与模型名按各家官方文档核对（2026-09）。改动时请同步更新 howto/keyUrl。
// 只收录「端点已核实」的服务商；拿不准的一律不加，避免给玩家填错地址。
//
// 排序：能免费用的排最前（书生·浦语、讯飞星火、智谱 GLM），其余按主流程度排。
// 教程详略：只有这三家免费档写细（免费的是哪个模型、要不要充值、充多少）；
// 其余家只写标准四步（打开申请页 → 创建并复制 Key → 粘到哪里 → 测试连接），不谈免费政策。

export const PROVIDER_PRESETS = [
  {
    id: 'intern',
    name: '书生·浦语（Intern-AI）',
    tag: '免费',
    baseUrl: 'https://chat.intern-ai.org.cn/api/v1',
    model: 'intern-latest',
    apiStyle: 'chat',
    // 官方文档只列出 model/messages/n/temperature/top_p/stream/max_tokens/tools，
    // 不含 response_format：不要给它发 JSON 模式，靠提示词合同 + 补写链兜底。
    noJsonMode: true,
    keyUrl: 'https://internlm.intern-ai.org.cn/api/access-token',
    loginUrl: 'https://sso.openxlab.org.cn/login',
    models: ['intern-latest', 'intern-s2', 'intern-s1-pro', 'intern-s1', 'intern-s1-mini', 'internvl-latest'],
    note: '长期免费开放（第三方整理：约 30 RPM、每月 9000 万 tokens；以平台公告为准）；API Token 有效期 6 个月',
    howto: [
      '① 打开 {login} 用手机号注册并登录（书生账号）',
      '② 登录后打开 API 控制台：{key}',
      '③ 在控制台点「创建 / 生成 API Token」，复制完整 token（只在首次创建时完整显示一次；有效期 6 个月，失效需重建）',
      '④ 回到本页，把 token 粘到下面的「API Key」输入框（不用手动加 Bearer 前缀，应用会自己加）',
      '⑤ 免费范围：整个书生系列都可用。模型默认 intern-latest（官方说明会自动指向最新版，当前为 intern-s2）；想指定版本就在下面「模型」里选，或点「刷新模型列表」从接口拉取全部模型后再选',
      '⑥ 点「测试连接」验证 → 成功后点「保存并选用」'
    ]
  },
  {
    id: 'spark',
    name: '讯飞星火',
    tag: '免费',
    baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    model: 'lite',
    apiStyle: 'chat',
    keyUrl: 'https://console.xfyun.cn/services/cbm',
    loginUrl: 'https://console.xfyun.cn/',
    models: ['lite', 'generalv3.5', 'max-32k', 'pro-128k', '4.0Ultra'],
    note: 'lite（Spark Lite）档历来免费（第三方汇总：tokens 总量不限、QPS 2；以官方价格页为准）；其它版本按量计费',
    howto: [
      '① 打开 {key} 登录讯飞开放平台（手机号注册），进入「星火认知大模型」服务页',
      '② 在页面里领取/创建服务，然后复制「APIPassword」——**这就是本应用要填的 API Key**（不是 APPID / APIKey / APISecret）',
      '③ 免费的是哪个：模型填 `lite`（Spark Lite，免费、tokens 不限、QPS 2）。generalv3.5 / max-32k / 4.0Ultra 都是按量计费，想白嫖就别选',
      '④ 回到本页粘贴到「API Key」，模型保持默认 lite',
      '⑤ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    tag: '免费',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.7-flash',
    apiStyle: 'chat',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    loginUrl: 'https://open.bigmodel.cn/',
    models: ['glm-4.7-flash', 'glm-4-flash-250414', 'glm-z1-flash', 'glm-4.6v-flash', 'glm-5.3-flash'],
    howto: [
      '① 打开 {login} 用手机号注册并登录智谱开放平台',
      '② 打开 {key}，在「API Keys」页点「添加新的 API Key」并复制',
      '③ 免费的是哪个（按官方定价页）：`glm-4.7-flash`、`glm-4-flash-250414`、`glm-z1-flash` 输入输出都标「免费」；`glm-4.6v-flash` 系列是免费的视觉模型。`glm-5.3-flash` 等是按量计费，想白嫖就别选',
      '④ **要先往账户里充钱**：免费模型也要求账号有余额，余额为 0 时接口会报「余额不足或无可用资源包，请充值」。到「财务 / 充值」用自定义金额充一点点即可（充值页支持自定义，1 元左右通常就够，下限以页面显示为准；余额只作门槛，用免费模型不扣）',
      '⑤ 回到本页粘贴到「API Key」，模型保持默认 glm-4.7-flash',
      '⑥ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'mimo',
    name: '小米 MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.6-flash',
    apiStyle: 'chat',
    keyUrl: 'https://platform.xiaomimimo.com/#/console/api-keys',
    loginUrl: 'https://platform.xiaomimimo.com/',
    models: ['mimo-v2.6-flash', 'mimo-v2.6-pro'],
    howto: [
      '① 打开 {key} 注册并登录小米 MiMo 开放平台（也可从 platform.xiaomimimo.com 进入后点左侧「API Keys」）',
      '② 在「API Keys」页创建密钥（格式 sk-xxxxx）并复制',
      '③ 回到本页粘到「API Key」；模型默认 mimo-v2.6-flash（更快更省），想用更强的可选 mimo-v2.6-pro',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    // 不写死模型名：粘好 Key 后自动拉官方模型列表，挑最新的 flash 档
    autoModel: true,
    modelHint: 'flash',
    apiStyle: 'chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    loginUrl: 'https://platform.deepseek.com/',
    howto: [
      '① 打开 {key} 登录 DeepSeek 开放平台（需先注册并充值）',
      '② 点「创建 API key」并复制（只显示一次）',
      '③ 回到本页粘贴到「API Key」，模型会自动从官方模型列表里取最新的 flash 档（也可点「刷新模型列表」自己挑）',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'qwen',
    name: '阿里通义千问（百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    apiStyle: 'chat',
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    loginUrl: 'https://bailian.console.aliyun.com/',
    models: ['qwen-plus', 'qwen-turbo', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-flash'],
    howto: [
      '① 打开 {key} 登录阿里云百炼控制台',
      '② 右上角头像 → 「API-KEY」→ 创建我的 API-KEY 并复制',
      '③ 回到本页粘贴到「API Key」；模型默认 qwen-plus',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'kimi',
    name: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.6',
    apiStyle: 'chat',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    loginUrl: 'https://platform.moonshot.cn/',
    models: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    howto: [
      '① 打开 {key} 登录 Moonshot 开放平台（手机号注册）',
      '② 在「API Key 管理」新建密钥并复制',
      '③ 回到本页粘贴到「API Key」；模型默认 kimi-k2.6',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'doubao',
    name: '字节豆包（火山方舟）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-2.0-pro',
    apiStyle: 'chat',
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    loginUrl: 'https://console.volcengine.com/ark',
    models: ['doubao-2.0-pro', 'doubao-2.0-pro-256k'],
    howto: [
      '① 打开 {login} 登录火山引擎，在方舟「开通管理」里开通要用的模型',
      '② 打开 {key} 创建 API Key 并复制',
      '③ 回到本页粘贴到「API Key」；模型默认 doubao-2.0-pro（若提示需要接入点，就把 ep-… 填到模型里）',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'siliconflow',
    name: '硅基流动（SiliconFlow）',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3-8B',
    apiStyle: 'chat',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    loginUrl: 'https://cloud.siliconflow.cn/',
    howto: [
      '① 打开 {key} 登录（手机号注册）',
      '② 在「API 密钥」页新建密钥并复制',
      '③ 回到本页粘贴到「API Key」；模型可填 Qwen/Qwen3-8B，或点「刷新模型列表」选择',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'sensenova',
    name: '商汤日日新（SenseNova）',
    baseUrl: 'https://api.sensenova.cn/compatible-mode/v2',
    model: 'SenseChat-5',
    apiStyle: 'chat',
    keyUrl: 'https://platform.sensenova.cn/',
    loginUrl: 'https://platform.sensenova.cn/',
    models: ['SenseChat-5'],
    howto: [
      '① 打开 {key} 注册并登录商汤日日新控制台',
      '② 登录后进入「API Key 管理 / 密钥管理」（左侧菜单），创建 API Key 并复制',
      '③ 回到本页粘贴到「API Key」；模型默认 SenseChat-5（可点「刷新模型列表」看可用模型）',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'hunyuan',
    name: '腾讯混元（TokenHub）',
    baseUrl: 'https://tokenhub.tencentmaas.com/v1',
    model: 'hy3',
    apiStyle: 'chat',
    keyUrl: 'https://console.cloud.tencent.com/tokenhub/apikey',
    loginUrl: 'https://console.cloud.tencent.com/tokenhub/',
    models: ['hy3', 'hy4-preview', 'hy-mt2-pro', 'hunyuan-role-latest'],
    howto: [
      '① 打开 {login} 登录腾讯云（需注册 + 实名认证），按提示开通「大模型服务平台 TokenHub」',
      '② 打开 {key} 创建 API Key 并复制',
      '③ 回到本页粘贴到「API Key」；模型默认 hy3（也可填 hy4-preview 等）',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  }
]

/** 把 howto 里的 {key}/{login} 占位符替换成真实地址 */
export function presetSteps(preset) {
  if (!preset) return []
  return (preset.howto || []).map(s => String(s)
    .replace(/\{key\}/g, preset.keyUrl || '')
    .replace(/\{login\}/g, preset.loginUrl || preset.keyUrl || ''))
}

/** 模型名里的大版本号（v4.1 → 4.1），用于没有 created 时比较新旧 */
function versionOf(id) {
  const m = /(?:^|[^\d.])v?(\d+(?:\.\d+)?)/i.exec(String(id || ''))
  return m ? Number(m[1]) : 0
}

/**
 * 从服务商返回的模型列表里挑「最新」的那个。
 * 有 created 时按创建时间取最新；没有就按名字里的版本号比大小。
 * @param {Array<{id:string,created?:number}>} items
 * @param {string} hint 关键字/正则（如 'flash'）：只在这个范围内挑，挑不到再退回全量
 */
export function pickLatestModel(items, hint) {
  const arr = (items || []).filter(x => x && x.id).map(x => ({ id: String(x.id), created: Number(x.created) || 0 }))
  if (!arr.length) return ''
  let pool = arr
  if (hint) {
    try {
      const re = new RegExp(hint, 'i')
      const hit = arr.filter(x => re.test(x.id))
      if (hit.length) pool = hit
    } catch (e) { /* hint 不是合法正则就当没有 */ }
  }
  const timed = pool.filter(x => x.created > 0)
  if (timed.length) {
    return timed.slice().sort((a, b) => b.created - a.created || versionOf(b.id) - versionOf(a.id))[0].id
  }
  return pool.slice().sort((a, b) => versionOf(b.id) - versionOf(a.id) || a.id.localeCompare(b.id))[0].id
}

/** 模型列表排序：命中关键字的排前面，其余按新旧 */
export function orderModelsForPick(items, hint) {
  const arr = (items || []).filter(x => x && x.id).map(x => ({ id: String(x.id), created: Number(x.created) || 0 }))
  let re = null
  if (hint) { try { re = new RegExp(hint, 'i') } catch (e) { re = null } }
  const rank = (x) => (re && re.test(x.id) ? 0 : 1)
  return arr.slice().sort((a, b) => rank(a) - rank(b) || b.created - a.created || versionOf(b.id) - versionOf(a.id) || a.id.localeCompare(b.id))
}

export function findPreset(baseUrl) {
  const b = String(baseUrl || '').trim().replace(/\/+$/, '').toLowerCase()
  if (!b) return null
  return PROVIDER_PRESETS.find(p => p.baseUrl.replace(/\/+$/, '').toLowerCase() === b) || null
}

/** 该端点是否不能收 response_format（JSON 模式） */
export function noJsonMode(baseUrl) {
  const p = findPreset(baseUrl)
  return !!(p && p.noJsonMode)
}

/** 预设 → 一条可保存的配置（key 由玩家填） */
export function presetConfig(preset, key) {
  if (!preset) return null
  return {
    name: preset.name,
    baseUrl: preset.baseUrl,
    key: String(key || ''),
    model: preset.model,
    apiStyle: preset.apiStyle === 'response' ? 'response' : 'chat'
  }
}
