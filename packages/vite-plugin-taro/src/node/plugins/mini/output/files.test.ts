import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePage } from '../../page/resolve-page.ts'
import { createWxMiniContract } from '../../wx/plugins.ts'
import { createOutputFiles } from './files.ts'

const contract = createWxMiniContract({
    target: 'wx',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {}
})

test('creates the stable app stylesheet wrapper', async () => {
    const outputFiles = await createOutputFiles({
        bundle: {},
        contract: contract,
        pages: contract.options.pages.map(resolvePage),
        subpackages: [],
        isProduction: false,
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
