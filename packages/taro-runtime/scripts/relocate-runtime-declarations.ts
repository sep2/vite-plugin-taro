import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** Public declaration counterparts of the upstream modules retained by the runtime package. */
const declarationAliases: Readonly<Record<string, string>> = {
    '@tarojs/api': 'vite-plugin-taro-runtime/api',
    '@tarojs/components': 'vite-plugin-taro-runtime/components',
    '@tarojs/components/dist/components': 'vite-plugin-taro-runtime/components/dist/components',
    '@tarojs/router': 'vite-plugin-taro-runtime/router',
    '@tarojs/runtime': 'vite-plugin-taro-runtime/runtime/mini',
    '@tarojs/taro': 'vite-plugin-taro-runtime/taro',
    '@tarojs/taro/types/compile': 'vite-plugin-taro-runtime/taro/types/compile',
    '@tarojs/taro-h5/dist/api/index': 'vite-plugin-taro-runtime/taro-h5/dist/api/index',
    '@tarojs/taro-h5/dist/api/taro': 'vite-plugin-taro-runtime/taro-h5/dist/api/taro'
}

/**
 * Relocates imports and module augmentations in one O(total declaration bytes) pass. JavaScript remains unchanged: Vite
 * owns its target-specific aliases, whereas consumer TypeScript must resolve declarations without those plugins or Taro's
 * development dependencies. Shared/compiler-only references have no relocated counterpart and retain their original names.
 */
export function relocateRuntimeDeclarations(distRoot: string): void {
    const declarations = readdirSync(distRoot, { recursive: true, withFileTypes: true }).filter(
        (entry) => entry.isFile() && entry.name.endsWith('.d.ts')
    )
    for (const declaration of declarations) {
        const file = path.join(declaration.parentPath, declaration.name)
        const source = readFileSync(file, 'utf8')
        const relocated = source.replace(/(['"])(@tarojs\/[^'"]+)\1/g, (match, quote: string, request: string) => {
            const replacement = declarationAliases[request]
            return replacement === undefined ? match : `${quote}${replacement}${quote}`
        })
        if (relocated !== source) {
            writeFileSync(file, relocated)
        }
    }
}
