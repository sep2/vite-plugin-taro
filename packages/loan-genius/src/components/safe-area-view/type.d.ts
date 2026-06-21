/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2021-01-09 14:00:01
 * @Last Modified by: qiuz
 */

import type { FunctionComponent, PropsWithChildren } from 'react'
import type { ViewProps } from 'virtual:taro/components'

export interface TaroSafeAreaViewProps extends ViewProps {
    style?: object
}

export type TaroSafeAreaViewType = FunctionComponent<PropsWithChildren<TaroSafeAreaViewProps>>

declare const TaroSafeAreaView: TaroSafeAreaViewType

export default TaroSafeAreaView
