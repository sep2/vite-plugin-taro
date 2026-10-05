import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { isPromise } from 'node:util/types'
import { createContext, runInContext } from 'node:vm'
import { build } from 'vite'
import vpt from '../../index.ts'
import { createTestProject } from './create-test-project.ts'

// Issue #35's attached vpt.zip reads the native route synchronously and conditionally renders the matching target.
// https://github.com/sep2/vite-plugin-taro/issues/35
// Skyline documents attached (inclusive) as the deadline for reliably publishing the first-frame target:
// https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/share-element.html
const files = {
    'src/app.tsx': `
        import { View, Text } from 'virtual:taro/components'
        export default function App({ children }) {
            return <View id="app-layout"><Text>Shared App</Text>{children}</View>
        }
    `,
    'src/pages/gallery/index.tsx': `
        import { ShareElement, Text } from 'virtual:taro/components'
        export default function Gallery() {
            return <ShareElement id="source" mapkey="aurora" transform><Text>Aurora</Text></ShareElement>
        }
    `,
    'src/pages/detail/index.tsx': `
        import Taro from 'virtual:taro/api'
        import { ShareElement, Text } from 'virtual:taro/components'
        const items = [{ id: 'aurora' }, { id: 'coral' }]
        export default function Detail() {
            const id = Taro.getCurrentInstance().router?.params.id
            const item = items.find(item => item.id === id)
            return item
                ? <ShareElement id="target" mapkey={item.id} transform><Text>{item.id}</Text></ShareElement>
                : <Text>Missing item</Text>
        }
    `
}

