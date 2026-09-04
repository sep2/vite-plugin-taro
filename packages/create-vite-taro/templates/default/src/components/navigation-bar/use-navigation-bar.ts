import Taro from 'virtual:taro/api'
import { useMemo } from 'react'

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

function getAlipayNavigationBarMetrics(): NavigationBarMetrics {
    // Alipay 4.2.1 exposes these native title metrics through the established system-info API.
    const { statusBarHeight, titleBarHeight } = Taro.getSystemInfoSync() as AlipaySystemInfo

    return {
        height: statusBarHeight + titleBarHeight,
        top: statusBarHeight,
        paddingX: 16,
        paddingY: (titleBarHeight - 32) / 2,
        menuWidth: 88
    }
}

function getNavigationBarMetrics(): NavigationBarMetrics {
    if (isAlipayTarget) return getAlipayNavigationBarMetrics()

    const windowInfo = Taro.getWindowInfo()
    const screenWidth = windowInfo.screenWidth || 375
    const statusBarHeight = isWechatTarget ? (windowInfo.statusBarHeight ?? 44) : 0
    const menuButtonMetrics = getMenuButtonMetrics(screenWidth)
    const menuButtonStatusBarGap = Math.max(0, menuButtonMetrics.top - statusBarHeight)

    return {
        height: menuButtonStatusBarGap * 2 + menuButtonMetrics.height + statusBarHeight,
        top: statusBarHeight,
        paddingX: Math.max(0, screenWidth - menuButtonMetrics.right),
        paddingY: menuButtonStatusBarGap,
        menuWidth: menuButtonMetrics.width
    }
}

export function useNavigationBar(): NavigationBarMetrics {
    return useMemo(getNavigationBarMetrics, [])
}
