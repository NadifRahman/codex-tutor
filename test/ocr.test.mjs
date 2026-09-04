import assert from 'node:assert/strict'
import test from 'node:test'
import { attemptOcr } from '../tools/lib/ocr.mjs'

test('returns recognized text after successful OCR', async () => {
  const result = await attemptOcr({
    currentText: '',
    image: Buffer.from('image'),
    recognize: async () => 'Recognized slide text'
  })
  assert.deepEqual(result, { text: 'Recognized slide text', usedOcr: true, warning: null })
})

test('preserves embedded text and reports a warning when OCR fails', async () => {
  const result = await attemptOcr({
    currentText: 'Sparse embedded text',
    image: Buffer.from('invalid png'),
    recognize: async () => { throw new Error('PNG CRC error') }
  })
  assert.equal(result.text, 'Sparse embedded text')
  assert.equal(result.usedOcr, false)
  assert.match(result.warning, /PNG CRC error/)
})

