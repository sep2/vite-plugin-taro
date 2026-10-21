import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const creatorRoot = path.join(repoRoot, 'packages/create-vite-taro')
const pluginRoot = path.join(repoRoot, 'packages/vite-plugin-taro')
const packageRequire = createRequire(path.join(pluginRoot, 'package.json'))
const { values } = parseArgs({ options: { devtools: { type: 'boolean' } } })
const client = process.env.VPT_DEVTOOLS_CLIENT ?? 'pi'
const token = process.env.VPT_DEVTOOLS_TOKEN

interface PageState {
    route: string
    selected: string[]
    counter: { id: string; count: number } | null
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
    return execFileSync(command, args, { cwd, env, encoding: 'utf8', timeout: 25_000 })
}

function linkPackage(project: string, name: string, source: string): void {
    const destination = path.join(project, 'node_modules', name)
    mkdirSync(path.dirname(destination), { recursive: true })
    symlinkSync(source, destination, 'junction')
}

function createProject(directory: string): string {
    const generator = path.join(directory, 'generator')
    mkdirSync(generator)
    for (const file of ['index.js', 'package.json']) {
        copyFileSync(path.join(creatorRoot, file), path.join(generator, file))
    }
    cpSync(path.join(creatorRoot, 'templates'), path.join(generator, 'templates'), {
        recursive: true,
        filter: (source) => path.basename(source) !== 'node_modules'
    })
    const project = path.join(directory, 'app')
    run(process.execPath, [path.join(generator, 'index.js'), project], repoRoot, process.env)
    // A project-local Git boundary keeps Tailwind's source discovery inside this fixture.
    run('git', ['init', '--quiet', project], repoRoot, process.env)
    for (const name of ['react', 'react-dom', 'vite', 'rolldown', '@types/node', '@types/react', '@types/react-dom']) {
        linkPackage(project, name, path.dirname(packageRequire.resolve(`${name}/package.json`)))
    }
    linkPackage(project, 'vite-plugin-taro', pluginRoot)
    return project
}

function callDevTools<T>(tool: string, args: string[]): T {
    const result = spawnSync('wechatide', ['-c', client, tool, ...args, ...(token ? ['--token', token] : [])], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 25_000
    })
    assert.equal(result.status, 0, `${tool} failed`)
    const response: { ok: boolean; result: T } = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')))
    assert.equal(response.ok, true, `${tool} failed`)
    return response.result
}

function verifyDevTools(project: string): void {
    const skill = readFileSync(path.join(repoRoot, '.agents/skills/miniprogram-dev-skill/SKILL.md'), 'utf8')
    const version = /^version: (\S+)$/m.exec(skill)
    assert.ok(version)
    const status = callDevTools<{
        loginExpired: boolean
        tokenRequired: boolean
        versionRelation: string
    }>('check_wechatide_status', ['--skill-version', version[1]])
    assert.equal(status.loginExpired, false, 'Sign in to WeChat DevTools before running this check')
    assert.ok(['equal', 'agent_ahead'].includes(status.versionRelation), 'Synchronize the WeChat DevTools skill')
    assert.ok(!status.tokenRequired || token, 'Set VPT_DEVTOOLS_TOKEN to the authorized CLI access token')

    const output = path.join(project, 'dist/wx')
    const probe = `function() {
        const page = getCurrentPages().slice(-1)[0];
        function* walk(node) {
            yield node;
            for (const child of node.cn || []) { yield* walk(child); }
        }
        const nodes = Array.from(walk(page.data.page));
        const counter = nodes.find(node => node.nn === 'native-counter');
        return {
            route: page.route,
            selected: nodes.filter(node => node.ariaCurrent === 'page').map(node => node.uid),
            counter: counter ? { id: counter.uid || counter.sid, count: counter.count } : null
        };
    }`
    const evaluate = () =>
        callDevTools<{ result: { result: PageState } }>('automation_evaluate', [
            '--project',
            output,
            '--fn-source',
            probe
        ]).result.result

    callDevTools('open_project_window', ['--project', output])
    try {
        callDevTools('automation_page_action', [
            '--project',
            output,
            '--action',
            'querySelector',
            '--selector',
            '#tab-home',
            '--wait-for-selector',
            '#tab-home'
        ])
        const initial = evaluate()
        assert.equal(initial.route, 'pages/home/index')
        assert.ok(initial.counter)
        assert.equal(initial.counter.count, 0)
        callDevTools('automation_element_action', [
            '--project',
            output,
            '--selector',
            `#${initial.counter.id}`,
            '--action',
            'trigger',
            '--type',
            'increment'
        ])
        for (const [tab, route] of [
            ['explore', 'pages/explore/explore-page'],
            ['about', 'pages/about/about-page'],
            ['home', 'pages/home/index']
        ]) {
            callDevTools('automation_element_action', [
                '--project',
                output,
                '--selector',
                `#tab-${tab}`,
                '--action',
                'tap',
                '--wait-for-selector',
                `#tab-${tab}`
            ])
            const page = evaluate()
            assert.equal(page.route, route)
            assert.deepEqual(page.selected, [`tab-${tab}`])
        }
        assert.deepEqual(evaluate().counter, { id: initial.counter.id, count: 1 })
        const logs = callDevTools<string>('get_simulator_console', ['--project', output, '--command', 'grep -n .'])
        assert.doesNotMatch(logs, /\[error\]/)
        console.log('[template] WX DevTools tab navigation and state retention passed')
    } finally {
        callDevTools('close_project_window', ['--project', output])
    }
}

if (values.devtools) {
    assert.ok(process.env.VITE_VPT_WECHAT_APP_ID, 'Set VITE_VPT_WECHAT_APP_ID to an authorized test AppID')
}
const temporaryRoot = path.join(pluginRoot, 'tmp')
mkdirSync(temporaryRoot, { recursive: true })
const directory = mkdtempSync(path.join(temporaryRoot, 'template-check-'))
try {
    const project = createProject(directory)
    const tsc = path.join(path.dirname(packageRequire.resolve('typescript/package.json')), 'bin/tsc')
    for (const config of ['tsconfig.app.json', 'tsconfig.node.json']) {
        run(process.execPath, [tsc, '--project', config, '--noEmit', '--incremental', 'false'], project, process.env)
    }
    console.log('[template] strict typechecks passed')
    const vite = path.join(path.dirname(packageRequire.resolve('vite/package.json')), 'bin/vite.js')
    for (const target of ['wx', 'zfb', 'tt', 'h5']) {
        run(process.execPath, [vite, 'build'], project, { ...process.env, VITE_VPT_TARGET: target })
        if (target === 'zfb') {
            const output = path.join(project, 'dist/zfb')
            const appJson: { tabBar: { customize: boolean } } = JSON.parse(
                readFileSync(path.join(output, 'app.json'), 'utf8')
            )
            assert.equal(appJson.tabBar.customize, true)
            for (const extension of ['axml', 'acss', 'js', 'json']) {
                const entry = `customize-tab-bar/index.${extension}`
                assert.ok(existsSync(path.join(output, entry)), `Missing Alipay custom tab-bar entry: ${entry}`)
            }
            assert.deepEqual(JSON.parse(readFileSync(path.join(output, 'customize-tab-bar/index.json'), 'utf8')), {
                component: true
            })
            console.log('[template] zfb custom tab-bar files passed')
        }
        console.log(`[template] ${target} build passed`)
    }
    if (values.devtools) {
        verifyDevTools(project)
    }
    console.log('PASS: generated template')
} finally {
    rmSync(directory, { recursive: true, force: true })
}
