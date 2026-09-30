// 应用内下拉选择器：替代原生 <select>
// 原因：Android WebView 里 <select> 展开的是系统弹层（白底/系统字体/单选圆圈），与暗色主题完全不搭，
// 而且没法用 CSS 改。这里把原生控件隐藏，显示一个自绘按钮，点开走应用自己的弹窗。
import { openModal, closeModal } from './modals.js'
import { esc } from '../engine/util.js'
import { t } from '../engine/i18n.js'

/**
 * 打开应用风格的选择弹窗
 * @param {{title?:string, options:Array<{value:string,label:string}>, current?:string, onPick?:(v:string)=>void, emptyText?:string}} opts
 */
export function openPicker({ title, options, current, onPick, emptyText } = {}) {
  const list = Array.isArray(options) ? options : []
  const rows = list.length
    ? list.map(o => {
        const on = String(o.value) === String(current == null ? '' : current)
        return `<button class="pick-row${on ? ' on' : ''}" type="button" data-pick="${esc(o.value)}">` +
          `<span class="pick-label">${esc(o.label)}</span><span class="tick">✓</span></button>`
      }).join('')
    : `<div class="empty">${esc(emptyText || t('noOptions'))}</div>`

  const mask = openModal(
    `<h2 style="font-size:18px;margin-bottom:8px">${esc(title || t('pickOne'))}</h2>` +
    `<div class="pick-list">${rows}</div>` +
    `<div class="btn-row" style="margin-top:12px"><button class="btn" data-close type="button">${esc(t('cancel'))}</button></div>`
  )
  mask.querySelectorAll('[data-pick]').forEach(b => {
    b.onclick = () => {
      const v = b.getAttribute('data-pick')
      closeModal(mask)
      try { if (onPick) onPick(v) } catch (e) { /* ignore */ }
    }
  })
  return mask
}

/**
 * 把原生 <select> 升级为应用风格：隐藏原生控件 + 插入自绘按钮。
 * 选择结果写回 select 并派发 change 事件，所以原有 onchange/取值逻辑不用改。
 * 选项被代码动态改写时（innerHTML=）按钮文字会自动同步。
 * @returns {HTMLButtonElement|null}
 */
export function upgradeSelect(sel, { title } = {}) {
  if (!sel || sel.__awUpgraded) return sel ? (sel.__awBtn || null) : null
  sel.__awUpgraded = true
  sel.style.display = 'none'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'field-select'
  if (sel.id) btn.id = sel.id + '-btn'
  btn.setAttribute('aria-haspopup', 'listbox')

  const sync = () => {
    const opt = sel.options[sel.selectedIndex]
    btn.innerHTML = `<span class="fs-label">${esc(opt ? opt.textContent : '')}</span><span class="caret">▾</span>`
  }
  btn.onclick = () => {
    const options = Array.prototype.map.call(sel.options, o => ({ value: o.value, label: o.textContent }))
    openPicker({
      title: title || t('pickOne'),
      options,
      current: sel.value,
      onPick: (v) => {
        sel.value = v
        try { sel.dispatchEvent(new Event('change')) } catch (e) { /* ignore */ }
        sync()
      }
    })
  }
  if (sel.parentNode) sel.parentNode.insertBefore(btn, sel)
  sel.addEventListener('change', sync)
  if (typeof MutationObserver === 'function') {
    try { new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true }) } catch (e) { /* ignore */ }
  }
  sel.__awBtn = btn
  sync()
  return btn
}

/** 显隐一个已升级的 select（原生控件始终隐藏，只切按钮） */
export function setSelectVisible(sel, on) {
  if (!sel) return
  sel.style.display = 'none'
  if (sel.__awBtn) sel.__awBtn.style.display = on ? '' : 'none'
}
