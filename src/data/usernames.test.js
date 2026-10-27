import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestUsername } from './usernames.js'

// Liz, 2026-10-26: "just like their 1st initial and last name (eschmitt for
// example)". Only a suggestion — the field stays editable — but it is the
// suggestion nineteen logins will be named from, so it has to behave.
test('first initial and last name, as Liz described it', () => {
  assert.equal(suggestUsername('Elizabeth Schmitt'), 'eschmitt')
  assert.equal(suggestUsername('Chris Martin'), 'cmartin')
})

// Two Schmitts work in this district. The suggestion separates them; the
// unique index catches it if it ever does not.
test('two people with one surname get different suggestions', () => {
  assert.notEqual(suggestUsername('Elizabeth Schmitt'), suggestUsername('Maureen Schmitt'))
})

test('a surname in two parts keeps both, so it stays recognisable', () => {
  assert.equal(suggestUsername('Nimose Fils Aime'), 'nfilsaime')
  assert.equal(suggestUsername('Claudia Vasquez Carcamo'), 'cvasquezcarcamo')
})

// Accents are folded rather than dropped. Losing them would turn a name
// into initials nobody recognises.
test('accented names survive as letters', () => {
  assert.equal(suggestUsername('José Núñez'), 'jnunez')
})

test('a one-word login name suggests that word', () => {
  assert.equal(suggestUsername('Reception'), 'reception')
})

test('nothing to go on suggests nothing, rather than a stray letter', () => {
  assert.equal(suggestUsername(''), '')
  assert.equal(suggestUsername('   '), '')
  assert.equal(suggestUsername(null), '')
})

test('a suggestion never exceeds what the field accepts', () => {
  assert.ok(suggestUsername(`Bartholomew ${'Longname'.repeat(10)}`).length <= 40)
})
