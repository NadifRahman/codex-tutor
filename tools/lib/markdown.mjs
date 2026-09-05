import MarkdownIt from 'markdown-it'
import katex from 'katex'

function sourceLocation(token, env) {
  const source = env?.sourcePath ?? '<markdown>'
  const line = token.meta?.sourceLine ?? (token.map ? token.map[0] + 1 : 1)
  return `${source}:${line}`
}

function renderMath(content, displayMode, token, env) {
  try {
    return katex.renderToString(content, {
      displayMode,
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: true,
      trust: false
    })
  } catch (error) {
    const summary = content.replace(/\s+/g, ' ').trim().slice(0, 100)
    throw new Error(`Invalid KaTeX at ${sourceLocation(token, env)} near \`${summary}\`: ${error.message}`)
  }
}

function lineText(state, line) {
  const start = state.bMarks[line] + state.tShift[line]
  return state.src.slice(start, state.eMarks[line])
}

function mathBlock(state, startLine, endLine, silent) {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false
  const opening = lineText(state, startLine).trim()
  if (!opening.startsWith('$$')) return false

  if (opening.length > 4 && opening.endsWith('$$')) {
    if (silent) return true
    const token = state.push('math_block', 'math', 0)
    token.block = true
    token.content = opening.slice(2, -2)
    token.map = [startLine, startLine + 1]
    token.markup = '$$'
    state.line = startLine + 1
    return true
  }

  if (opening !== '$$') return false
  if (silent) return true

  let nextLine = startLine + 1
  while (nextLine < endLine && lineText(state, nextLine).trim() !== '$$') nextLine++
  if (nextLine >= endLine) {
    const source = state.env?.sourcePath ?? '<markdown>'
    throw new Error(`Unclosed display-math delimiter at ${source}:${startLine + 1}`)
  }

  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = state.getLines(startLine + 1, nextLine, state.blkIndent, false).replace(/\n$/, '')
  token.map = [startLine, nextLine + 1]
  token.markup = '$$'
  state.line = nextLine + 1
  return true
}

function mathInline(state, silent) {
  const start = state.pos
  if (state.src[start] !== '$' || state.src[start + 1] === '$') return false

  let end = start + 1
  while (end < state.posMax) {
    if (state.src[end] === '\n') return false
    if (state.src[end] === '\\') {
      end += 2
      continue
    }
    if (state.src[end] === '$') break
    end++
  }
  if (end >= state.posMax || end === start + 1) return false

  const content = state.src.slice(start + 1, end)
  if (/^\s|\s$/.test(content)) return false
  if (silent) {
    state.pos = end + 1
    return true
  }

  const token = state.push('math_inline', 'math', 0)
  token.content = content
  token.markup = '$'
  token.meta = { relativeLine: state.src.slice(0, start).split('\n').length - 1 }
  state.pos = end + 1
  return true
}

function mathPlugin(markdown) {
  markdown.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  })
  markdown.inline.ruler.after('escape', 'math_inline', mathInline)
  markdown.core.ruler.after('inline', 'math_source_lines', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue
      const baseLine = token.map?.[0] ?? 0
      for (const child of token.children) {
        if (child.type === 'math_inline') child.meta.sourceLine = baseLine + child.meta.relativeLine + 1
      }
    }
  })
  markdown.renderer.rules.math_block = (tokens, index, options, env) => `${renderMath(tokens[index].content, true, tokens[index], env)}\n`
  markdown.renderer.rules.math_inline = (tokens, index, options, env) => renderMath(tokens[index].content, false, tokens[index], env)
}

export function createMarkdownRenderer() {
  return new MarkdownIt({ html: true, linkify: true, typographer: true }).use(mathPlugin)
}
