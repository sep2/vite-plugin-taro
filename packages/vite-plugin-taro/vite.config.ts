import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`)])

const externalPatterns = [
    /^@rolldown\/plugin-babel(?:\/.*)?$/,
    /^@tarojs\/.+/,
    /^@vitejs\/plugin-react(?:\/.*)?$/,
    /^babel-plugin-transform-taroapi(?:\/.*)?$/,
    /^react(?:\/.*)?$/,
    /^react-dom(?:\/.*)?$/,
    /^tailwindcss(?:\/.*)?$/,
    /^vite$/,
    /^weapp-tailwindcss(?:\/.*)?$/
]

function isExternal(id: string): boolean {
    return nodeBuiltins.has(id) || externalPatterns.some((pattern) => pattern.test(id))
}

function rewriteDeclarationImportExtensions(content: string): string {
    return content.replace(/((?:from|import)\s+['"][^'"]+)\.ts(['"])/g, '$1.js$2')
}

function transformDeclarationContent(filePath: string, content: string): string {
    if (filePath.endsWith('public/taro.d.ts')) {
        return "import Taro = require('@tarojs/taro')\nexport = Taro\n"
    }
    return rewriteDeclarationImportExtensions(content)
}

export default defineConfig({
    plugins: [
        dts({
            entryRoot: 'src',
            outDir: 'dist',
            tsconfigPath: './tsconfig.build.json',
            beforeWriteFile(filePath, content) {
                if (!filePath.endsWith('.d.ts')) return
                return { content: transformDeclarationContent(filePath, content) }
            }
        })
    ],
    build: {
        copyPublicDir: false,
        emptyOutDir: true,
        minify: false,
        sourcemap: true,
        target: 'node20',
        lib: {
            entry: {
                vite: 'src/vite.ts',
                'public/components': 'src/public/components.ts',
                'public/taro': 'src/public/taro.ts',
                'shim/h5': 'src/shim/h5.ts',
                'shim/wx': 'src/shim/wx.ts'
            },
            formats: ['es']
        },
        rolldownOptions: {
            external: isExternal,
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name]-[hash].js'
            }
        }
    }
})
