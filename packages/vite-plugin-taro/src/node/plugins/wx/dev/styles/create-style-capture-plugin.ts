import type { Plugin } from 'rolldown'
import { normalizeModuleId } from '../../../../utils/modules.ts'
import { extractViteCss, isGlobalStyleRequest } from '../../styles/utils.ts'

export type ProcessedStyle = Readonly<{
    css: string
    isTailwindRoot: boolean
}>

/** Captures Vite's final development CSS without running the style pipeline twice. */
export function createStyleCapturePlugin(capture: (id: string, style: ProcessedStyle) => void): Plugin {
    return {
        name: 'vpt:wx-dev-style-capture',
        transform(code, id) {
            if (!isGlobalStyleRequest(id)) {
                return
            }

            const css = extractViteCss(code, id)
            capture(normalizeModuleId(id), {
                css: css,
                isTailwindRoot: css.includes('weapp-tailwindcss vite-generated-css:')
            })
        }
    }
}
