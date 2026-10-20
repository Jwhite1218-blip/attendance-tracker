import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// `npm test` names every test file by hand rather than globbing, so a new
// test file does nothing until somebody remembers to add it. That failure is
// silent and it points the wrong way: the suite goes green while the tests
// you just wrote never ran. It happened on 2026-10-19 with the approval
// request tests, which passed on their own and were invisible to `npm test`.
//
// This is the cheapest guard against it. If you add a test file, this one
// fails until the script knows about it.

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')

test('every test file on disk is actually run by npm test', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const listed = new Set(
    String(pkg.scripts.test).split(/\s+/).filter(argument => argument.includes('.test.'))
  )

  // git, rather than a directory walk, so node_modules and build output are
  // excluded for free and an untracked scratch file is not a failure.
  const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(file => /\.test\.(js|mjs)$/.test(file))

  const missing = tracked.filter(file => !listed.has(file))
  assert.deepEqual(
    missing,
    [],
    `These test files are committed but never run. Add them to the "test" script in package.json:\n  ${missing.join('\n  ')}`
  )

  // And the reverse: a renamed or deleted file left in the script makes the
  // whole command fail with a confusing module-not-found error.
  const trackedSet = new Set(tracked)
  const stale = [...listed].filter(file => !trackedSet.has(file))
  assert.deepEqual(stale, [], `These are named in the "test" script but no longer exist:\n  ${stale.join('\n  ')}`)
})
