import type { MiniElementData } from 'vite-plugin-taro-runtime/runtime/mini'

export type TemplatePageData = {
    app: { nn: string; cn: MiniElementData['cn'] }
    page: { cn: MiniElementData['cn'] }
}
