import { createNativeConfig } from './bootstrap.ts'

const pageMethods = [
    'onLoad',
    'onUnload',
    'onReady',
    'onShow',
    'onHide',
    'onPullDownRefresh',
    'onReachBottom',
    'onPageScroll',
    'onResize',
    'onTabItemTap',
    'onTitleClick',
    'onOptionMenuClick',
    'onKeyboardHeight',
    'onPopMenuClick',
    'onPullIntercept',
    'onAddToFavorites',
    'onSaveExitState',
    'eh'
] as const

// @ts-expect-error: The WX build resolves the route-specific Page module.
const loadPageModule = () => import('\0vpt:page-module')
const pageConfig = createNativeConfig('Page', loadPageModule, pageMethods, {
    data: {
        root: {
            cn: []
        }
    }
})

Page(pageConfig)
