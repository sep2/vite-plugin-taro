import { RecursiveTemplate } from '@tarojs/shared/dist/template.js'
import { components } from 'vite-plugin-taro-runtime/plugin-platform-xhs/runtime-utils'
import { recursiveMerge } from '../mini/skeleton/recursive-merge.ts'

/** Uses the upstream XHS recursive-SJS dialect with the pinned shared template generator. */
class XhsTemplate extends RecursiveTemplate {
    supportXS = true
    Adapter = {
        if: 'xhs:if',
        else: 'xhs:else',
        elseif: 'xhs:elif',
        for: 'xhs:for',
        forItem: 'xhs:for-item',
        forIndex: 'xhs:for-index',
        key: 'xhs:key',
        xs: 'sjs',
        type: 'xhs'
    }

    constructor() {
        super()
        // Taro shares its base registry; each XHS build owns a mutable copy before target merging.
        this.internalComponents = structuredClone(this.internalComponents)
    }

    protected replacePropName(name: string, value: string, componentName: string): string {
        if (componentName === 'button' && name === 'share-type') {
            return 'data-share-type'
        }
        return value === 'eh' ? name.toLowerCase() : name
    }

    buildXsTemplate(filePath: string | undefined): string {
        return `<sjs module="xs" src="${filePath ?? './utils'}.sjs" />`
    }
}

/** Creates one isolated component registry for an XHS build. */
export function createXhsTemplate(): RecursiveTemplate {
    const template = new XhsTemplate()
    // Each template owns its mutable alias registry; merging leaves the upstream metadata unchanged.
    template.mergeComponents({ helper: { recursiveMerge } }, components)
    return template
}
