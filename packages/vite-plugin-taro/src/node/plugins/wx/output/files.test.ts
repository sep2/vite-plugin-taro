import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptOptions } from '../../../../options.ts'
import { createOutputFiles } from './files.ts'

const options: VptOptions = {
    target: 'wx',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('creates the stable app stylesheet wrapper', async () => {
    const outputFiles = await createOutputFiles({
        bundle: {},
        options,
        subpackages: [],
        getModuleInfo: () => null,
        getPackageLocation: () => ({ kind: 'main' })
    })

    assert.deepEqual(
        outputFiles.find((file) => file.type === 'asset' && file.fileName === 'app.wxss'),
        {
            type: 'asset',
            fileName: 'app.wxss',
            source: '@import "./assets/global.wxss";\n'
        }
    )
})
