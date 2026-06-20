/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:36:40
 * @Last Modified by: qiuz
 */

import { isArray } from '@utils'
import clsx from 'clsx'
import type { CSSProperties, FunctionComponent, PropsWithChildren } from 'react'
import { View } from 'vite-plugin-taro/components'
import type { Color } from 'vite-plugin-taro/taro'

interface ShadowOffset {
    width: number
    height: number
}

interface BoxShadowProps {
    shadowColor?: Color
    shadowOffset?: ShadowOffset
    shadowOpacity?: CSSProperties['opacity']
    shadowRadius?: number
    elevation?: number
    boxShadow?: CSSProperties['boxShadow']
    className?: string
    style?: CSSProperties
}

const BoxShadow: FunctionComponent<PropsWithChildren<BoxShadowProps>> = (props) => {
    const { boxShadow = '', style = {}, className = '', children } = props
    const propsStyle = Object.assign({ boxShadow }, ...(isArray(style) ? style : ([style] as any)))

    return (
        <View className={clsx(className)} style={propsStyle}>
            {children}
        </View>
    )
}

export default BoxShadow
