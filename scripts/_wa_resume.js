const fs = require('fs')
const path = 'D:/DS/AgentWorlds/app/js/ui/world-author.js'
let src = fs.readFileSync(path, 'utf8')

const startMark = 'async function runGenerate()'
const endMark = "  document.getElementById('cw-validate').onclick"
const start = src.indexOf(startMark)
const end = src.indexOf(endMark)
if (start < 0 || end < 0 || end <= start) {
  console.error('markers not found', start, end)
  process.exit(1)
}

const next = `async function runGenerate(opts) {
    const resume = !!(opts && opts.resume)
    const f = draftFromForm()
    if (!f.title && !f.bookText && !f.urls.length) { toast(t('waNeedFill')); return }
    const title = f.title || t('waUntitled')
    const keyObj = activeKey(app)
    if (!keyObj) {
      status.textContent = t('waNoKeyHint')
      toast(t('waNeedKey2'))
      try {
        closeModal()
        openKeyModal(app, { save: () => {}, refreshAll: () => {} })
      } catch (e) { /* ignore */ }
      return
    }

    // 新一轮完整生成：清缓存；续接：沿用缓存
    const canResume = resume && genCache.next && genCache.next !== 'web'
    if (!canResume) {
      resetGenCache('web')
      genCache.bookTitle = title
    }
    const startAt = canResume ? genCache.next : 'web'

    const btn = document.getElementById('cw-gen')
    const stop = document.getElementById('cw-gen-stop')
    const rbtn = document.getElementById('cw-gen-resume')
    btn.disabled = true
    if (rbtn) rbtn.disabled = true
    stop.hidden = false
    startGenClock()
    const panel = document.getElementById('cw-progress-panel')
    if (panel) {
      panel.hidden = false
      try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) } catch (e) { /* ignore */ }
    }
    // 续接时保留已完成步骤的绿勾
    if (!canResume) {
      resetSteps()
    } else {
      setProgressTitle(t('waResumeFrom') + '「' + t('step_' + startAt) + '」')
      const order = STEP_IDS
      const startIdx = order.indexOf(startAt)
      order.forEach((s, i) => {
        if (i < startIdx) {
          const detail = s === 'web' && genCache.webNotes.length
            ? genCache.webNotes.length + t('waWebNotes')
            : (s === 'draft' ? '' : t('step_ok'))
          setStep(s, 'done', detail)
        }
      })
    }

    genCtl = new AbortController()
    stop.onclick = () => {
      try { genCtl.abort() } catch (e) {}
      setProgressTitle(t('waCancelled'))
      STEP_IDS.forEach(s => {
        const el = stepEl(s)
        if (el && el.dataset.state === 'run') setStep(s, 'err', t('waCancelled'))
      })
      const st = document.getElementById('cw-status')
      if (st) {
        st.style.color = 'var(--red)'
        st.textContent = t('waCancelled')
      }
      stopGenClock()
      btn.disabled = false
      if (rbtn) rbtn.disabled = false
      stop.hidden = true
    }

    try {
      let webNotes = genCache.webNotes || []
      let user = genCache.userFinal || ''
      let needLore = startAt === 'web' || startAt === 'lore'
      let needNpc = startAt === 'web' || startAt === 'lore' || startAt === 'npc'
      let needDraft = true

      // ---- ① 联网补充 ----
      if (startAt === 'web') {
        const wantWeb = !!(f.useWeb || f.urls.length)
        if (wantWeb) {
          setStep('web', 'run', t('step_web_run'))
          setProgress(8, t('step_web_run'))
          const g = await gatherWebLore({
            title,
            urls: f.urls,
            useWiki: f.useWiki,
            onProgress: (p) => {
              const hits = (p && p.hits) || 0
              const done = (p && p.done) || 0
              const total = (p && p.total) || 1
              const pct = 8 + Math.min(22, hits * 6 + (done / Math.max(1, total)) * 8)
              setProgress(pct, p.message || '')
              setStep('web', 'run', p.message || '')
            }
          })
          webNotes = g.ok ? g.notes : []
          genCache.webNotes = webNotes
          if (!webNotes.length) {
            setStep('web', 'err', t('waWebEmpty'))
            setProgress(30, t('waWebEmpty'))
          } else {
            setStep('web', 'done', t('step_web_done') + ' · ' + webNotes.length + t('waWebNotes'))
            setProgress(32, t('step_web_done'))
          }
        } else {
          webNotes = []
          genCache.webNotes = []
          setStep('web', 'skip', t('step_web_skip'))
          setProgress(32, t('step_web_skip'))
        }
        genCache.next = 'lore'
      }

      const hasBook = f.bookText.length >= 800
      genCache.hasBook = hasBook

      // ---- ② 设定考据 ----
      if (needLore) {
        if (!hasBook && !webNotes.length && !f.setting) {
          failStep('lore', t('waNeedSrc'))
          return
        }
        if (hasBook || webNotes.length) {
          const ch = hasBook ? sampleBookChunks(f.bookText) : { samples: [], chapters: 0, totalChars: 0 }
          genCache.samples = ch.samples
          setStep('lore', 'run', hasBook
            ? \`\${ch.totalChars} \${t('waChars')} · \${t('waSample')} \${ch.samples.length} \${t('waSample2')}\`
            : t('waWebMerge'))
          setProgress(36, hasBook
            ? \`\${ch.totalChars} \${t('waChars')} · \${t('waSample')} \${ch.samples.length} \${t('waSample2')}\`
            : t('waWebMerge'))
          const onLoreProgress = (p) => {
            const msg = (p && p.message) || ''
            const step = (p && p.step) || 1
            const total = (p && p.total) || 1
            const pct = 36 + Math.min(18, (step / Math.max(1, total)) * 18)
            setProgress(pct, msg)
            setStep('lore', 'run', msg)
          }
          const ex = hasBook
            ? await extractBookFacts({
                keyObj,
                title,
                author: f.author,
                samples: ch.samples,
                signal: genCtl.signal,
                webNotes,
                onProgress: onLoreProgress
              })
            : await mergeWebOnly({
                keyObj,
                title,
                author: f.author,
                webNotes,
                signal: genCtl.signal,
                onProgress: onLoreProgress
              })
          if (!ex.ok) {
            if (ex.aborted) {
              setProgressTitle(t('waCancelled'))
              setStep('lore', 'err', t('waCancelled'))
              const st = document.getElementById('cw-status')
              if (st) { st.style.color = 'var(--red)'; st.textContent = t('waCancelled') }
              stopGenClock()
              genCache.next = 'lore'
              showResumeBtn()
            } else {
              failStep('lore', (ex.error || ''))
            }
            return
          }
          user = bibleToUserBrief(title, f.author, ex.bible)
          if (f.levels) user += \`\\n用户补充等级提示：\${f.levels}\`
          if (f.setting) user += \`\\n用户补充设定：\${f.setting}\`
          genCache.userBrief = user
          genCache.facts = ex.facts || []
          genCache.bible = ex.bible
          setStep('lore', 'done', t('step_lore_done'))
          setProgress(55, t('step_lore_done'))
        } else {
          user = \`作品：\${title}\${f.author ? '（' + f.author + '）' : ''}
题材风格：\${f.style}
设定摘要：\${f.setting || '（请根据作品常识补全）'}
等级体系提示：\${f.levels || '（请自行设计 5~12 阶）'}

请输出完整世界包 JSON。\`
          genCache.userBrief = user
          genCache.facts = []
          genCache.bible = null
          setStep('lore', 'done', t('waSimpleInput'))
          setProgress(70, t('waGenDraft'))
        }
        genCache.next = 'npc'
      } else {
        user = genCache.userFinal || genCache.userBrief || ''
      }

      // ---- ③ 人物种子（失败不阻断出包）----
      if (needNpc && genCache.userBrief) {
        user = genCache.userBrief
        try {
          setStep('npc', 'run', t('waNpcSeed'))
          setProgress(60, t('waNpcSeed'))
          const chs = await buildCharacterSeeds({
            keyObj,
            title,
            facts: genCache.facts || [],
            bible: genCache.bible,
            samples: genCache.samples || [],
            signal: genCtl.signal,
            useWeb: f.useWeb || f.urls.length > 0,
            fetchCharacterLore,
            onProgress: (p) => {
              const msg = (p && p.message) || ''
              setProgress(60 + Math.min(12, ((p && p.step) || 1) * 3), msg)
              setStep('npc', 'run', msg)
            }
          })
          if (chs.ok && chs.npc_seeds.length) {
            user += npcSeedsToBrief(chs.npc_seeds)
            setStep('npc', 'done', \`\${t('waNpcSeeded')} \${chs.npc_seeds.length} \${t('waNpcSeeded2')}\`)
            setProgress(72, \`\${t('waNpcSeeded')} \${chs.npc_seeds.length} \${t('waNpcSeeded2')}\`)
          } else if (!chs.ok && chs.aborted) {
            setStep('npc', 'err', t('waCancelled'))
            setProgressTitle(t('waCancelled'))
            const st = document.getElementById('cw-status')
            if (st) { st.style.color = 'var(--red)'; st.textContent = t('waCancelled') }
            stopGenClock()
            genCache.next = 'npc'
            genCache.userFinal = ''
            showResumeBtn()
            return
          } else {
            setStep('npc', 'skip', t('waNpcNone'))
            setProgress(72, t('waNpcNone'))
          }
        } catch (e) {
          console.warn('npc seeds', e)
          setStep('npc', 'err', (e && e.message) || '')
        }
        setProgress(75, t('waMerged'))
      } else if (startAt === 'draft') {
        // 续接出包：前面步骤已在缓存
        user = genCache.userFinal || genCache.userBrief
        if (!user) {
          failStep('draft', t('waResumeHint'))
          return
        }
        STEP_IDS.forEach(s => {
          if (s !== 'draft' && s !== 'npc') {
            const el = stepEl(s)
            if (el && el.dataset.state !== 'done' && el.dataset.state !== 'skip') setStep(s, 'done')
          }
        })
      }
      genCache.userFinal = user
      genCache.next = 'draft'

      // ---- ④ 出包 ----
      if (needDraft) {
        setStep('draft', 'run', t('waGenDraft'))
        setProgress(82, t('waGenDraft'))
        const draftT0 = Date.now()
        genHb = setInterval(() => {
          const sec = Math.floor((Date.now() - draftT0) / 1000)
          setProgress(82 + Math.min(14, sec / 4), t('waGenDraft') + ' (' + sec + 's)')
          setStep('draft', 'run', t('waGenDraft') + ' (' + sec + 's)')
        }, 1500)
        let res
        try {
          res = await callLLM({
            keyObj,
            system: PACK_DRAFT_PROMPT,
            user,
            signal: genCtl.signal,
            maxTokens: MAX_TOKENS_DRAFT
          })
        } finally {
          if (genHb) { clearInterval(genHb); genHb = null }
        }
        if (!res.ok) {
          failStep('draft', res.error || '')
          return
        }
        const json = extractGameJSON(res.text)
        if (!json) {
          failStep('draft', t('waNoJson'))
          jsonEl.value = res.text.slice(0, 12000)
          return
        }
        if (!json.id || getPack(json.id) || hasCustomPack(json.id)) {
          json.id = 'book-' + hashId(title) + '-' + String(Date.now()).slice(-5)
        }
        if (BUILTIN_HIT(json.id)) json.id = json.id + '-x'
        jsonEl.value = JSON.stringify(json, null, 2)
        const v = validatePackDraft(json)
        if (v.ok) {
          setStep('draft', 'done', t('step_draft_done'))
          finishOk(\`\${t('waDraftOk')}\${v.pack.name}（\${v.pack.tiers.length} \${t('waTiers')} · \${v.pack._decl.map.length} \${t('waLands')}）。\${t('waEditable')}\`)
          msg.textContent = ''
        } else {
          failStep('draft', v.errors.join('; '))
          const st = document.getElementById('cw-status')
          if (st) st.textContent = t('waDraftNeedFix') + v.errors.join('; ')
        }
      }
    } finally {
      btn.disabled = false
      if (rbtn) rbtn.disabled = false
      stop.hidden = true
      genCtl = null
    }
  }

`

src = src.slice(0, start) + next + src.slice(end)
fs.writeFileSync(path, src, 'utf8')
console.log('replaced runGenerate, new length', src.length)
