(() => {
  const key = `course-book-position:${location.pathname}`
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null')
    sessionStorage.removeItem(key)
    if (saved) window.addEventListener('load', () => {
      const anchor = saved.id && document.getElementById(saved.id)
      window.scrollTo(0, anchor ? anchor.getBoundingClientRect().top + window.scrollY + saved.offset : saved.y)
    })
  } catch {}
  const status = document.createElement('div')
  status.setAttribute('role', 'status')
  status.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:100;padding:8px 12px;background:#222;color:white;border-radius:8px;font:13px system-ui;max-width:360px'
  status.textContent = 'Live refresh connected'
  document.body.append(status)
  let revision = document.currentScript?.dataset.revision
  let pendingRevision, reloading = false
  const editorOpen = () => document.querySelector('.annotation-modal')?.hidden === false
  function refreshIfReady() {
    if (!pendingRevision || editorOpen() || reloading) return
    reloading = true
    const anchors = [...document.querySelectorAll('.slide-anchor')]
    const anchor = anchors.filter(element => element.getBoundingClientRect().top <= 100).at(-1)
    try {
      sessionStorage.setItem(key, JSON.stringify({ id: anchor?.id, offset: anchor ? -anchor.getBoundingClientRect().top : 0, y: window.scrollY }))
    } catch {}
    location.reload()
  }
  document.addEventListener('annotation-editor-closed', refreshIfReady)
  const events = new EventSource('/__live/events')
  events.onmessage = ({ data }) => {
    const update = JSON.parse(data)
    status.textContent = update.error ? 'Notes could not rebuild. Check the terminal; your last working book is still available.' : 'Live refresh connected'
    if (revision === undefined) revision = update.revision
    else if (!update.error && revision !== update.revision) {
      pendingRevision = update.revision
      refreshIfReady()
    }
  }
  events.onerror = () => { status.textContent = 'Live refresh disconnected — reconnecting…' }
})()
