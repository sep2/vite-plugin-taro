/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:39:59
 * @Last Modified by: qiuz
 */

import { View } from 'virtual:taro/components'
import clsx from 'clsx'
import type { TaroSafeAreaViewType } from './type'

const TaroSafeAreaView: TaroSafeAreaViewType = (props) => {
    const { className = '', style = {} } = props

    return (
        <View className={clsx('pb-safe w-full bg-white', className)} style={{ ...(style as object) }}>
            {props.children}
        </View>
    )
}

export default TaroSafeAreaView
