/// <reference path="../../../client.ts" />

import test from 'node:test'
import type { defineVptPage } from 'virtual:vpt'
import type { VptPageDeclaration, VptPageOptionNoPath, VptTarget } from '../../../index.ts'

test('typechecks the virtual page module declaration contract', () => {
    // A local stub lets tsc check the factory signature while Node runs the test.
    const declarePage: typeof defineVptPage = (_factory: VptPageDeclaration): void => {}

    const options: VptPageOptionNoPath = {}
    declarePage(() => options)
    declarePage(() => ({ entry: true, prerender: false, config: { title: 'Home' } }))
    // @ts-expect-error Page declarations require configuration factories.
    declarePage(options)
    // @ts-expect-error Empty objects are not configuration factories.
    declarePage({})
    declarePage(({ target }) => {
        const selected: VptTarget = target
        // @ts-expect-error The inferred target is a string union.
        target.toFixed()
        return { entry: selected === 'wx', config: { target: selected } }
    })
    declarePage(async ({ target }) => ({
        entry: await Promise.resolve(target === 'wx'),
        config: { title: target }
    }))

    // @ts-expect-error Routes are derived from source filenames.
    declarePage(() => ({ path: 'custom/path' }))
    // @ts-expect-error Entry selection is boolean.
    declarePage(() => ({ entry: 'yes' }))
    // @ts-expect-error Prerender selection is boolean.
    declarePage(() => ({ prerender: 1 }))
    // @ts-expect-error Native configuration contains JSON values.
    declarePage(() => ({ config: { title: () => 'Home' } }))
    // @ts-expect-error Async factories must return page options.
    declarePage(async () => 42)
    // @ts-expect-error Factories receive a context object containing the target.
    declarePage((target: number) => ({ config: { target } }))
})
