import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConfigEnv, ResolvedConfig } from 'vite'
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

function environment(command: ConfigEnv['command']): ConfigEnv {
    return { command, mode: command === 'serve' ? 'development' : 'production', isSsrBuild: false, isPreview: false }
}

test('derives development mode once from the Vite command', () => {
    const serveContext = new BuildContext(options)
    serveContext.configure(environment('serve'))
    assert.equal(serveContext.development, true)

    const buildContext = new BuildContext(options)
    buildContext.configure(environment('build'))
    assert.equal(buildContext.development, false)
})

test('enforces build context lifecycle order', () => {
    const context = new BuildContext(options)
    assert.throws(() => context.development, /not configured/)
    assert.throws(() => context.vite, /not resolved/)
    assert.throws(() => context.resolve({ root: '/tmp' } as ResolvedConfig), /before it was configured/)

    context.configure(environment('build'))
    assert.throws(() => context.configure(environment('build')), /already configured/)
    context.resolve({ root: '/tmp' } as ResolvedConfig)
    assert.equal(context.vite.root, '/tmp')
    assert.throws(() => context.resolve({ root: '/tmp' } as ResolvedConfig), /already resolved/)
})
