import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConfigEnv } from 'vite'
import { BuildContext } from './build-context.ts'

const options = {
    target: 'h5' as const,
    app: 'src/app.ts',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    projectPrivateConfigJson: {},
    sitemapJson: {}
}

function environment(
    command: ConfigEnv['command'],
    mode = command === 'serve' ? 'development' : 'production'
): ConfigEnv {
    return { command, mode, isSsrBuild: false, isPreview: false }
}

test('derives development mode once from the Vite command and mode', () => {
    const serveContext = new BuildContext(options)
    serveContext.configure(environment('serve'))
    assert.equal(serveContext.development, true)

    const watchContext = new BuildContext(options)
    watchContext.configure(environment('build', 'development'))
    assert.equal(watchContext.development, true)

    const buildContext = new BuildContext(options)
    buildContext.configure(environment('build'))
    assert.equal(buildContext.development, false)
})

test('enforces build context lifecycle order', () => {
    const context = new BuildContext(options)
    assert.throws(() => context.development, /not configured/)

    context.configure(environment('build'))
    assert.throws(() => context.configure(environment('build')), /already configured/)
})
