// Opening a Star of the Day card in a print window.
//
// Shared because three places now print one: the entry form after recording,
// the recognition history as a cut-and-pin sheet, and an employee's own
// record. Keeping one copy means the fonts and artwork cannot drift between
// them, which would be invisible until somebody compared two printed cards.

import { buildStarCardHtml } from '../data/starCard.js'
import aramarkMark from '../assets/aramark-mark.png'
import starOutline from '../assets/star-outline.png'
import shoutMegaphone from '../assets/shout-megaphone.svg'
import cardScriptFont from '../assets/fonts/sacramento.woff2'
import cardLabelFont from '../assets/fonts/bebas-neue.woff2'
import cardDisplayFont from '../assets/fonts/antonio-bold.woff2'

let cached = null

// The print window is a document.write'd about:blank with no base URL of its
// own, so the fonts and artwork have to be named absolutely. They stay on this
// origin because the site sets no font-src and falls back to default-src
// 'self', which rules out inlining them as data: URIs.
//
// Resolved on first use rather than at module load, so importing this file
// does not require a window to exist.
export function cardAssets() {
  if (!cached) {
    const origin = window.location.origin
    cached = {
      script: new URL(cardScriptFont, origin).href,
      label: new URL(cardLabelFont, origin).href,
      display: new URL(cardDisplayFont, origin).href,
      logo: new URL(aramarkMark, origin).href,
      star: new URL(starOutline, origin).href,
      megaphone: new URL(shoutMegaphone, origin).href,
    }
  }
  return cached
}

// Markup for the in-app preview, which needs no window.
export function starCardPreviewHtml(card) {
  return buildStarCardHtml([card], { pad: false, fit: true, assets: cardAssets() })
}

// The record as it is stored carries everything the card needs except the
// person's name, which lives on the roster.
export function starCardFromRecognition(record, name) {
  return {
    name: name || String(record?.employeeId || ''),
    date: record?.date,
    criteria: record?.criteria || [],
    otherReason: record?.otherReason || '',
    message: record?.note || '',
    recognizedBy: record?.recognizedBy || '',
  }
}

// pad fills the page out to six so a part-full sheet still cuts cleanly; a
// single card printed from a screen leaves the rest of the page alone.
// Returns false when the browser blocked the pop-up, so the caller can say so.
export function openStarCardWindow(cards, { pad = false } = {}) {
  const printWindow = window.open('', '_blank', 'width=880,height=780')
  if (!printWindow) return false

  printWindow.document.open()
  printWindow.document.write(buildStarCardHtml(cards, { pad, assets: cardAssets() }))
  printWindow.document.close()
  printWindow.focus()

  // A document.write'd page has no load event to wait on, so give the layout a
  // tick to settle before the dialog opens over it.
  setTimeout(() => {
    try {
      printWindow.print()
    } catch {
      // The card is on screen either way and can be printed by hand if the
      // dialog is refused.
    }
  }, 400)

  return true
}
