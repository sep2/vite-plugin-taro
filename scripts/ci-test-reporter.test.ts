import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import type { TestEvent } from 'node:test/reporters'
import { pathToFileURL } from 'node:url'
import ciTestReporter from './ci-test-reporter.ts'

// Node imports custom reporters as ESM; Windows drive-letter paths are not valid module URLs.
const reporter = new URL('./ci-test-reporter.ts', import.meta.url).href

function runFixture(source: string) {
    const fixture = path.join(import.meta.dirname, 'fixture.test.mjs')
    // Each worker mounts its own source before Node resolves the test entrypoint.
    const preload = `
        import { registerHooks } from 'node:module'
        import { after } from 'node:test'
        import { pathToFileURL } from 'node:url'
        import { create } from 'node:vfs'
        const filesystem = create()
        filesystem.writeFileSync('/fixture.test.mjs', ${JSON.stringify(source)})
        const root = filesystem.mount()
        const hooks = registerHooks({
            resolve(id, context, nextResolve) {
                if (id === ${JSON.stringify(pathToFileURL(fixture).href)}) {
                    return { url: pathToFileURL(root + '/fixture.test.mjs').href, shortCircuit: true }
                }
                return nextResolve(id, context)
            }
        })
        after(() => {
            hooks.deregister()
            filesystem.unmount()
        })
    `
    const input = `
        import { run } from 'node:test'
        import reporter from ${JSON.stringify(reporter)}
        const tests = run({
            files: [${JSON.stringify(fixture)}],
            execArgv: ['--experimental-vfs', '--import', ${JSON.stringify(`data:text/javascript,${encodeURIComponent(preload)}`)}]
        })
        // The parent runner owns the process exit status, including abnormal worker exits.
        tests.on('test:fail', (event) => {
            if (event.todo === undefined && event.skip === undefined) {
                process.exitCode = 1
            }
        })
        tests.compose(reporter).pipe(process.stdout)
    `
    const result = spawnSync(process.execPath, [], {
        input,
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

test('CI reporter hides passing, skipped and TODO tests while retaining totals and logs', () => {
    const result = runFixture(
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

test('CI reporter retains failed assertion details and a nonzero exit status', () => {
    const result = runFixture(
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

test('CI reporter retains failed worker exit codes', () => {
    const result = runFixture('process.exit(23)')
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
