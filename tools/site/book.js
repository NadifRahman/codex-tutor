document.addEventListener('DOMContentLoaded', async () => {
  const themeToggle = document.querySelector('#theme-toggle')
  const updateThemeButton = () => {
    const dark = document.documentElement.dataset.theme === 'dark'
    themeToggle.textContent = dark ? 'Light mode' : 'Dark mode'
    themeToggle.setAttribute('aria-pressed', String(dark))
  }
  updateThemeButton()
  themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('course-book-theme', theme) } catch {}
    updateThemeButton()
  })

  if (window.renderMathInElement) {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false
    })
  }

  const input = document.querySelector('#search')
  const results = document.querySelector('#results')
  let index = []
  let searchUnavailable = false
  try {
    const response = await fetch('search.json')
    if (!response.ok) throw new Error(`Search index returned ${response.status}`)
    index = await response.json()
  } catch {
    searchUnavailable = true
  }

  const closeResults = () => {
    results.hidden = true
    input.setAttribute('aria-expanded', 'false')
  }

  const openResults = () => {
    results.hidden = false
    input.setAttribute('aria-expanded', 'true')
  }

  const appendHighlighted = (element, value, query) => {
    const lowerValue = value.toLowerCase()
    const lowerQuery = query.toLowerCase()
    let cursor = 0
    let match = lowerValue.indexOf(lowerQuery)
    while (match !== -1) {
      element.append(document.createTextNode(value.slice(cursor, match)))
      const mark = document.createElement('mark')
      mark.textContent = value.slice(match, match + query.length)
      element.append(mark)
      cursor = match + query.length
      match = lowerValue.indexOf(lowerQuery, cursor)
    }
    element.append(document.createTextNode(value.slice(cursor)))
  }

  const excerpt = (text, query) => {
    const match = text.toLowerCase().indexOf(query.toLowerCase())
    if (match === -1) return text.slice(0, 150)
    const start = Math.max(0, match - 65)
    const end = Math.min(text.length, match + query.length + 85)
    return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
  }

  const renderResults = (query) => {
    results.replaceChildren()
    if (searchUnavailable) {
      const message = document.createElement('p')
      message.className = 'search-message'
      message.textContent = 'Search is unavailable. Try reloading the page.'
      results.append(message)
      openResults()
      return
    }

    const lowerQuery = query.toLowerCase()
    const matches = index
      .map((entry) => {
        const title = `${entry.context ?? ''} ${entry.title}`.toLowerCase()
        const text = entry.text.toLowerCase()
        const titleMatch = title.indexOf(lowerQuery)
        const textMatch = text.indexOf(lowerQuery)
        return { entry, score: titleMatch === 0 ? 0 : titleMatch > 0 ? 1 : textMatch >= 0 ? 2 : 3, textMatch }
      })
      .filter((match) => match.score < 3)
      .sort((a, b) => a.score - b.score || a.textMatch - b.textMatch)
      .slice(0, 10)

    if (matches.length === 0) {
      const message = document.createElement('p')
      message.className = 'search-message'
      message.textContent = 'No matching slides.'
      results.append(message)
      openResults()
      return
    }

    for (const { entry } of matches) {
      const link = document.createElement('a')
      link.className = 'search-result'
      link.href = entry.path
      link.setAttribute('role', 'option')

      const context = document.createElement('span')
      context.className = 'search-result-context'
      context.textContent = entry.context ?? 'Course page'

      const title = document.createElement('strong')
      appendHighlighted(title, entry.title, query)

      const preview = document.createElement('span')
      preview.className = 'search-result-preview'
      appendHighlighted(preview, excerpt(entry.text, query), query)

      link.append(context, title, preview)
      results.append(link)
    }
    openResults()
  }

  input.addEventListener('input', () => {
    const query = input.value.trim()
    if (query.length < 2) {
      closeResults()
      return
    }
    renderResults(query)
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeResults()
    if (event.key === 'ArrowDown' && !results.hidden) {
      const firstResult = results.querySelector('a')
      if (firstResult) {
        event.preventDefault()
        firstResult.focus()
      }
    }
  })

  results.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeResults()
      input.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const links = [...results.querySelectorAll('a')]
    const current = links.indexOf(document.activeElement)
    const next = event.key === 'ArrowDown' ? Math.min(current + 1, links.length - 1) : Math.max(current - 1, 0)
    if (links[next]) {
      event.preventDefault()
      links[next].focus()
    }
  })

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-shell')) closeResults()
  })
})
