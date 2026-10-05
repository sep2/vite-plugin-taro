// App and Page shells activate independently; make Current.app initialization an explicit prerequisite for Page mount.
import './app.ts'

// @ts-expect-error: The Mini Program build replaces this private import with the configured Page component.
import PageComponent from '\0vpt:page-component'
import { createVptPageConfig } from './create-vpt-page-config.ts'

const config = createVptPageConfig(PageComponent, __VPT_PAGE_OPTIONS__)

export default config
