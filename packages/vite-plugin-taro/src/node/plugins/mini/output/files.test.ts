import assert from 'node:assert/strict'
import test from 'node:test'
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
        subpackages: [],
        isProduction: false,
        getModuleInfo: () => null,
        getPackageLocation: () => ({ kind: 'main' })
    })

    assert.deepEqual(
        outputFiles.find((file) => file.type === 'asset' && file.fileName === contract.styles.appFileName),
        {
            type: 'asset',
            fileName: contract.styles.appFileName,
            source: `@import "./${contract.styles.globalFileName}";\n`
        }
    )
})
