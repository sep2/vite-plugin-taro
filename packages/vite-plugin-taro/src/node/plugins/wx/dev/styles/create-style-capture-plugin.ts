import type { GetModuleInfo, Plugin } from 'rolldown'
import { normalizeModuleId } from '../../../../utils/modules.ts'
import { extractViteCss, isGlobalStyleRequest } from '../../styles/utils.ts'

export type ProcessedStyle = Readonly<{
    css: string
    isTailwindRoot: boolean
}>

type StyleCaptureOptions = Readonly<{
    captureGraph: (getModuleInfo: GetModuleInfo) => void
    captureStyle: (id: string, style: ProcessedStyle) => void
}>

/** Captures Vite's final development CSS and Rolldown's live graph without running the style pipeline twice. */
export function createStyleCapturePlugin({ captureGraph, captureStyle }: StyleCaptureOptions): Plugin {
    return {
        name: 'vpt:wx-dev-style-capture',
        buildStart() {
            captureGraph((moduleId) => this.getModuleInfo(moduleId))
        },
        transform(code, id) {
            if (!isGlobalStyleRequest(id)) {
                return
            }

            const css = extractViteCss(code, id)
            captureStyle(normalizeModuleId(id), {
                css: css,
                isTailwindRoot: css.includes('weapp-tailwindcss vite-generated-css:')
            })
        }
    }
}
