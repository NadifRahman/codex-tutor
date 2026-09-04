export async function attemptOcr({ currentText, image, recognize }) {
  try {
    const text = await recognize(image)
    return { text, usedOcr: true, warning: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { text: currentText, usedOcr: false, warning: message }
  }
}

