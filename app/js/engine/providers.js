// 常用服务商预设：一键填好 Base URL / 模型 / 协议，并给出「怎么申请 Key、填哪里、怎么选模型」的分步说明。
// 都必须是 OpenAI 兼容的 chat/completions 端点（我们只用这一种协议接第三方）。
//
// 维护说明：URL、模型名与额度以各家官方文档为准（见 providers 的 note/howto），改动时同步更新。

export const PROVIDER_PRESETS = [
  {
    id: 'intern',
    name: '书生·浦语（Intern-AI）',
    baseUrl: 'https://chat.intern-ai.org.cn/api/v1',
    model: 'intern-latest',
    apiStyle: 'chat',
    // 官方文档只列出 model/messages/n/temperature/top_p/stream/max_tokens/tools，
    // 不含 response_format：不要给它发 JSON 模式，靠提示词合同 + 补写链兜底。
    noJsonMode: true,
    keyUrl: 'https://internlm.intern-ai.org.cn/api/access-token',
    loginUrl: 'https://sso.openxlab.org.cn/login',
    // 官方 /api/v1/models 返回的整个书生系列（intern-latest 会自动指向最新版 intern-s2）
    models: ['intern-latest', 'intern-s2', 'intern-s1-pro', 'intern-s1', 'intern-s1-mini', 'internvl-latest'],
    note: '官方长期免费开放：约 30 RPM、每月 9000 万 tokens（以平台公告为准）；API Token 有效期 6 个月',
    howto: [
      '① 打开 {login} 用手机号注册并登录（书生账号）',
      '② 登录后打开 API 控制台：{key}',
      '③ 在控制台点「创建 / 生成 API Token」，复制完整 token（只在首次创建时完整显示一次；有效期 6 个月，失效需重建）',
      '④ 回到本页，把 token 粘到下面的「API Key」输入框（不用手动加 Bearer 前缀，应用会自己加）',
      '⑤ 模型默认为 intern-latest（自动跟随最新版）；想指定版本就在下面「模型」里选，或点「刷新模型列表」从接口拉取整个书生系列后选择（列表接口就是官方 /api/v1/models）',
      '⑥ 点「测试连接」验证 → 成功后点「保存并选用」'
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
    note: 'Token Plan：注册后首月每 5 小时 1500 次免费，之后为付费套餐',
    howto: [
      '① 打开 {key} 注册并登录商汤大装置',
      '② 在控制台中找到「API Key / 密钥管理」，创建一个 API Key 并复制',
      '③ 回到本页粘贴到「API Key」；模型默认 SenseChat-5（可点「刷新模型列表」看可用模型）',
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
    note: '按量付费（闲时价格较低）；模型也可填 deepseek-reasoner',
    howto: [
      '① 打开 {key} 登录（需先注册并充值）',
      '② 点「创建 API key」，复制生成的 key（只显示一次）',
      '③ 回到本页粘贴到「API Key」；模型填 deepseek-chat 或 deepseek-reasoner',
      '④ 点「测试连接」验证后「保存并选用」'
    ]
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    apiStyle: 'chat',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    loginUrl: 'https://open.bigmodel.cn/',
    note: 'glm-4-flash 系列长期免费；新用户另有赠送额度',
    howto: [
      '① 打开 {key} 登录智谱开放平台（手机号注册）',
      '② 在「API Keys」页点「添加新的 API Key」并复制',
      '③ 回到本页粘贴到「API Key」；模型可填 glm-4-flash（或点「刷新模型列表」选择）',
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
    note: '部分小模型（如 Qwen3-8B）免费；其余按量计费',
    howto: [
      '① 打开 {key} 登录（手机号注册）',
      '② 在「API 密钥」页新建密钥并复制',
      '③ 回到本页粘贴到「API Key」；模型可填 Qwen/Qwen3-8B，或点「刷新模型列表」选择',
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
