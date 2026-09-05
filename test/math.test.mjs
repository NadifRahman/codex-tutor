import assert from 'node:assert/strict'
import test from 'node:test'
import { createMarkdownRenderer } from '../tools/lib/markdown.mjs'

const markdown = createMarkdownRenderer()

test('renders math before Markdown can reinterpret its contents', () => {
  const source = String.raw`Inline $a * b$, $\{x\}\_\%\#\&$, and $x < y$.

$$
\begin{aligned}
x &= 1 \\
-y &= 2
\end{aligned}

= z
$$`
  const html = markdown.render(source, { sourcePath: 'edge-cases.md' })

  assert.match(html, /class="katex"/)
  assert.match(html, /class="katex-display"/)
  assert.doesNotMatch(html, /<h1>|<ul>|<blockquote>|<em>/)
  assert.doesNotMatch(html, /<p>\$\$/)
})

test('leaves escaped currency and code alone', () => {
  const html = markdown.render('Cost: \\$5. Code: `$value`. Math: $x+1$.', { sourcePath: 'prose.md' })

  assert.match(html, /Cost: \$5/)
  assert.match(html, /<code>\$value<\/code>/)
  assert.match(html, /class="katex"/)
})

test('reports invalid and unclosed display math with a source line', () => {
  assert.throws(
    () => markdown.render('# Title\n\n$$\n\\notARealCommand{x}\n$$', { sourcePath: 'broken.md' }),
    /Invalid KaTeX at broken\.md:3/
  )
  assert.throws(
    () => markdown.render('# Title\n\n$$\nx + y', { sourcePath: 'unclosed.md' }),
    /Unclosed display-math delimiter at unclosed\.md:3/
  )
})
