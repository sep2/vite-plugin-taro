import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptOptions } from '../../../options.ts'
import { createMiniContract } from './plugins.ts'

test('creates the initial Mini contract from VPT options without translation', () => {
    const options: VptOptions = {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [],
        appJson: {},
        projectConfigJson: {}
    }

    assert.equal(createMiniContract(options), options)
})
