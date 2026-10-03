import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Instrument only disposable build output; native navigation and React rendering remain unchanged.
const root = path.resolve(fileURLToPath(new URL('../dist/wx', import.meta.url)))
const modulePath = 'common/verify-frames.js'
await writeFile(
    path.join(root, modulePath),
    `function saveFrame(progress, current) {
    // This App-owned journal observes native animation frames without changing the transition.
    const app = getApp();
    if (!app.shareElementFrames) {
        app.shareElementFrames = [];
    }
    app.shareElementFrames.push({ progress, current });
}
function recordFrame(data) {
    'worklet';
    wx.worklet.runOnJS(saveFrame)(data.progress, data.current);
}
exports.instrumentPage = function (config) {
    config.__recordShareFrame = recordFrame;
    return config;
};
exports.instrumentComponent = function (config) {
    config.methods.__recordShareFrame = recordFrame;
    return config;
};
`
)
for (const entry of ['pages/gallery/gallery.js', 'pages/detail/detail.js', 'comp.js']) {
    const entryPath = path.join(root, entry)
    const source = await readFile(entryPath, 'utf8')
    const relative = path.posix.relative(path.posix.dirname(entry), modulePath)
    const specifier = relative.startsWith('.') ? relative : `./${relative}`
    const component = entry === 'comp.js'
    // Native Page shells call the bootstrap export; recursive components still call native Component directly.
    const registration = component ? /(Component)\((\w+)\)/g : /(\(0,\w+\.Page\))\((\w+)\)/g
    assert.equal([...source.matchAll(registration)].length, 1, entry)
    await writeFile(
        entryPath,
        source.replace(
            registration,
            `$1(require('${specifier}').${component ? 'instrumentComponent' : 'instrumentPage'}($2))`
        )
    )
}
const templatePath = path.join(root, 'base.wxml')
const template = await readFile(templatePath, 'utf8')
assert.equal([...template.matchAll(/<share-element /g)].length, 1)
await writeFile(
    templatePath,
    template.replace('<share-element ', '<share-element worklet:onframe="__recordShareFrame" ')
)
const configPath = path.join(root, 'project.config.json')
const config: { setting: Record<string, unknown> } = JSON.parse(await readFile(configPath, 'utf8'))
config.setting.compileWorklet = true
await writeFile(configPath, `${JSON.stringify(config, null, 4)}\n`)
console.info('Frame probe installed. Read getApp().shareElementFrames in DevTools. Rebuild to remove it.')
