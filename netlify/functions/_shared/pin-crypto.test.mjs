import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decryptPin,
  encryptPin,
  generatePinKey,
  hasPinKey,
  pinKey,
  pinLengthOf,
  pinLookup,
  pinMatches,
} from './pin-crypto.mjs'

const KEY = 'a'.repeat(64)
const OTHER_KEY = 'b'.repeat(64)

function withKey(value, run) {
  const saved = process.env.ATTENDANCE_PIN_KEY
  if (value === undefined) delete process.env.ATTENDANCE_PIN_KEY
  else process.env.ATTENDANCE_PIN_KEY = value
  try {
    return run()
  } finally {
    if (saved === undefined) delete process.env.ATTENDANCE_PIN_KEY
    else process.env.ATTENDANCE_PIN_KEY = saved
  }
}

test('a PIN survives a round trip', () => {
  withKey(KEY, () => {
    for (const pin of ['1742', '0000', '9999', '12345678']) {
      assert.equal(decryptPin(encryptPin(pin)), pin, pin)
    }
  })
})

// A leading zero is a real PIN and must not come back as a number.
test('leading zeros are preserved', () => {
  withKey(KEY, () => {
    assert.equal(decryptPin(encryptPin('0042')), '0042')
    assert.equal(pinLengthOf('0042'), 4)
  })
})

test('the same PIN encrypts differently every time', () => {
  withKey(KEY, () => {
    const first = encryptPin('1742')
    const second = encryptPin('1742')
    assert.notEqual(first, second, 'a random IV each time')
    assert.equal(decryptPin(first), decryptPin(second))
  })
})

// Which is exactly why a second, deterministic column exists.
test('the lookup value is stable for a PIN and differs between PINs', () => {
  withKey(KEY, () => {
    assert.equal(pinLookup('1742'), pinLookup('1742'))
    assert.notEqual(pinLookup('1742'), pinLookup('1743'))
    assert.notEqual(pinLookup('1742'), pinLookup('01742'))
  })
})

test('a different key produces a different lookup and cannot decrypt', () => {
  const encrypted = withKey(KEY, () => encryptPin('1742'))
  const underA = withKey(KEY, () => pinLookup('1742'))
  const underB = withKey(OTHER_KEY, () => pinLookup('1742'))
  assert.notEqual(underA, underB)
  withKey(OTHER_KEY, () => {
    assert.throws(() => decryptPin(encrypted))
  })
})

// GCM is authenticated: a row edited in the database must fail rather than
// decrypt to something arbitrary.
test('a tampered value is refused, not quietly accepted', () => {
  withKey(KEY, () => {
    const encrypted = encryptPin('1742')
    const [version, iv, tag, payload] = encrypted.split('.')
    const flipped = Buffer.from(payload, 'base64url')
    flipped[0] ^= 0xff
    assert.throws(() => decryptPin([version, iv, tag, flipped.toString('base64url')].join('.')))
    assert.throws(() => decryptPin([version, iv, 'AAAAAAAAAAAAAAAAAAAAAA', payload].join('.')))
  })
})

test('a malformed or foreign stored value is refused clearly', () => {
  withKey(KEY, () => {
    for (const broken of ['', 'nonsense', 'v1.only.three', 'v2.a.b.c', 'v1...']) {
      assert.throws(() => decryptPin(broken), /not in a format|malformed/, JSON.stringify(broken))
    }
  })
})

test('a missing or malformed key fails loudly rather than weakening every PIN', () => {
  withKey(undefined, () => {
    assert.equal(hasPinKey(), false)
    assert.throws(() => pinKey(), /not configured/)
    assert.throws(() => encryptPin('1742'), /not configured/)
  })
  for (const bad of ['', 'short', 'z'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
    withKey(bad, () => {
      assert.equal(hasPinKey(), false, bad)
      assert.throws(() => pinKey(), /not configured|64 hexadecimal/, bad)
    })
  }
})

test('an empty PIN is refused by both paths', () => {
  withKey(KEY, () => {
    assert.throws(() => encryptPin(''), /A PIN is required/)
    assert.throws(() => pinLookup(''), /A PIN is required/)
    assert.throws(() => encryptPin(null), /A PIN is required/)
  })
})

test('comparison is length-safe and exact', () => {
  assert.equal(pinMatches('1742', '1742'), true)
  assert.equal(pinMatches('1742', '1743'), false)
  assert.equal(pinMatches('1742', '17420'), false, 'a prefix is not a match')
  assert.equal(pinMatches('', ''), true)
  assert.equal(pinMatches(null, undefined), true, 'both absent compare equal, callers guard emptiness')
})

test('the generated key is accepted by the key reader', () => {
  const generated = generatePinKey()
  assert.match(generated, /^[0-9a-f]{64}$/)
  withKey(generated, () => {
    assert.equal(hasPinKey(), true)
    assert.equal(decryptPin(encryptPin('1742')), '1742')
  })
})
