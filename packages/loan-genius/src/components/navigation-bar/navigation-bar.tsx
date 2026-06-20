import clsx from 'clsx'
import type { CSSProperties, PropsWithChildren, ReactNode } from 'react'
import { useMemo } from 'react'
import { View } from 'virtual:taro/components'
import Taro from 'virtual:taro'

interface NavigationBarMetrics {
    height: number
    top: number
    paddingX: number
    paddingY: number
    menuWidth: number
}

export interface NavigationBarProps {
    left?: ReactNode
    right?: ReactNode
    color?: string
    backgroundColor?: string
    background?: string
    className?: string
    contentClassName?: string
    leftClassName?: string
    rightClassName?: string
    style?: CSSProperties
    onBack?: () => void
}

function px(value: number): string {
    return `${Math.round(value)}px`
}

function getNavigationBarMetrics(): NavigationBarMetrics {
    const windowInfo = Taro.getWindowInfo()
    const statusBarHeight = IS_WEAPP ? (windowInfo.statusBarHeight ?? 44) : 0
    const menuButtonInfo = IS_WEAPP
        ? Taro.getMenuButtonBoundingClientRect()
        : {
              top: 6,
              right: windowInfo.screenWidth - 16,
              width: 44,
              height: 32
          }
    const menuButtonStatusBarGap = menuButtonInfo.top - statusBarHeight

    return {
        height: menuButtonStatusBarGap * 2 + menuButtonInfo.height + statusBarHeight,
        top: statusBarHeight,
        paddingX: windowInfo.screenWidth - menuButtonInfo.right,
        paddingY: menuButtonStatusBarGap,
        menuWidth: menuButtonInfo.width
    }
}

function getBackgroundStyle(backgroundColor: string, background?: string): CSSProperties {
    if (background) return { background }
    return { backgroundColor }
}

function canNavigateBack(): boolean {
    return Taro.getCurrentPages().length > 1
}

function defaultNavigateBack(): void {
    Taro.navigateBack({ delta: 1 })
}

interface BackButtonProps {
    color: string
    onClick: () => void
}

function BackButton(props: BackButtonProps) {
    return (
        <View className="flex size-full items-center justify-start" onClick={props.onClick}>
            <View
                className="size-1.5"
                style={{
                    borderBottom: `2px solid ${props.color}`,
                    borderLeft: `2px solid ${props.color}`,
                    transform: 'rotate(45deg)'
                }}
            />
        </View>
    )
}

export function NavigationBar(props: PropsWithChildren<NavigationBarProps>) {
    const metrics = useMemo(getNavigationBarMetrics, [])

    const color = props.color ?? '#0B0F12'
    const backgroundColor = props.backgroundColor ?? '#fff'
    const backgroundStyle = getBackgroundStyle(backgroundColor, props.background)
    const leftContent =
        props.left === undefined && canNavigateBack() ? (
            <BackButton color={color} onClick={props.onBack ?? defaultNavigateBack} />
        ) : (
            props.left
        )
    const containerBaseStyle: CSSProperties = {
        ...backgroundStyle,
        color,
        height: px(metrics.height)
    }
    const containerStyle = props.style ? { ...containerBaseStyle, ...props.style } : containerBaseStyle
    const contentStyle: CSSProperties = {
        top: px(metrics.top),
        padding: `${px(metrics.paddingY)} ${px(metrics.paddingX)}`
    }
    const sideStyle: CSSProperties = {
        flexBasis: px(metrics.menuWidth),
        width: px(metrics.menuWidth)
    }

    return (
        <View className={clsx('flex relative w-full', props.className)} style={containerStyle}>
            <View
                className="absolute bottom-0 left-0 box-border flex w-full flex-row items-center"
                style={contentStyle}
            >
                <View
                    className={clsx('flex h-full shrink-0 flex-row items-center', props.leftClassName)}
                    style={sideStyle}
                >
                    {leftContent}
                </View>
                <View
                    className={clsx(
                        'flex h-full min-w-0 flex-1 flex-row items-center justify-center text-center',
                        'text-base font-medium',
                        props.contentClassName
                    )}
                >
                    {props.children}
                </View>
                <View
                    className={clsx('flex h-full shrink-0 flex-row items-center justify-end', props.rightClassName)}
                    style={sideStyle}
                >
                    {props.right}
                </View>
            </View>
        </View>
    )
}
