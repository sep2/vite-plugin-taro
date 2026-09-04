import Taro from 'virtual:taro/api'

const isWechatTarget = import.meta.env.VITE_VPT_TARGET === 'wx'
const isAlipayTarget = import.meta.env.VITE_VPT_TARGET === 'zfb'

interface NavigationBarMetrics {
    height: number
    top: number
    paddingX: number
    paddingY: number
    menuWidth: number
}

interface MenuButtonMetrics {
    height: number
    right: number
    top: number
    width: number
}

/** Alipay fields narrowed from Taro's shared system-info result type. */
type AlipaySystemInfo = ReturnType<typeof Taro.getSystemInfoSync> & {
    statusBarHeight: number
    titleBarHeight: number
}

// The app uses one immutable navigation layout per process; this mutable slot avoids repeated native reads across Page mounts.
let cachedNavigationBarMetrics: NavigationBarMetrics | undefined

function getFallbackMenuButtonMetrics(screenWidth: number): MenuButtonMetrics {
    return {
        height: 32,
        right: Math.max(88, screenWidth - 16),
        top: 6,
        width: 88
    }
}

function getMenuButtonMetrics(screenWidth: number): MenuButtonMetrics {
    if (isWechatTarget) {
        const menuButtonMetrics = Taro.getMenuButtonBoundingClientRect()
        if (menuButtonMetrics.width > 0 && menuButtonMetrics.height > 0) return menuButtonMetrics
    }

    return getFallbackMenuButtonMetrics(screenWidth)
}

function getAlipayNavigationBarMetrics(systemInfo: AlipaySystemInfo): NavigationBarMetrics {
    const { statusBarHeight, titleBarHeight } = systemInfo

    return {
        height: statusBarHeight + titleBarHeight,
        top: statusBarHeight,
        paddingX: 16,
        paddingY: (titleBarHeight - 32) / 2,
        menuWidth: 88
    }
}

function getNavigationBarMetrics(
    screenWidth: number,
    statusBarHeight: number,
    menuButtonMetrics: MenuButtonMetrics
): NavigationBarMetrics {
    const menuButtonStatusBarGap = Math.max(0, menuButtonMetrics.top - statusBarHeight)

    return {
        height: menuButtonStatusBarGap * 2 + menuButtonMetrics.height + statusBarHeight,
        top: statusBarHeight,
        paddingX: Math.max(0, screenWidth - menuButtonMetrics.right),
        paddingY: menuButtonStatusBarGap,
        menuWidth: menuButtonMetrics.width
    }
}

function getNavigationBarMetricsCached(): NavigationBarMetrics {
    if (cachedNavigationBarMetrics) return cachedNavigationBarMetrics

    if (isAlipayTarget) {
        cachedNavigationBarMetrics = getAlipayNavigationBarMetrics(Taro.getSystemInfoSync() as AlipaySystemInfo)
        return cachedNavigationBarMetrics
    }

    const windowInfo = Taro.getWindowInfo()
    const screenWidth = windowInfo.screenWidth || 375
    const statusBarHeight = isWechatTarget ? (windowInfo.statusBarHeight ?? 44) : 0
    const menuButtonMetrics = getMenuButtonMetrics(screenWidth)

    cachedNavigationBarMetrics = getNavigationBarMetrics(screenWidth, statusBarHeight, menuButtonMetrics)
    return cachedNavigationBarMetrics
}

export function useNavigationBar(): NavigationBarMetrics {
    return getNavigationBarMetricsCached()
}
