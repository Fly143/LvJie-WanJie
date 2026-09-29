// 弹窗 / toast

export function openModal(html) {
  const box = document.getElementById('modals')
  const mask = document.createElement('div')
  mask.className = 'modal-mask'
  mask.innerHTML = `<div class="modal">${html}</div>`
  mask.addEventListener('click', e => {
    if (e.target === mask) closeModal(mask)
    if (e.target.hasAttribute && e.target.hasAttribute('data-close')) closeModal(mask)
  })
  mask.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(mask)))
  box.appendChild(mask)
  return mask
}

/**
 * 应用内确认框（替代 window.confirm，避免 WebView 弹出 127.0.0.1 系统框）
 * @returns {Promise<boolean>}
 */
export function confirmModal(message, { okText, cancelText, title } = {}) {
  return new Promise(resolve => {
    const box = document.getElementById('modals')
    const mask = document.createElement('div')
    mask.className = 'modal-mask'
    const ok = okText || '确定'
    const cancel = cancelText || '取消'
    // 文案默认按纯文本转义，防 LLM/存档字段 XSS；确需 HTML 用 confirmModalHtml
    mask.innerHTML = `
      <div class="modal" style="max-width:360px;text-align:center">
        ${title ? `<h2 style="font-size:18px;margin-bottom:8px">${escapeText(title)}</h2>` : ''}
        <p style="color:var(--text);font-size:15px;line-height:1.55;margin:8px 0 18px">${escapeText(message)}</p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn" type="button" data-close>${escapeText(cancel)}</button>
          <button class="btn btn-gold" type="button" data-ok>${escapeText(ok)}</button>
        </div>
      </div>
    `
    let settled = false
    const done = (v) => {
      if (settled) return
      settled = true
      try { mask.remove() } catch (e) { /* ignore */ }
      resolve(v)
    }
    mask.addEventListener('click', e => {
      if (e.target === mask) done(false)
      if (e.target.hasAttribute && e.target.hasAttribute('data-close')) done(false)
      if (e.target.hasAttribute && e.target.hasAttribute('data-ok')) done(true)
    })
    box.appendChild(mask)
  })
}

/** 关闭指定弹窗；无参时关闭最上层（兼容旧调用） */
export function closeModal(mask) {
  const box = document.getElementById('modals')
  const target = (mask && mask.classList && mask.classList.contains('modal-mask')) ? mask : null
  if (target) {
    target.remove()
    return
  }
  const masks = box.querySelectorAll('.modal-mask')
  if (masks.length > 1) {
    masks[masks.length - 1].remove()
  } else {
    box.innerHTML = ''
  }
}

// toast 默认按纯文本渲染，防 LLM/存档字段 XSS；需要 HTML 时用 toastHtml（调用方必须先 esc）
export function toast(msg, ms) {
  toastHtml(escapeText(msg), ms)
}

export function toastHtml(html, ms) {
  const box = document.getElementById('toasts')
  const t = document.createElement('div')
  t.className = 'toast'
  t.innerHTML = html
  box.appendChild(t)
  setTimeout(() => {
    t.classList.add('fade')
    setTimeout(() => t.remove(), 450)
  }, ms || 3800)
}

export function centerToast(msg, ms) {
  centerToastHtml(escapeText(msg), ms)
}

export function centerToastHtml(html, ms) {
  let el = document.getElementById('center-msg')
  if (!el) {
    el = document.createElement('div')
    el.id = 'center-msg'
    document.body.appendChild(el)
  }
  el.classList.remove('fade')
  el.innerHTML = html
  clearTimeout(el._t)
  el._t = setTimeout(() => {
    el.classList.add('fade')
    setTimeout(() => el.remove(), 700)
  }, ms || 2600)
}

function escapeText(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