for (const prerender of [undefined, false, true]) {
    test(`Skyline #35: first-frame targets require Page prerender=true (configured: ${prerender})`, async () => {
        const root = await createTestProject('first-frame-')
        try {
            await Promise.all(
                Object.entries(files).map(async ([name, source]) => {
                    const file = path.join(root, name)
                    await mkdir(path.dirname(file), { recursive: true })
                    await writeFile(file, source)
                })
            )
            const result = await build({
                root,
                configFile: false,
                logLevel: 'silent',
                plugins: vpt({
                    target: 'wx',
                    app: 'src/app.tsx',
                    pages: [
                        { path: 'pages/gallery/index' },
                        { path: 'pages/detail/index', ...(prerender === undefined ? {} : { prerender }) }
                    ],
                    appJson: { renderer: 'skyline', componentFramework: 'glass-easel' },
                    projectConfigJson: {}
                }),
                build: { write: false, minify: false }
            })
            assert.ok(!Array.isArray(result) && 'output' in result)
            const sources = new Map(
                result.output.map((file) => [file.fileName, file.type === 'chunk' ? file.code : String(file.source)])
            )
            const pageJson = sources.get('pages/detail/index.json')
            assert.ok(pageJson)
            assert.equal(
                Object.hasOwn(JSON.parse(pageJson), 'prerender'),
                false,
                'prerender is not a native config field'
            )
            const template = sources.get('base.wxml')
            assert.ok(template)
            const keyAttribute = /<share-element\b[^>]*\bkey="{{i\.(\w+)}}"/.exec(template)?.[1]
            assert.ok(keyAttribute, 'the emitted native template must bind the shared-element key')
            const context = createContext({ assert, performance, console: { ...console, info() {} }, global: {} })
            runInContext(nativeHost, context)
            // Execute the actual bootstrap, capsules, React renderer and Taro runtime with native-only host doubles.
            const modules = new Map<string, { exports: unknown }>()
            function load(name: string): unknown {
                const cached = modules.get(name)
                if (cached) {
                    return cached.exports
                }
                const source = sources.get(name)
                assert.ok(source, `Missing native module: ${name}`)
                const module: { exports: unknown } = { exports: {} }
                modules.set(name, module)
                const execute: unknown = runInContext(`(function(require, module, exports) {\n${source}\n})`, context)
                assert.ok(typeof execute === 'function')
                execute(
                    (request: string) => load(path.posix.join(path.posix.dirname(name), request)),
                    module,
                    module.exports
                )
                return module.exports
            }
            context.load = load
            context.keyAttribute = keyAttribute
            context.prerender = prerender === true
            const completion: unknown = runInContext(scenario, context)
            assert.ok(isPromise(completion))
            await completion
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    })
}

const nativeHost = `
// A deterministic host queue models later event-loop turns; no real timers, delays or modified React scheduler.
const tasks = new Map();
let nextTask = 0;
function setTimeout(callback) { tasks.set(++nextTask, callback); return nextTask; }
function clearTimeout(id) { tasks.delete(id); }
async function drainTasks() {
    let executed = 0;
    do {
        for (const [id, callback] of [...tasks]) {
            tasks.delete(id);
            callback();
            assert.ok(++executed < 1000, 'native/render task queue did not become idle');
        }
        await Promise.resolve();
    } while (tasks.size);
}
const copy = value => JSON.parse(JSON.stringify(value));
// Native registrations, page stack and route observers belong to this one isolated mini-program host.
const definitions = new Map();
const pages = [];
const beforeLoad = [];
let registeringRoute;
let app;
const wx = { onBeforePageLoad(callback) { beforeLoad.push(callback); } };
function App(config) { app = config; }
function getApp() { return app; }
function getCurrentPages() { return pages; }
function Page(config) {
    definitions.set(registeringRoute, { methods: config, initialData: () => copy(config.data) });
}
function Component(config) {
    if (config) {
        definitions.set(registeringRoute, { ...config, initialData: () => copy(config.data) });
        return;
    }
    const definition = { methods: {}, lifetimes: {} };
    const builder = {
        options(value) { definition.options = value; return builder; },
        data(factory) { definition.initialData = factory; return builder; },
        methods(value) { Object.assign(definition.methods, value); return builder; },
        lifetime(name, callback) { definition.lifetimes[name] = callback; return builder; },
        register() { definitions.set(registeringRoute, definition); }
    };
    return builder;
}
function openPage(route, query) {
    beforeLoad.forEach(callback => callback({ path: route, query }));
    registeringRoute = route;
    load(route + '.js');
    const definition = definitions.get(route);
    assert.ok(definition, 'the emitted WX entry must register its native page');
    const instance = {
        route,
        data: copy(definition.initialData()),
        // Native data is mutable: apply the real renderer's bridge writes, without inspecting its internal host tree.
        setData(payload, callback) {
            for (const [key, value] of Object.entries(copy(payload))) {
                const keys = key.replace(/\\[(\\d+)\\]/g, '.$1').split('.');
                let target = this.data;
                for (const part of keys.slice(0, -1)) { target = target[part]; }
                target[keys.at(-1)] = value;
            }
            callback?.();
        }
    };
    definition.lifetimes?.created?.call(instance);
    pages.push(instance);
    definition.lifetimes?.attached?.call(instance);
    // Observe native data before onLoad or any later task can hide a missed synchronous publication.
    const atAttached = copy(instance.data);
    definition.methods.onLoad.call(instance, query);
    return { definition, instance, atAttached };
}
function findNode(node, property, value) {
    if (node?.[property] === value) { return node; }
    for (const child of node?.cn ?? []) {
        const found = findNode(child, property, value);
        if (found) { return found; }
    }
}
`

const scenario = `
(async () => {
    load('app.js');
    const gallery = openPage('pages/gallery/index', {});
    assert.deepEqual(gallery.atAttached, {
        app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] }
    }, 'a default Page keeps the seed until normal onLoad rendering');
    await drainTasks();
    assert.equal(findNode(gallery.instance.data.page, 'uid', 'source')?.[keyAttribute], 'aurora', 'source fixture renders');
    // Each native instance must publish its own query-selected target, not a registration-time or previous-visit seed.
    const observations = [];
    for (const id of ['aurora', 'coral', 'aurora']) {
        const page = openPage('pages/detail/index', { id });
        await drainTasks();
        const eventual = findNode(page.instance.data.page, 'uid', 'target')?.[keyAttribute];
        assert.equal(eventual, id, 'the destination and route work after queued rendering; this is not a broken fixture');
        observations.push({
            id,
            initialKey: findNode(page.atAttached.page, 'uid', 'target')?.[keyAttribute] ?? null,
            initialApp: !!findNode(page.atAttached.app, 'uid', 'app-layout'),
            initialOutlet: !!findNode(page.atAttached.app, 'nn', 'vpt_page_outlet'),
            eventualKey: eventual
        });
        page.definition.methods.onUnload.call(page.instance);
        pages.pop();
        await drainTasks();
    }
    gallery.definition.methods.onUnload.call(gallery.instance);
    pages.pop();
    await drainTasks();
    assert.deepEqual(observations, ['aurora', 'coral', 'aurora'].map(id => ({
        id, initialKey: prerender ? id : null, initialApp: prerender, initialOutlet: prerender, eventualKey: id
    })), 'Issue #35: only opted-in pages publish the matching target and its App outlet by attached');
})()
`
