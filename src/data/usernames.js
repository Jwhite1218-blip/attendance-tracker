// What a login is called when it signs in, beside its PIN.
//
// Liz, 2026-10-26: "just like their 1st initial and last name (eschmitt for
// example)". A suggestion only — the field on the access screen stays
// editable — but it is the suggestion every login will be named from, so
// it lives here where it can be tested rather than inside the form.
//
// The server normalises and validates independently (normalizeUsername in
// access-guards.mjs). This produces a candidate; that decides whether it is
// allowed.

export function suggestUsername(displayName) {
  const parts = String(displayName || '')
    // Accents folded rather than dropped: Núñez should suggest nunez, not
    // nez. NFD splits the letter from its mark, then the marks go.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

  if (parts.length === 0) return ''
  // A one-word name has no surname to abbreviate to, so it is used whole.
  if (parts.length === 1) return parts[0].slice(0, 40)
  // Everything after the first word is the surname: "Fils Aime" and
  // "Vasquez Carcamo" are single surnames in two words, and nfilsaime is
  // recognisable where nf is not.
  return `${parts[0][0]}${parts.slice(1).join('')}`.slice(0, 40)
}
