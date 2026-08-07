import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { publishWxDevStyle } from './publish-wx-dev-style.ts'

test('publishes bundled-dev global styles at the Mini Program root', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'vpt-wx-dev-style-'))
    try {
        await publishWxDevStyle(
            {
                output: [
                    { type: 'asset', fileName: 'pages/home/index.wxss', source: '' },
                    {
                        type: 'asset',
                        fileName: 'src/app.wxss',
                        source: '*,::before,::after { box-sizing: border-box; }'
                    }
                ]
            },
            outDir
        )

        const published = await readFile(path.join(outDir, 'app.wxss'), 'utf8')
        assert.match(published, /view,text,::before,::after/)
        assert.doesNotMatch(published, /\*,/)
    } finally {
        await rm(outDir, { force: true, recursive: true })
    }
})
