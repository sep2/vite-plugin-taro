import assert from 'node:assert/strict'
import test from 'node:test'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { createH5EntrySource, createH5IndexHtmlTags, h5EntryId } from './virtual-module.ts'

const options: VitePluginTaroOptions = {
    target: 'h5',
    app: 'src/app.tsx',
    pages: [
        {
            path: 'pages/home/index',
            config: {
                navigationBarTitleText: 'Home'
            }
        }
    ],
    appJson: {
        window: {
            navigationBarTitleText: 'Example'
        }
    },
    projectConfigJson: {},
    sitemapJson: {}
}

test('injects the generated H5 entry into index.html', () => {
    assert.deepEqual(createH5IndexHtmlTags(), [
        {
            tag: 'script',
            attrs: {
                type: 'module'
            },
            children: `import '${h5EntryId}'`,
            injectTo: 'body'
        }
    ])
})

test('creates the H5 App and lazy routes from configured modules', () => {
    const source = createH5EntrySource(options, '/project')

    assert.match(source, /from ["']\/@fs\/.+\/runtime\/h5\/taro-runtime\.js["']/)
    assert.match(source, /from ["']\/@fs\/\/project\/src\/app\.tsx["']/)
    assert.match(source, /import\(["']\/@fs\/\/project\/src\/pages\/home\/index\.tsx["']\)/)
    assert.match(source, /"pages":\["pages\/home\/index"\]/)
    assert.match(source, /navigationBarTitleText["']?:["']Home/)
})
