/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:39:47
 * @Last Modified by: qiuz
 */

import type { ReactNode } from 'react'

export interface RangeItem {
    value: string | number
    label: string
    children?: RangeItem[]
}

export interface TaroPickerSelectorProps {
    children?: ReactNode
    /** 选择器类型
     * @supported wx, h5
     * @default selector
     */
    mode: 'selector' | 'multiSelector'
    /** mode为 selector 或 multiSelector 时，range 有效
     * @supported wx, h5
     * @default []
     */
    range: RangeItem[] | RangeItem[][]
    /** 当 range 是一个 Object Array 时，通过 rangeKey 来指定 Object 中 key 的值作为选择器显示内容
     * @supported wx, h5
     * @default label
     */
    // rangeKey?: 'label';
    /** 选择的值
     * @supported wx, h5
     */
    value: number[]
    /** 点击确定时触发 value
     * @supported wx, h5
     */
    onChange: (value: unknown[]) => void
    /** value 改变时触发 value
     * @supported wx, h5
     */
    onValueChange?: (value: unknown[]) => void

    /**
     * 级联选择时需要传入
     * @supported h5
     * @default 3
     */
    cols?: number
    /**
     * 选择器标题
     * @supported wx, h5
     */
    title?: string
    /**
     * 级联选择
     * @supported h5
     * @default false
     */
    cascade?: boolean
    /**
     * 每列标签样式，已知问题: height、fontWeight 安卓和IOS表现不一致
     * @default false
     */
    itemStyle?: object
    /**
     * 多列情况下是否开启，选择前一列，重置下一列
     */
    columnReset?: boolean
}
