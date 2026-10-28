
window.__p605 = {
  vis(el) {
    if (!el) return false
    let n = el
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
      n = n.parentElement
    }
    return true
  },
  click(sel, text) {
    const list = [...document.querySelectorAll(sel)].filter((el) => __p605.vis(el))
    const hit = text == null ? list[0] : list.find((el) => (el.textContent || '').replace(/\s+/g, ' ').includes(text))
    if (!hit) throw new Error('找不到 ' + sel + (text == null ? '' : ' 含「' + text + '」') + '；候选=' + list.map((e) => (e.textContent || '').trim().slice(0, 10)).join('|'))
    hit.click()
    return (hit.textContent || '').trim().slice(0, 20)
  },
  clickIdx(sel, idx) {
    const list = [...document.querySelectorAll(sel)].filter((el) => __p605.vis(el))
    const hit = list[idx]
    if (!hit) throw new Error('找不到 ' + sel + '[' + idx + ']，可见数=' + list.length)
    hit.click()
    return list.length
  },
  count(sel) { return [...document.querySelectorAll(sel)].filter((el) => __p605.vis(el)).length },
  pick(kind) {
    const sel = kind === 'drawer' ? '.el-drawer' : '.el-dialog'
    const list = [...document.querySelectorAll(sel)].filter((el) => __p605.vis(el))
    return list.length ? list[list.length - 1] : null
  },
  env() {
    return { dark: document.documentElement.classList.contains('dark'), bodyOverflow: getComputedStyle(document.body).overflow }
  },
  measure(kind) {
    const el = __p605.pick(kind)
    if (!el) return { error: 'no-visible-' + kind }
    const innerH = window.innerHeight, innerW = window.innerWidth
    const r = el.getBoundingClientRect()
    const body = el.querySelector(kind === 'drawer' ? '.el-drawer__body' : '.el-dialog__body')
    const footer = el.querySelector(kind === 'drawer' ? '.el-drawer__footer' : '.el-dialog__footer')
    const out = {
      kind,
      title: (el.querySelector(kind === 'drawer' ? '.el-drawer__title' : '.el-dialog__title') || {}).textContent || '',
      innerW, innerH,
      rect: { left: +r.left.toFixed(1), top: +r.top.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) },
      bottomOver: +(r.bottom - innerH).toFixed(1),
      topOver: +(0 - r.top).toFixed(1),
      fits: r.bottom <= innerH + 0.5 && r.top >= -0.5,
      body: null, footerBtn: null
    }
    if (body) {
      const bs = getComputedStyle(body)
      const info = { scrollH: body.scrollHeight, clientH: body.clientHeight, needScroll: body.scrollHeight > body.clientHeight + 1, overflowY: bs.overflowY, scrollW: body.scrollWidth, clientW: body.clientWidth }
      if (info.needScroll) {
        body.scrollTop = body.scrollHeight
        const br = body.getBoundingClientRect()
        info.reachedBottom = Math.abs(body.scrollTop + body.clientHeight - body.scrollHeight) <= 2
        // 判据 1：body 自己的最后一个直接子节点（最后一段内容）要在 body 视口内
        const last = body.lastElementChild
        if (last) {
          const lr = last.getBoundingClientRect()
          // 最后一段如果是比滚动视口还高的块，只要求「底边能看到」（滚到底就是看到它的结尾）
          info.lastBlock = { text: (last.textContent || '').replace(/\s+/g, ' ').trim().slice(-40), top: +lr.top.toFixed(1), bottom: +lr.bottom.toFixed(1), height: +lr.height.toFixed(1), fullyVisible: lr.bottom <= br.bottom + 1 && lr.top >= br.top - 1, endReachable: lr.bottom <= br.bottom + 1 }
        }
        // 判据 2：body 内第一张自滚表格（el-table max-height）滚到底时最后一行可见
        const wrap = [...body.querySelectorAll('.el-table__body-wrapper')].find((w) => w.scrollHeight > w.clientHeight + 1)
        if (wrap) {
          wrap.scrollTop = wrap.scrollHeight
          const wr = wrap.getBoundingClientRect()
          const trs = [...wrap.querySelectorAll('tbody tr')].filter((t) => __p605.vis(t))
          const ltr = trs.length ? trs[trs.length - 1] : null
          if (ltr) {
            const lr = ltr.getBoundingClientRect()
            info.innerTable = { text: (ltr.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), top: +lr.top.toFixed(1), bottom: +lr.bottom.toFixed(1), fullyVisible: lr.bottom <= wr.bottom + 1 && lr.top >= wr.top - 1, wrapH: wrap.clientHeight, rows: trs.length }
          }
          wrap.scrollTop = 0
        }
        body.scrollTop = 0
      }
      out.body = info
    }
    if (footer) {
      const btn = footer.querySelector('.el-button--primary') || footer.querySelector('.el-button')
      if (btn) {
        const br = btn.getBoundingClientRect()
        const x = Math.round(br.left + br.width / 2), y = Math.round(br.top + br.height / 2)
        const hitEl = document.elementFromPoint(x, y)
        out.footerBtn = {
          text: (btn.textContent || '').trim().slice(0, 24),
          top: +br.top.toFixed(1), bottom: +br.bottom.toFixed(1),
          inViewport: br.bottom <= innerH + 0.5 && br.top >= -0.5 && br.right <= innerW + 0.5 && br.left >= -0.5,
          hit: !!hitEl && (hitEl === btn || btn.contains(hitEl)),
          hitTag: hitEl ? hitEl.tagName + (typeof hitEl.className === 'string' && hitEl.className ? '.' + hitEl.className.split(' ')[0] : '') : null
        }
      }
    }
    out.pass = out.fits && !!out.footerBtn && out.footerBtn.hit && (!out.body ||
      ((!out.body.lastBlock || out.body.lastBlock.endReachable) && (!out.body.innerTable || out.body.innerTable.fullyVisible)))
    return out
  },
  legacyOn() {
    if (document.getElementById('p605-legacy')) return
    const s = document.createElement('style')
    s.id = 'p605-legacy'
    s.textContent = [
      '.el-dialog:not(.is-fullscreen){display:block!important;max-height:none!important;overflow:visible!important;margin:6vh auto 50px!important;}',
      '.el-dialog:not(.is-fullscreen)>.el-dialog__header,.el-dialog:not(.is-fullscreen)>.el-dialog__footer{flex:none!important;}',
      '.el-dialog:not(.is-fullscreen)>.el-dialog__body{flex:none!important;min-height:0!important;overflow:visible!important;}',
      '.el-drawer{max-height:none!important;}',
      '.el-drawer>.el-drawer__body{min-height:auto!important;}'
    ].join('\n')
    document.head.appendChild(s)
  },
  legacyOff() { const e = document.getElementById('p605-legacy'); if (e) e.remove() },
  async step(st) {
    const deadline = Date.now() + (st.timeout || 15000)
    if (st.sleep) { await new Promise((r) => setTimeout(r, st.sleep)); return 'slept' }
    if (st.click) { return __p605.click(st.click.sel, st.click.text) }
    if (st.clickIdx) { return __p605.clickIdx(st.clickIdx.sel, st.clickIdx.idx) }
    while (Date.now() < deadline) {
      if (st.wait) {
        const list = [...document.querySelectorAll(st.wait.sel)].filter((el) => __p605.vis(el))
        const hit = st.wait.text == null ? list[0] : list.find((el) => (el.textContent || '').includes(st.wait.text))
        if (hit) return 'ok'
      }
      if (st.waitGone) {
        const list = [...document.querySelectorAll(st.waitGone.sel)].filter((el) => __p605.vis(el))
        if (!list.length) return 'ok'
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error('等待超时: ' + JSON.stringify(st))
  }
};
'ready'
