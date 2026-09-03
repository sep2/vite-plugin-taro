import assert from 'node:assert/strict'
import test from 'node:test'
import type { MiniContract } from '../mini-contract.ts'
import { createOutputFiles } from './files.ts'

const contract = {
    styles: {
        appFileName: 'app.native.css',
        globalFileName: 'assets/global.native.css'
    },
    output: {
        generateProjectSkeleton() {
            return []
        }
    }
} satisfies Pick<MiniContract, 'output' | 'styles'>

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
        outputFiles.find((file) => file.type === 'asset' && file.fileName === 'app.native.css'),
        {
            type: 'asset',
            fileName: 'app.native.css',
            source: '@import "./assets/global.native.css";\n'
        }
    )
})
