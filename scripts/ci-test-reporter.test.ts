import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test, { type TestContext } from 'node:test'
import type { TestEvent } from 'node:test/reporters'
import ciTestReporter from './ci-test-reporter.ts'

// Node imports custom reporters as ESM; Windows drive-letter paths are not valid module URLs.
const reporter = new URL('./ci-test-reporter.ts', import.meta.url).href

function runFixture(t: TestContext, source: string) {
    const root = mkdtempSync(path.join(tmpdir(), 'vpt-ci-reporter-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const fixture = path.join(root, 'fixture.test.mjs')
    writeFileSync(fixture, source)
    const result = spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, fixture], {
        cwd: root,
        encoding: 'utf8',
        // Start an independent runner instead of inheriting the parent test worker's recursion guard.
        env: { ...process.env, NODE_TEST_CONTEXT: undefined },
        timeout: 10_000
    })
    assert.ifError(result.error)
    assert.equal(result.signal, null)
    return result
}

test('CI reporter module specifier is a file URL, not a native absolute path', () => {
    assert.equal(new URL(reporter).protocol, 'file:')
})

test('CI reporter hides passing, skipped and TODO tests while retaining totals and logs', (t) => {
    const result = runFixture(
        t,
        `
            import test, { describe } from 'node:test'
            describe('passing suite marker', () => {
                test('passing test marker', (t) => {
                    console.log('stdout marker')
                    console.error('stderr marker')
                    t.diagnostic('diagnostic marker')
                })
                test.skip('skipped test marker', () => {})
                test.todo('pending test marker')
                test('known failure marker', { todo: '' }, () => { throw new Error('TODO error marker') })
            })
        `
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.doesNotMatch(
        result.stdout,
        /passing (?:suite|test) marker|skipped test marker|pending test marker|known failure marker|TODO error marker/
    )
    assert.match(result.stdout, /tests 4/)
    assert.match(result.stdout, /pass 1/)
    assert.match(result.stdout, /fail 0/)
    assert.match(result.stdout, /skipped 1/)
    assert.match(result.stdout, /todo 2/)
    assert.match(result.stdout, /stdout marker/)
    assert.match(result.stdout, /stderr marker/)
    assert.match(result.stdout, /diagnostic marker/)
})

test('CI reporter retains failed assertion details and a nonzero exit status', (t) => {
    const result = runFixture(
        t,
        `
            import assert from 'node:assert/strict'
            import test from 'node:test'
            test('passing sibling marker', () => {})
            test('assertion failure marker', () => assert.equal('actual marker', 'expected marker'))
        `
    )
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.doesNotMatch(result.stdout, /passing sibling marker/)
    assert.match(result.stdout, /FAIL assertion failure marker/)
    assert.match(result.stdout, /fixture\.test\.mjs:\d+:\d+/)
    assert.match(result.stdout, /ERR_ASSERTION/)
    assert.match(result.stdout, /actual: 'actual marker'/)
    assert.match(result.stdout, /expected: 'expected marker'/)
    assert.match(result.stdout, /fail 1/)
})

test('CI reporter retains failed worker exit codes', (t) => {
    const result = runFixture(t, 'process.exit(23)')
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout, /FAIL/)
    assert.match(result.stdout, /ERR_TEST_FAILURE/)
    assert.match(result.stdout, /exitCode: 23/)
})

test('CI reporter retains worker signals and interrupted test details', async () => {
    const events: TestEvent[] = [
        {
            type: 'test:fail',
            data: {
                name: 'signal failure marker',
                nesting: 0,
                testId: 1,
                parentId: undefined,
                tags: [],
                testNumber: 1,
                details: {
                    duration_ms: 1,
                    error: Object.assign(new Error('test failed'), {
                        cause: undefined,
                        code: 'ERR_TEST_FAILURE',
                        exitCode: null,
                        signal: 'SIGTERM'
                    })
                }
            }
        },
        {
            type: 'test:interrupted',
            data: {
                tests: [
                    {
                        name: 'interrupted test marker',
                        nesting: 0,
                        testId: 2,
                        parentId: undefined,
                        tags: [],
                        file: 'interrupted.test.ts',
                        line: 1,
                        column: 1
                    }
                ]
            }
        }
    ]
    const output = (await Array.fromAsync(ciTestReporter(Readable.from(events)))).join('')
    assert.match(output, /FAIL signal failure marker/)
    assert.match(output, /signal: 'SIGTERM'/)
    assert.match(output, /Interrupted tests:/)
    assert.match(output, /interrupted test marker/)
    assert.match(output, /interrupted\.test\.ts/)
})
