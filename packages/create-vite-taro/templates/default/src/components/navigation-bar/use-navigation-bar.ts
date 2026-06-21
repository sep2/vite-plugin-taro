import Taro from 'virtual:taro/api'
import { useState } from 'react'

interface NavigationBarNavInfo {
    height: number
    top: number
    py: number
    px: number
}

interface NavigationBarMenuInfo {
    bottom: number
    height: number
    left: number
    right: number
    top: number
    width: number
}

interface NavigationBarInfo {
    navBar: NavigationBarNavInfo
    menuInfo: NavigationBarMenuInfo
}

let navigationBarInfo: NavigationBarInfo = {
    navBar: { height: 0, top: 0, py: 0, px: 0 },
    menuInfo: { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 }
}

function createFallbackMenuInfo(screenWidth: number): NavigationBarMenuInfo {
    const width = 88
    const height = 32
    const top = 6
    const right = Math.max(width, screenWidth - 16)

    return {
        bottom: top + height,
        height,
        left: right - width,
        right,
        top,
        width
    }
}

function getMenuInfo(screenWidth: number): NavigationBarMenuInfo {
    if (IS_WEAPP) {
        const menuButtonInfo = Taro.getMenuButtonBoundingClientRect()
        if (menuButtonInfo.width > 0 && menuButtonInfo.height > 0) return menuButtonInfo
    }

    return createFallbackMenuInfo(screenWidth)
}

export function initNavigationBar(): NavigationBarInfo {
    const windowInfo = Taro.getWindowInfo()
    const screenWidth = windowInfo.screenWidth || 375
    const statusBarHeight = IS_WEAPP ? (windowInfo.statusBarHeight ?? 44) : 0
    const menuInfo = getMenuInfo(screenWidth)
    const menuButtonStatusBarGap = Math.max(0, menuInfo.top - statusBarHeight)
    const navBarHeight = menuButtonStatusBarGap * 2 + menuInfo.height + statusBarHeight
    const paddingX = Math.max(0, screenWidth - menuInfo.right)

    navigationBarInfo = {
        navBar: {
            height: navBarHeight,
            top: statusBarHeight,
            py: menuButtonStatusBarGap,
            px: paddingX
        },
        menuInfo
    }

    return navigationBarInfo
}

function getNavigationBarInfo(): NavigationBarInfo {
    if (navigationBarInfo.navBar.height > 0) return navigationBarInfo
    return initNavigationBar()
}

export function useNavigationBar(): NavigationBarInfo {
    const [currentNavigationBarInfo] = useState(getNavigationBarInfo)
    return currentNavigationBarInfo
}
