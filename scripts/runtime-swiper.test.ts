import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import runtimePackage from '../packages/taro-runtime/package.json' with { type: 'json' }

const runtimeRequire = createRequire(new URL('../packages/taro-runtime/package.json', import.meta.url))
const swiperBundle = pathToFileURL(runtimeRequire.resolve('swiper/bundle')).href

function runSwiperAssertions(assertions: string): void {
    execFileSync(
        process.execPath,
        [
            '--input-type=module',
            '--eval',
            `import assert from 'node:assert/strict';
import Swiper from ${JSON.stringify(swiperBundle)};
${assertions}`
        ],
        { stdio: 'pipe', timeout: 10_000 }
    )
}

test('the installed H5 Swiper matches the published runtime dependency', () => {
    const manifest: { version: string } = JSON.parse(
        readFileSync(runtimeRequire.resolve('swiper/package.json'), 'utf8')
    )
    assert.equal(manifest.version, runtimePackage.dependencies.swiper)
})

test('the H5 Swiper bundle retains Taro configuration and controller APIs', () => {
    runSwiperAssertions(`
const swiper = new Swiper({
    init: false,
    direction: 'vertical',
    loop: true,
    speed: 450,
    pagination: { el: '.pagination' },
    autoplay: { delay: 3000, disableOnInteraction: false },
    zoom: true,
    nested: true
});
assert.equal(swiper.params.direction, 'vertical');
assert.equal(swiper.params.loop, true);
assert.equal(swiper.params.speed, 450);
assert.equal(swiper.params.pagination.el, '.pagination');
assert.equal(swiper.params.autoplay.delay, 3000);
assert.equal(swiper.params.autoplay.disableOnInteraction, false);
assert.equal(swiper.params.zoom.enabled, true);
assert.equal(swiper.params.nested, true);
for (const method of ['update', 'destroy', 'slideTo', 'slideToLoop', 'loopFix', 'loopDestroy', 'minTranslate', 'maxTranslate']) {
    assert.equal(typeof swiper[method], 'function');
}
for (const method of ['start', 'stop', 'pause']) {
    assert.equal(typeof swiper.autoplay[method], 'function');
}
`)
})

test('Swiper rejects prototype pollution even with a compromised Array indexOf', () => {
    // The advisory's deliberate global mutation is isolated to a subprocess, never the shared test runner.
    runSwiperAssertions(`
assert.equal(Object.hasOwn(Object.prototype, 'vptSwiperPolluted'), false);
Array.prototype.indexOf = () => -1;
Swiper.extendDefaults(JSON.parse('{"__proto__":{"vptSwiperPolluted":true},"constructor":{"prototype":{"vptSwiperPolluted":true}}}'));
assert.equal(Object.hasOwn(Object.prototype, 'vptSwiperPolluted'), false);
assert.equal(Object.hasOwn(Swiper.extendedDefaults, '__proto__'), false);
assert.equal(Object.hasOwn(Swiper.extendedDefaults, 'constructor'), false);
`)
})
