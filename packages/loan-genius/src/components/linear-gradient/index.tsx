/* eslint-disable react/jsx-curly-brace-presence */
/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:38:52
 * @Last Modified by: qiuz
 */

import clsx from 'clsx'
import type { FunctionComponent, PropsWithChildren } from 'react'
import type { ITouchEvent } from 'virtual:taro/components'
import { Image, View } from 'virtual:taro/components'

interface TaroLinearGradientProps {
    style?: object
}

export interface LinearGradientType {
    // 优先图片
    src?: string
    color?: string
    colors?: string[]
    angle?: number
    locations?: number[]
    className?: string
    useColors?: boolean
    onClick?: (event: ITouchEvent) => void
}

const TaroLinearGradient: FunctionComponent<PropsWithChildren<LinearGradientType & TaroLinearGradientProps>> = (
    props
) => {
    const {
        src = '',
        style = {},
        color = '',
        className = '',
        onClick = () => {},
        colors = [],
        angle = 180,
        useColors = false,
        children
    } = props
    const len = colors.length
    const linearGradientColors = colors && len <= 0 ? ['#ffffff', '#ffffff'] : colors

    let background = color
    if (useColors) {
        const colorString = linearGradientColors
            .map((colorStr: string, index: number) => `${colorStr} ${index === len - 1 ? '100' : (index / len) * 100}%`)
            .join(',')
        background = `linear-gradient(${angle}deg, ${colorString})`
    }
    return (
        <View
            className={clsx('relative z-2 w-full', className)}
            style={{ ...(!src ? { background } : {}), ...(style as object) }}
            onClick={onClick}
        >
            {src && (
                <Image src={src} mode="aspectFill" className="absolute bottom-0 left-0 right-0 top-0 -z-1 size-full" />
            )}
            {children}
        </View>
    )
}

export default TaroLinearGradient
