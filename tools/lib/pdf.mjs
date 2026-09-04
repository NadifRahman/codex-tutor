import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'

globalThis.DOMMatrix ??= DOMMatrix
globalThis.ImageData ??= ImageData
globalThis.Path2D ??= Path2D

const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
const standardFontDataUrl = `${path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/pdfjs-dist/standard_fonts'
)}${path.sep}`

export class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height)
    return { canvas, context: canvas.getContext('2d') }
  }

  reset(target, width, height) {
    target.canvas.width = width
    target.canvas.height = height
  }

  destroy(target) {
    target.canvas.width = 0
    target.canvas.height = 0
    target.canvas = null
    target.context = null
  }
}

export async function openPdf(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath))
  return getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl,
    CanvasFactory: NodeCanvasFactory,
    verbosity: 0
  }).promise
}

export async function extractPage(page) {
  const content = await page.getTextContent()
  const items = content.items
    .filter((item) => typeof item.str === 'string')
    .map((item) => ({
      text: item.str,
      transform: item.transform,
      width: item.width,
      height: item.height,
      font: item.fontName,
      lineBreak: Boolean(item.hasEOL)
    }))

  let text = ''
  for (const item of items) {
    text += item.text
    text += item.lineBreak ? '\n' : ' '
  }
  return { text: text.replace(/[ \t]+\n/g, '\n').trim(), items }
}

export async function renderPage(page, outputPath, scale = 2) {
  const viewport = page.getViewport({ scale })
  const factory = new NodeCanvasFactory()
  const target = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
  await page.render({ canvasContext: target.context, viewport, canvasFactory: factory }).promise
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const png = target.canvas.toBuffer('image/png')
  fs.writeFileSync(outputPath, png)
  factory.destroy(target)
  return png
}
