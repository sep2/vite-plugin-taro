// App and Page shells activate independently; make Current.app initialization an explicit prerequisite for Page mount.
import './app.ts'

// @ts-expect-error: The wx build replaces this private import with the configured Page component.
import PageComponent from '\0vpt:page-component'
import { createPageConfig } from './taro-runtime.ts'

declare const __VPT_PAGE_PATH__: string
declare const __VPT_PAGE_CONFIG__: Record<string, unknown>

const config = createPageConfig(PageComponent, __VPT_PAGE_PATH__, { root: { cn: [] } }, __VPT_PAGE_CONFIG__)

export default config
