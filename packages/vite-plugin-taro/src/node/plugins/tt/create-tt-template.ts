import { RecursiveTemplate } from '@tarojs/shared/dist/template.js'
import { components } from 'vite-plugin-taro-runtime/plugin-platform-tt/runtime-utils'
import { recursiveMerge } from '../mini/skeleton/recursive-merge.ts'

/** Mirrors Taro 4.2.1's TT template without loading its CLI/compiler dependency graph. */
class TtTemplate extends RecursiveTemplate {
    supportXS = true
    Adapter = {
        if: 'tt:if',
        else: 'tt:else',
        elseif: 'tt:elif',
        for: 'tt:for',
        forItem: 'tt:for-item',
        forIndex: 'tt:for-index',
        key: 'tt:key',
        xs: 'sjs',
        type: 'tt'
    }

    protected replacePropName(name: string, value: string): string {
        if (value === 'eh') {
            const lowerCaseName = name.toLowerCase()
            return lowerCaseName === 'bindlongtap' ? 'bindlongpress' : lowerCaseName
        }
        return name
    }

    buildXsTemplate(filePath: string | undefined): string {
        return `<sjs module="xs" src="${filePath ?? './utils'}.sjs" />`
    }
}

/** Creates an isolated mutable component registry for one TT skeleton generation. */
export function createTtTemplate(): RecursiveTemplate {
    const template = new TtTemplate()
    // Upstream merges target attributes into this instance's registry before assigning compact aliases.
    template.mergeComponents({ helper: { recursiveMerge } }, components)
    return template
}
