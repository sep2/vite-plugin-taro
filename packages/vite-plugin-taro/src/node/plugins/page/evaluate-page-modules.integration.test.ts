import assert from 'node:assert/strict'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { type InlineConfig, normalizePath } from 'vite'
import { createTestProject } from '../../tests/create-test-project.ts'
import { apiModuleId } from '../api/api-module-id.ts'

const { evaluatePageModules, builds, evaluations, phases, modules } = await importObservedEvaluator()

/** Observes real Vite calls while leaving compilation and evaluation intact. */
async function importObservedEvaluator() {
    const evaluatorUrl = new URL('./evaluate-page-modules.ts', import.meta.url).href
    const observerUrl = `data:text/javascript,${encodeURIComponent(`
        export * from ${JSON.stringify(import.meta.resolve('vite'))};
        import { build as compile, runnerImport as evaluate } from ${JSON.stringify(import.meta.resolve('vite'))};
        // These test-owned journals record calls and execution order at the two Vite boundaries.
        export const builds = [];
        export const evaluations = [];
        export const phases = [];
        export const modules = [];
        export async function build(config) {
            builds.push(config);
            phases.push('build:start');
            const result = await compile(config);
            modules.push(result.output.flatMap(output => output.type === 'chunk' ? output.moduleIds : []));
            phases.push('build:end');
            return result;
        }
        export function runnerImport(id, config) {
            phases.push('evaluate');
            evaluations.push({ id, config });
            return evaluate(id, config);
        }
    `)}`
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (specifier === 'vite' && context.parentURL === evaluatorUrl) {
                return { url: observerUrl, shortCircuit: true }
            }
            return nextResolve(specifier, context)
        }
    })
    try {
        const evaluator: typeof import('./evaluate-page-modules.ts') = await import(evaluatorUrl)
        const observer: {
            builds: InlineConfig[]
            evaluations: { id: string; config: InlineConfig }[]
            phases: string[]
            modules: string[][]
        } = await import(observerUrl)
        return { ...evaluator, ...observer }
    } finally {
        hooks.deregister()
    }
}

/** Creates source fixtures in the test process's disposable plugin workspace. */
async function createProject(files: Record<string, string>): Promise<string> {
    const root = await createTestProject('page-evaluation-')
    await Promise.all(
        Object.entries(files).map(async ([name, source]) => {
            const filename = path.join(root, name)
            await mkdir(path.dirname(filename), { recursive: true })
            await writeFile(filename, source)
        })
    )
    return root
}

test('skips compilation and evaluation for an empty candidate list', async () => {
    const root = await createProject({ 'vite.config.ts': 'throw new Error("Configuration loaded")' })
    const before = [builds.length, evaluations.length]
    assert.deepEqual(await evaluatePageModules([], { root }, 'wx'), [])
    assert.deepEqual([builds.length, evaluations.length], before)
})

test('builds an entry, a shared registry and a path-bound API for each candidate', async () => {
    const root = await createProject({
        'src/first.tsx': `import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({}));`,
        'src/second.tsx': `import * as api from 'virtual:vpt'; api.defineVptPage(() => ({}));`
    })
    assert.deepEqual(await evaluatePageModules(['first', 'second'], { root }, 'wx'), [
        { path: 'first' },
        { path: 'second' }
    ])
    assert.deepEqual(
        modules.at(-1)?.toSorted(),
        [
            '\0vpt:page-entry',
            apiModuleId,
            `\0${apiModuleId}:first`,
            `\0${apiModuleId}:second`,
            normalizePath(path.join(root, 'src/first.tsx')),
            normalizePath(path.join(root, 'src/second.tsx'))
        ].sort()
    )
})

