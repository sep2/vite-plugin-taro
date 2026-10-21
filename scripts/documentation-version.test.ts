import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolveLatestStableVersion } from '../docs/src/lib/resolve-latest-stable-version.ts'

test('documentation deployment requires a successful stable package publication', () => {
    const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')
    assert.match(
        workflow,
        /^ {2}documentation:\n {4}if: needs\.publish\.outputs\.stable_version != ''\n {4}needs: publish$/m
    )
    assert.match(workflow, /stable_version: \$\{\{ steps\.documentation\.outputs\.version \}\}/)
    assert.match(
        workflow,
        /- name: Resolve stable documentation version\n {8}if: steps\.release\.outputs\.published == 'true'/
    )
    assert.match(workflow, /release_version: \$\{\{ needs\.publish\.outputs\.stable_version \}\}/)
})

test('pull requests validate the documentation build', () => {
    const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')
    assert.match(
        workflow,
        / {2}documentation-check:\n {4}if: github\.event_name == 'pull_request'\n {4}permissions:\n {6}contents: read\n {4}uses: \.\/\.github\/workflows\/website\.yml\n {4}with:\n {6}deploy: false/
    )
})

test('a successful stable release supplies its version without consulting npm', async (t) => {
    // The test-scoped mock owns and restores the only shared mutation, global fetch.
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ version: '0.7.0' }))
    assert.equal(await resolveLatestStableVersion('vite-plugin-taro', '0.7.1'), '0.7.1')
    assert.equal(fetch.mock.callCount(), 0)
})

test('local and pull request documentation builds resolve the stable npm dist-tag', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ version: '0.7.0' }))
    assert.equal(await resolveLatestStableVersion('vite-plugin-taro', undefined), '0.7.0')
    assert.equal(await resolveLatestStableVersion('vite-plugin-taro', ''), '0.7.0')
    assert.equal(fetch.mock.calls[0].arguments[0], 'https://registry.npmjs.org/vite-plugin-taro/latest')
})

test('documentation accepts a version, not a prerelease or either Git tag format', async () => {
    for (const version of ['0.7.1-beta.2', 'v0.7.1', 'vite-plugin-taro@0.7.1']) {
        await assert.rejects(resolveLatestStableVersion('vite-plugin-taro', version), /Expected a stable version/)
    }
})

test('a prerelease on latest is not displayed as the stable documentation version', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ version: '0.7.1-beta.2' }))
    await assert.rejects(resolveLatestStableVersion('vite-plugin-taro', undefined), /must resolve to a stable version/)
})
