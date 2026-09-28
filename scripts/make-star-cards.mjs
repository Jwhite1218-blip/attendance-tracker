// Prints Star of the Day cards for the bulletin board, six to a US Letter page.
//
//   node scripts/make-star-cards.mjs > star-cards.html
//   node scripts/make-star-cards.mjs filled.json > star-cards.html
//
// filled.json is an array of { name, date, criteria: [...], message, recognizedBy }.
// Any page not filled is padded with blank cards so the sheet still cuts cleanly.
//
// The card itself is defined in src/data/starCard.js, which the app also uses
// for the Print star card button — so a card printed in bulk here and one
// printed from a manager's screen are the same card.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildStarCardHtml } from '../src/data/starCard.js'

const inputPath = process.argv[2]
const entries = inputPath ? JSON.parse(readFileSync(inputPath, 'utf8')) : []

if (!Array.isArray(entries)) {
  console.error('Expected the input file to contain an array of card entries.')
  process.exit(1)
}

// Inlined, unlike the app's print popup: this writes one HTML file that is
// opened straight from disk or emailed on, with no server to fetch the fonts
// and artwork from. A local file carries no CSP, so data: URIs are fine here.
function dataUri(relativePath, mimeType) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  return `data:${mimeType};base64,${readFileSync(path).toString('base64')}`
}

const assets = {
  script: dataUri('../src/assets/fonts/sacramento.woff2', 'font/woff2'),
  label: dataUri('../src/assets/fonts/bebas-neue.woff2', 'font/woff2'),
  display: dataUri('../src/assets/fonts/antonio-bold.woff2', 'font/woff2'),
  logo: dataUri('../src/assets/aramark-mark.png', 'image/png'),
  star: dataUri('../src/assets/star-outline.png', 'image/png'),
}

process.stdout.write(buildStarCardHtml(entries, {
  assets,
  screenNote: 'Star of the Day cards — 4" × 3.5", six per page',
}))
