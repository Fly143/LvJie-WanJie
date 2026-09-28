// 通用工具
export function esc(x) {
  return String(x == null ? '' : x)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 仅放行安全 CSS 颜色，防 style 属性注入 */
export function cssColor(v) {
  const s = String(v == null ? '' : v).trim()
  if (!s) return 'transparent'
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s
  if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/i.test(s)) return s
  if (/^hsla?\(\s*[\d.]+\s*(deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+\s*)?\)$/i.test(s)) return s
  if (/^(transparent|currentColor|inherit|initial|unset)$/i.test(s)) return s
  return 'transparent'
}

export function inVal(id) {
  const el = document.getElementById(id)
  return el ? el.value : ''
}

export function fmtNum(n) {
  if (n === Infinity) return '∞'
  if (n == null || isNaN(n)) n = 0
  n = Math.round(n * 10) / 10
  const neg = n < 0
  n = Math.abs(n)
  let s
  if (n >= 1e8) s = (n / 1e8) + '亿'
  else if (n >= 1e4) s = (n / 1e4) + '万'
  else s = String(n)
  return (neg ? '-' : '') + s
}

export function ageLabel(days) {
  days = Math.max(0, Math.floor(days))
  const y = Math.floor(days / 360)
  const m = Math.floor((days % 360) / 30)
  const d = days % 30
  return y + '岁' + m + '月' + d + '天'
}

export function ageLabelShort(days) {
  return ageLabel(days)
    .replace(/0月0天$/, '')
    .replace(/0天$/, '')
    .replace(/0月$/, '')
}

export function safeParseJSON(s) {
  try { return JSON.parse(s) } catch (e) { /* fallthrough */ }
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')) } catch (e) { return null }
}

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

export function pick(arr, i) {
  return arr[((i % arr.length) + arr.length) % arr.length]
}


/**
 * 货币默认不自动进位（100 下品不自动变 1 中品）。
 * 保留函数以便需要时显式整理；当前为 no-op。
 * 付款可用高阶抵低阶（1 中品抵 100 下品），见 spendMoney。
 */
export function normalizeMoney(S) {
  if (!S || !S.money) return
  const m = S.money
  m.main = Math.max(0, Math.round(Number(m.main) || 0))
  m.mid = Math.max(0, Math.round(Number(m.mid) || 0))
  m.high = Math.max(0, Math.round(Number(m.high) || 0))
}

/**
 * 扣款：cost 以最低档计。
 * 1 中品可抵 100 下品、1 上品可抵 100 中品（10000 下品）。
 * 不找零：用高档抵低档时整枚扣掉，超出不退。
 * @returns {{ok:boolean, paidMid?:number, paidHigh?:number, msg?:string}}
 */
export function spendMoney(S, cost) {
  if (!S || !S.money) return { ok: false, msg: '无货币' }
  const need = Math.max(0, Math.round(Number(cost) || 0))
  if (need <= 0) return { ok: true }
  const m = S.money
  const main = Math.max(0, Math.round(Number(m.main) || 0))
  const mid = Math.max(0, Math.round(Number(m.mid) || 0))
  const high = Math.max(0, Math.round(Number(m.high) || 0))

  if (main >= need) {
    m.main = main - need
    return { ok: true }
  }

  // 下品不够：先耗尽下品，用中品整枚抵（1 中品 = 100 下品），再上品（1 上品 = 100 中品 = 10000 下品）
  let short = need - main
  let useMid = 0
  let useHigh = 0

  const midsNeed = Math.ceil(short / 100)
  if (mid >= midsNeed) {
    useMid = midsNeed
  } else {
    useMid = mid
    short -= useMid * 100
    if (short > 0) {
      useHigh = Math.ceil(short / 10000)
      if (high < useHigh) return { ok: false, msg: '货币不足' }
    }
  }

  m.main = 0
  m.mid = mid - useMid
  m.high = high - useHigh
  return { ok: true, paidMid: useMid, paidHigh: useHigh }
}
