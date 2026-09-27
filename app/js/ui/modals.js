// 弹窗 / toast

export function openModal(html) {
  const box = document.getElementById('modals')
  const mask = document.createElement('div')
  mask.className = 'modal-mask'
  mask.innerHTML = `<div class="modal">${html}</div>`
  mask.addEventListener('click', e => {
    if (e.target === mask) closeModal()
    if (e.target.hasAttribute && e.target.hasAttribute('data-close')) closeModal()
  })
  mask.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal))
  box.appendChild(mask)
  return mask
}

export function closeModal() {
  const box = document.getElementById('modals')
  const masks = box.querySelectorAll('.modal-mask')
  if (masks.length > 1) {
    masks[masks.length - 1].remove()
  } else {
    box.innerHTML = ''
  }
}

export function toast(msg, ms) {
  const box = document.getElementById('toasts')
  const t = document.createElement('div')
  t.className = 'toast'
  t.innerHTML = msg
  box.appendChild(t)
  setTimeout(() => {
    t.classList.add('fade')
    setTimeout(() => t.remove(), 450)
  }, ms || 3800)
}

export function centerToast(msg, ms) {
  let el = document.getElementById('center-msg')
  if (!el) {
    el = document.createElement('div')
    el.id = 'center-msg'
    document.body.appendChild(el)
  }
  el.classList.remove('fade')
  el.innerHTML = msg
  clearTimeout(el._t)
  el._t = setTimeout(() => {
    el.classList.add('fade')
    setTimeout(() => el.remove(), 700)
  }, ms || 2600)
}
