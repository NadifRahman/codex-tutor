import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { extractPage, openPdf, renderPage } from '../tools/lib/pdf.mjs'

test('extracts text and renders a synthetic lecture slide', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-tutor-pdf-'))
  const pdfPath = path.join(tempDir, 'lecture.pdf')
  const imagePath = path.join(tempDir, 'slide.png')

  try {
    const document = await PDFDocument.create()
    const font = await document.embedFont(StandardFonts.Helvetica)
    const page = document.addPage([640, 360])
    page.drawText('CPU datapath and register file', { x: 50, y: 290, size: 24, font })
    page.drawRectangle({ x: 80, y: 100, width: 180, height: 100, borderColor: rgb(0, 0, 0), borderWidth: 2 })
    fs.writeFileSync(pdfPath, await document.save())

    const pdf = await openPdf(pdfPath)
    try {
      assert.equal(pdf.numPages, 1)
      const loadedPage = await pdf.getPage(1)
      const extracted = await extractPage(loadedPage)
      assert.match(extracted.text, /CPU datapath and register file/)
      await renderPage(loadedPage, imagePath, 1)
      assert.ok(fs.statSync(imagePath).size > 100)
      loadedPage.cleanup()
    } finally {
      await pdf.destroy()
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

