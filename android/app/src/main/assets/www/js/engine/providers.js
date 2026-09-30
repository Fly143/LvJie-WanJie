// 常用服务商预设：一键填好 Base URL / 模型 / 协议，玩家只需贴自己的 API Key。
// 都必须是 OpenAI 兼容的 chat/completions 端点（我们只用这一种协议接第三方）。
//
// 维护说明：URL 与模型名以各家官方文档为准，改动时同步更新 keyUrl 与 note。

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
    keyUrl: 'https://chat.intern-ai.org.cn/',
    note: '免费开放：约 30 RPM、每月 9000 万 tokens（以平台公告为准）；注册后在控制台取 token'
  },
  {
    id: 'sensenova',
    name: '商汤日日新（SenseNova）',
    baseUrl: 'https://api.sensenova.cn/compatible-mode/v2',
    model: 'SenseChat-5',
    apiStyle: 'chat',
    keyUrl: 'https://platform.sensenova.cn/',
    note: 'Token Plan：注册后首月每 5 小时 1500 次免费，之后为付费套餐'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiStyle: 'chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: '按量付费（闲时价格较低）；模型名也可填 deepseek-reasoner'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    apiStyle: 'chat',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: 'glm-4-flash 系列长期免费；新用户另有赠送额度'
  },
  {
    id: 'siliconflow',
    name: '硅基流动（SiliconFlow）',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3-8B',
    apiStyle: 'chat',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    note: '部分小模型（如 Qwen3-8B）免费；其余按量计费'
  }
]

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