test('uses one shared graph, preserves closures and executes async factories in candidate order', async () => {
    const root = await createProject({
        'vite.config.ts': 'throw new Error("Configuration loaded")',
        'dist/keep.txt': 'existing output',
        'public/keep.txt': 'public asset',
        'src/shared/state.ts': `
            // This graph-owned state records dependency evaluation and factory calls.
            export const state = { count: 0, events: ['shared'] };
            export function record(event) { state.events.push(event); return state.events.join('|'); }
        `,
        'src/shared/lazy.ts': `import { record } from './state'; record('lazy-module'); export const suffix = 'lazy';`,
        'src/pages/first.tsx': `
            import './second';
            import { defineVptPage as declare } from 'virtual:vpt';
            import { state, record } from '../shared/state';
            record('first-module');
            const register = declare;
            const title = 'First';
            register(async ({ target }) => {
                record('first:start');
                const { suffix } = await import('../shared/lazy');
                await Promise.resolve();
                return {
                    path: 'replacement',
                    entry: target === 'wx',
                    config: { title: title + suffix, count: ++state.count, order: record('first:end') }
                };
            });
            export default () => <div>First</div>;
        `,
        'src/pages/second.tsx': `
            import * as api from 'virtual:vpt';
            import { state, record } from '../shared/state';
            record('second-module');
            api.defineVptPage(() => ({
                prerender: true,
                config: { count: ++state.count, order: record('second:factory') }
            }));
        `,
        'src/pages/unused.tsx': `import { defineVptPage } from 'virtual:vpt'; export default () => null;`,
        'src/unrelated.tsx': `import './unavailable'; export default <div>`
    })
    const beforeBuilds = builds.length
    const beforeEvaluations = evaluations.length
    const beforePhases = phases.length
    const files = (await readdir(root, { recursive: true })).sort()
    const pages = await evaluatePageModules(['pages/first', 'pages/second', 'pages/unused'], { root }, 'wx')
    assert.deepEqual(pages, [
        {
            path: 'pages/first',
            entry: true,
            config: {
                title: 'Firstlazy',
                count: 1,
                order: 'shared|second-module|first-module|first:start|lazy-module|first:end'
            }
        },
        {
            path: 'pages/second',
            prerender: true,
            config: {
                count: 2,
                order: 'shared|second-module|first-module|first:start|lazy-module|first:end|second:factory'
            }
        }
    ])
    assert.equal(builds.length, beforeBuilds + 1)
    assert.equal(evaluations.length, beforeEvaluations + 1)
    assert.deepEqual(phases.slice(beforePhases), ['build:start', 'build:end', 'evaluate'])
    assert.deepEqual((await readdir(root, { recursive: true })).sort(), files)
    assert.equal(await readFile(path.join(root, 'dist/keep.txt'), 'utf8'), 'existing output')
})

