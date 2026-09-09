import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'

const require = createRequire(import.meta.url)
const source = readFileSync(require.resolve('canvas-confetti'), 'utf8')

function createSimulation(worker: boolean, script: string) {
    // The frame queue and draw count model browser scheduling and observable particle rendering.
    const frames = new Map<number, (time: number) => void>()
    let nextFrameId = 0
    let time = 0
    let draws = 0
    const context = createContext({
        module: { exports: {} },
        requestAnimationFrame(callback: (time: number) => void) {
            nextFrameId += 1
            frames.set(nextFrameId, callback)
            return nextFrameId
        },
        cancelAnimationFrame(id: number) {
            frames.delete(id)
        },
        recordDraw() {
            draws += 1
        }
    })
    runInContext(
        `var self = this;
        class Path2D { addPath() {} }
        class DOMMatrix {}`,
        context
    )
    // Exercise the same self-contained entry function serialized into the real worker.
    const end = '})(), module, false));'
    const entry = script.slice(script.indexOf('(function main('), script.indexOf(end) + end.length)
    runInContext(
        worker ? entry.replace(', module, false));', ', module, true, { width: 600, height: 600 }));') : entry,
        context
    )
    runInContext(
        `var canvas = {
            width: 600,
            height: 600,
            getContext() {
                return {
                    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
                    ellipse() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
                    fill() { recordDraw(); }
                };
            }
        };
        var cannon = module.exports.create(canvas);
        var options = { particleCount: 5, shapes: ['square'], ticks: 480, repeatEvery: 34 };`,
        context
    )
    return {
        command(code: string) {
            runInContext(code, context)
        },
        frame(elapsed: number) {
            time += elapsed
            draws = 0
            const callbacks = [...frames.values()]
            frames.clear()
            for (const callback of callbacks) {
                callback(time)
            }
            return draws
        },
        pendingFrames() {
            return frames.size
        }
    }
}

for (const artifact of ['src/confetti.js', 'dist/confetti.browser.js', 'dist/confetti.module.mjs']) {
    const script = readFileSync(join(dirname(require.resolve('canvas-confetti/package.json')), artifact), 'utf8')
    for (const worker of [false, true]) {
        test(`rotation helpers render circles and flower paths: ${artifact} (worker=${worker})`, () => {
            const simulation = createSimulation(worker, script)
            simulation.command("void cannon({ ...options, shapes: ['circle'], rotationSpeed: 0.03 })")
            assert.equal(simulation.frame(17), 5)
            simulation.command(`cannon.reset(); void cannon({
                ...options,
                rotationSpeed: 0.03,
                tiltAmplitude: 0.8,
                shapes: [{ type: 'path', path: 'M0 0L10 0L5 10Z', matrix: [1, 0, 0, 1, 0, 0] }]
            })`)
            assert.ok(simulation.frame(17) > 0)
            for (let frame = 0; frame < 68; frame += 1) {
                assert.ok(simulation.frame(17) > 0)
            }
            simulation.command('cannon.reset()')
            assert.equal(simulation.pendingFrames(), 0)
        })
    }
}

for (const worker of [false, true]) {
    test(`continuous confetti stays bounded and drains without clearing (worker=${worker})`, () => {
        const simulation = createSimulation(worker, source)
        simulation.command('void cannon(options)')
        assert.equal(simulation.frame(17), 5)
        for (let frame = 1; frame < 33; frame += 1) {
            assert.equal(simulation.frame(17), 5)
        }
        assert.equal(simulation.frame(17), 10)
        for (let frame = 0; frame < 2000; frame += 1) {
            assert.ok(simulation.frame(17) <= 75)
        }
        // Five minutes without frames must advance only one simulation tick on return.
        assert.ok(simulation.frame(300000) <= 75)
        simulation.command('void cannon({ particleCount: 0, repeatEvery: 0 })')
        assert.ok(simulation.frame(17) > 0, 'stopping must preserve existing flowers')
        for (let frame = 0; frame < 480; frame += 1) {
            simulation.frame(17)
        }
        assert.equal(simulation.pendingFrames(), 0)
        simulation.command('void cannon(options)')
        assert.equal(simulation.frame(17), 5, 'emission can restart after draining')
        simulation.command('cannon.reset()')
        assert.equal(simulation.pendingFrames(), 0, 'disconnect cancels all animation')
    })

    test(`emission survives gaps longer than particle lifetime (worker=${worker})`, () => {
        const simulation = createSimulation(worker, source)
        simulation.command('void cannon({ ...options, ticks: 2 })')
        simulation.frame(17)
        simulation.frame(17)
        assert.equal(simulation.frame(17), 0)
        assert.equal(simulation.pendingFrames(), 1)
        for (let frame = 3; frame < 33; frame += 1) {
            simulation.frame(17)
        }
        assert.equal(simulation.frame(17), 5)
    })
}
