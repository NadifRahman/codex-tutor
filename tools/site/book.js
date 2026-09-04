document.addEventListener('DOMContentLoaded', async () => {
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
  const index = await fetch('search.json').then((response) => response.json())
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase()
    if (query.length < 2) {
      results.innerHTML = ''
      return
    }
    const matches = index.filter((page) => `${page.title} ${page.text}`.toLowerCase().includes(query)).slice(0, 12)
    results.innerHTML = `<h2>Results</h2>${matches.map((page) => `<a href="${page.path}">${page.title}</a>`).join('') || '<p>No matches</p>'}`
  })
})