test('uses project aliases and defines and bundles imported package sources', async () => {
    const root = await createProject({
        'src/home.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            import { value } from '@settings';
            defineVptPage(({ target }) => ({ config: { title: __TITLE__ + value + target } }));
        `,
        'src/settings.ts': `export { value } from 'page-settings';`,
        'node_modules/page-settings/package.json': JSON.stringify({
            name: 'page-settings',
            type: 'module',
            exports: './index.ts'
        }),
        'node_modules/page-settings/index.ts': `export const value: string = '-package-';`
    })
    const define = { __TITLE__: JSON.stringify('Project') }
    const resolve = { alias: { '@settings': path.join(root, 'src/settings.ts') } }
    assert.deepEqual(await evaluatePageModules(['home'], { root, define, resolve }, 'h5'), [
        { path: 'home', config: { title: 'Project-package-h5' } }
    ])
    assert.equal(builds.at(-1)?.root, root)
    assert.equal(builds.at(-1)?.define, define)
    assert.equal(builds.at(-1)?.resolve, resolve)
})

for (const target of ['wx', 'zfb', 'tb', 'tt', 'xhs', 'h5'] as const) {
    test(`${target}: applies target directives and supplies the factory context`, async () => {
        const root = await createProject({
            'src/home.tsx': `
                import { defineVptPage } from 'virtual:vpt';
                // #ifdef ${target.toUpperCase()}
                defineVptPage(({ target }) => ({ config: { title: target } }));
                // #else
                import './unavailable';
                defineVptPage(() => { throw new Error('Inactive factory'); });
                // #endif
            `,
            'src/inactive.tsx': `
                import { defineVptPage } from 'virtual:vpt';
                // #ifdef ${target === 'wx' ? 'H5' : 'WX'}
                defineVptPage(() => ({}));
                // #endif
            `
        })
        assert.deepEqual(await evaluatePageModules(['home', 'inactive'], { root }, target), [
            { path: 'home', config: { title: target } }
        ])
    })
}

test('passes declaration imports through helpers using ordinary JavaScript bindings', async () => {
    const root = await createProject({
        'src/home.tsx': `
            import { defineVptPage as register } from 'virtual:vpt';
            import { configure } from './helper';
            const title = ((defineVptPage) => defineVptPage('Home'))((value) => value);
            configure(register, title);
        `,
        'src/helper.ts': `
            export function configure(register, title) {
                const declare = register;
                declare(({ target }) => ({ config: { title: title + target } }));
            }
        `
    })
    assert.deepEqual(await evaluatePageModules(['home'], { root }, 'wx'), [
        { path: 'home', config: { title: 'Homewx' } }
    ])
})

test('preserves supplied route order and source identity under a configured root with spaces', async () => {
    const paths = ['pages/详情', 'pages/with space', 'pages/100%']
    const project = await createProject(
        Object.fromEntries(
            paths.map((route) => [
                `app [client]/src/${route}.tsx`,
                `import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({}));`
            ])
        )
    )
    assert.deepEqual(
        await evaluatePageModules(paths, { root: path.join(project, 'app [client]') }, 'wx'),
        paths.map((route) => ({ path: route }))
    )
})

test('preserves ordinary module, argument and factory effects in isolated evaluations', async () => {
    const root = await createProject({})
    const journal = path.join(root, 'effects.txt')
    await mkdir(path.join(root, 'src'))
    await writeFile(
        path.join(root, 'src/home.tsx'),
        `
        import { appendFileSync } from 'node:fs';
        import { defineVptPage } from 'virtual:vpt';
        const record = (event) => appendFileSync(${JSON.stringify(journal)}, event + ';');
        record('module');
        defineVptPage((record('argument'), async () => {
            await Promise.resolve();
            record('factory');
            return {};
        }));
    `
    )
    for (const target of ['wx', 'h5'] as const) {
        assert.deepEqual(await evaluatePageModules(['home'], { root }, target), [{ path: 'home' }])
    }
    assert.equal(await readFile(journal, 'utf8'), 'module;argument;factory;module;argument;factory;')
})

for (const [name, source, error] of [
    [
        'duplicate declaration',
        `defineVptPage(() => ({})); defineVptPage(() => ({}));`,
        /Only one defineVptPage declaration is allowed for home/
    ],
    ['object declaration', `defineVptPage({ config: {} });`, /not a function/],
    ['missing factory', `defineVptPage(undefined);`, /not a function/],
    ['module failure', `throw new Error('Module failed');`, /Module failed/],
    ['factory failure', `defineVptPage(() => { throw new Error('Factory failed'); });`, /Factory failed/],
    [
        'async factory failure',
        `defineVptPage(async () => { throw new Error('Async factory failed'); });`,
        /Async factory failed/
    ],
    ['parse failure', `defineVptPage(() => ({})); export default <div>`, /parse|Expected|Unterminated|Unexpected/i]
] as const) {
    test(`propagates ${name}`, async () => {
        const root = await createProject({ 'src/home.tsx': `import { defineVptPage } from 'virtual:vpt'; ${source}` })
        await assert.rejects(evaluatePageModules(['home'], { root }, 'wx'), error)
    })
}

for (const [name, source] of [
    ['static', `import './second';`],
    ['dynamic', `await import('./second');`],
    ['indirect', `import './helper';`]
] as const) {
    test(`preserves page ownership through ${name} imports of another candidate`, async () => {
        const root = await createProject({
            'src/first.tsx': `import { defineVptPage } from 'virtual:vpt'; ${source} defineVptPage(() => ({ config: { title: 'First' } }));`,
            'src/second.tsx': `import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({ config: { title: 'Second' } }));`,
            'src/helper.ts': `export * from './second';`
        })
        assert.deepEqual(await evaluatePageModules(['first', 'second'], { root }, 'wx'), [
            { path: 'first', config: { title: 'First' } },
            { path: 'second', config: { title: 'Second' } }
        ])
    })
}

test('shares path-bound API bindings across queried imports and other pages', async () => {
    const root = await createProject({
        'src/home.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            export { defineVptPage as register };
        `,
        'src/detail.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            import { register } from './home';
            import { register as queried } from './home.tsx?bindings';
            if (register !== queried) {
                throw new Error('Page API binding identity changed');
            }
            queried(() => ({ config: { title: 'Home' } }));
            defineVptPage(() => ({ config: { title: 'Detail' } }));
        `
    })
    assert.deepEqual(await evaluatePageModules(['home', 'detail'], { root }, 'wx'), [
        { path: 'home', config: { title: 'Home' } },
        { path: 'detail', config: { title: 'Detail' } }
    ])
})

test('evaluates factories after cyclic page dependencies have initialized', async () => {
    const root = await createProject({
        'src/home.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            import { detailTitle } from './detail';
            export function homeTitle() { return 'Home'; }
            defineVptPage(() => ({ config: { title: detailTitle() } }));
        `,
        'src/detail.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            import { homeTitle } from './home';
            export function detailTitle() { return 'Detail'; }
            defineVptPage(() => ({ config: { title: homeTitle() } }));
        `
    })
    assert.deepEqual(await evaluatePageModules(['home', 'detail'], { root }, 'wx'), [
        { path: 'home', config: { title: 'Detail' } },
        { path: 'detail', config: { title: 'Home' } }
    ])
})

test('requires API bindings to originate in candidate page modules', async () => {
    const root = await createProject({
        'src/home.tsx': `import { defineVptPage } from './helper'; defineVptPage(() => ({}));`,
        'src/helper.ts': `export { defineVptPage } from 'virtual:vpt';`
    })
    await assert.rejects(
        evaluatePageModules(['home'], { root }, 'wx'),
        /Page declarations must be imported by a candidate page module/
    )
})

test('preserves page API identity through awaited initialization and dynamic imports', async () => {
    const root = await createProject({
        'src/first.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            await Promise.resolve();
            const api = await import('virtual:vpt');
            if (api.defineVptPage !== defineVptPage) {
                throw new Error('API binding identity changed');
            }
            api.defineVptPage(() => ({ config: { title: 'First' } }));
        `,
        'src/second.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            defineVptPage(() => ({ config: { title: 'Second' } }));
        `
    })
    assert.deepEqual(await evaluatePageModules(['first', 'second'], { root }, 'wx'), [
        { path: 'first', config: { title: 'First' } },
        { path: 'second', config: { title: 'Second' } }
    ])
})

test('observes declarations registered by an earlier candidate factory', async () => {
    const root = await createProject({
        'src/first.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            import { register } from './second';
            defineVptPage(() => {
                register(() => ({ config: { title: 'Second' } }));
                return { config: { title: 'First' } };
            });
        `,
        'src/second.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            export { defineVptPage as register };
        `
    })
    assert.deepEqual(await evaluatePageModules(['first', 'second'], { root }, 'wx'), [
        { path: 'first', config: { title: 'First' } },
        { path: 'second', config: { title: 'Second' } }
    ])
})

test('isolates concurrent configuration graphs', async () => {
    const root = await createProject({
        'src/home.tsx': `import { defineVptPage } from 'virtual:vpt'; defineVptPage(async ({ target }) => ({ config: { title: target } }));`
    })
    assert.deepEqual(
        await Promise.all([
            evaluatePageModules(['home'], { root }, 'wx'),
            evaluatePageModules(['home'], { root }, 'h5')
        ]),
        [[{ path: 'home', config: { title: 'wx' } }], [{ path: 'home', config: { title: 'h5' } }]]
    )
})
