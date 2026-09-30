// 常用服务商预设：一键填好 Base URL / 模型 / 协议，并给出「怎么申请 Key、填哪里、怎么选模型」的分步说明。
// 都必须是 OpenAI 兼容的 chat/completions 端点（我们只用这一种协议接第三方）。
//
// 维护说明：URL、模型名与免费政策均按各家官方文档核对（2026-09）。改动时请同步更新 howto/keyUrl。
// 只收录「端点已核实」的服务商；拿不准的一律不加，避免给玩家填错地址。
//
// 排序：能免费用的排最前（书生·浦语、讯飞星火、智谱 GLM），其余按主流程度排。
// note 只给免费政策容易过期的两家（书生·浦语、讯飞星火）；其余家的细节写在 howto 步骤里。

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
    model: 'mimo-v2.6-pro',
    apiStyle: 'chat',
    keyUrl: 'https://platform.xiaomimimo.com/#/console/api-keys',
    loginUrl: 'https://platform.xiaomimimo.com/',
    models: ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.6-pro-ultraspeed'],
    howto: [
      '① 打开 {key} 注册并登录小米 MiMo 开放平台（也可从 platform.xiaomimimo.com 进入后点左侧「API Keys」）',
      '② 在「API Keys」页创建密钥（格式 sk-xxxxx），复制；按量计费，需先在控制台充值（或购买 Token Plan 订阅包）',
      '③ 回到本页粘到「API Key」；模型默认 mimo-v2.6-pro，也可选 flash（更快更省）/ ultraspeed',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiStyle: 'chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    loginUrl: 'https://platform.deepseek.com/',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    howto: [
      '① 打开 {login} 注册并登录 DeepSeek 开放平台',
      '② 先在「充值」页充值（不支持免费额度，必须有钱才能调），再打开 {key} 点「创建 API key」并复制（只显示一次）',
      '③ 回到本页粘贴到「API Key」；模型填 deepseek-chat（通用）或 deepseek-reasoner（推理更强、也更贵）',
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
      '① 打开 {key} 登录阿里云百炼控制台（需阿里云账号 + 实名认证）',
      '② 右上角头像 → 「API-KEY」→ 创建我的 API-KEY，复制',
      '③ 说明：百炼对新用户/新模型常有免费额度（在控制台「费用与成本 / 额度」里能看到剩余量），用完后按量计费——想省钱选便宜的 qwen-turbo / qwen3.6-flash，qwen3.7-max 最贵',
      '④ 回到本页粘贴到「API Key」；模型默认 qwen-plus',
      '⑤ 点「测试连接」验证后「保存并选用」'
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
      '② 在「API Key 管理」新建密钥并复制；新用户通常有赠送额度，用完后按量计费（需充值）',
      '③ 回到本页粘贴到「API Key」；模型默认 kimi-k2.6，长文可用 moonshot-v1-128k',
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
      '① 打开 {login} 用火山引擎账号登录（需实名认证），在「开通管理」里开通要用的模型（不开通会报无权限）',
      '② 打开 {key} 创建 API Key 并复制',
      '③ 回到本页粘贴到「API Key」；模型默认 doubao-2.0-pro。若提示需要接入点，到「在线推理 → 创建推理接入点」拿 ep-… 填到模型里',
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
      '① 打开 {key} 登录（手机号注册，通常需实名认证）',
      '② 在「API 密钥」页新建密钥并复制',
      '③ 免费的是哪些：以小参数模型为主（如 Qwen3-8B）；点「刷新模型列表」能看到全部模型与命名（哪档免费以官方定价页为准）',
      '④ 回到本页粘贴到「API Key」，模型保持默认或从列表里挑',
      '⑤ 点「测试连接」验证后「保存并选用」'
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
      '① 打开 {key} 注册并登录商汤日日新控制台（官方文档指定的取 Key 入口）',
      '② 登录后进入「API Key 管理 / 密钥管理」（左侧菜单），创建一个 API Key 并复制',
      '③ 注意：**商汤的文本模型是付费的**（长期免费的是图片模型 sensenova-u1.5-lite，本应用用不到）；2026-05 曾有过「注册首月限时免费」活动，是否仍有效以控制台为准，必要时先开通/充值',
      '④ 回到本页粘贴到「API Key」；模型默认 SenseChat-5（可点「刷新模型列表」看可用模型）',
      '⑤ 点「测试连接」验证后「保存并选用」'
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
      '② 若控制台有「免费体验包」先领一下（可顶一阵子），再打开 {key} 创建 API Key 并复制',
      '③ 回到本页粘贴到「API Key」；模型默认 hy3（也可填 hy4-preview 等，模型清单见控制台「模型广场 / tokenhub/models」）',
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
