import { createNativeShell } from './bootstrap.ts'

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

Page(
    createNativeShell({
        moduleName: 'Page',
        // @ts-expect-error: The wx build resolves the route-specific Page module.
        loadModule: () => import('\0vpt:page-module'),
        methods: pageMethods,
        properties: {
            data: {
                root: {
                    cn: []
                }
            }
        }
    })
)
