/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:39:23
 * @Last Modified by: qiuz
 */

import { Picker, PickerView, PickerViewColumn, Text, View } from 'virtual:taro/components'
import { isArray } from '@utils'
import clsx from 'clsx'
import { type ComponentType, type PropsWithChildren, useEffect, useRef, useState } from 'react'
import styles from './index.module.css'
import type { RangeItem, TaroPickerSelectorProps } from './type'

function isRangeItem(value: RangeItem | RangeItem[] | undefined): value is RangeItem {
    return value !== undefined && !Array.isArray(value)
}

function isRangeItemList(value: RangeItem[] | RangeItem[][]): value is RangeItem[] {
    return value.length === 0 || isRangeItem(value[0])
}

function isRangeItemMatrix(value: RangeItem[] | RangeItem[][]): value is RangeItem[][] {
    return value.length === 0 || Array.isArray(value[0])
}

function getRangeItems(
    range: RangeItem[] | RangeItem[][],
    mode: TaroPickerSelectorProps['mode'],
    column: number
): RangeItem[] {
    if (mode === 'multiSelector') return isRangeItemMatrix(range) ? (range[column] ?? []) : []
    return isRangeItemList(range) ? range : []
}

function getRangeItem(
    range: RangeItem[] | RangeItem[][],
    mode: TaroPickerSelectorProps['mode'],
    column: number,
    index: number
): RangeItem | undefined {
    return getRangeItems(range, mode, column)[index]
}

let TaroPickerSelector: ComponentType<PropsWithChildren<TaroPickerSelectorProps>>

/*  #ifdef  h5  */
const TaroPickerSelectorH5: ComponentType<PropsWithChildren<TaroPickerSelectorProps>> = (props) => {
    const {
        range = [],
        onChange = () => {},
        onValueChange = () => {},
        value = [0],
        mode = 'selector',
        columnReset = false
    } = props

    const handleChange = (e: any) => {
        if (mode === 'multiSelector') {
            const valueList = isArray(e.detail.value) ? e.detail.value : [e.detail.value]
            const realValue = valueList.map((v: any, i: number) => getRangeItem(range, mode, i, Number(v))?.value)
            onChange(realValue)
            return
        }
        onChange([getRangeItem(range, mode, 0, Number(e.detail.value))?.value])
    }

    const handleValueChange = (e: any) => {
        if (mode === 'multiSelector') {
            const { column } = e.detail
            const valueList = [...value]
            valueList[column] = Number(getRangeItem(range, mode, column, Number(e.detail.value))?.value ?? 0)
            onValueChange(valueList as number[])
            return
        }
        onValueChange([range[e.detail.value]])
    }

    const getVlaueIndex = (selectValue: any[]) => {
        return selectValue.map((v, i) => {
            let index = 0
            const data = (mode === 'multiSelector' ? range[i] : range) || []
            ;(data as RangeItem[]).forEach((r: any, ri: number) => {
                if (r.value === v) {
                    index = ri
                }
            })
            return index
        })
    }

    const valueIndex = getVlaueIndex(value)
    const pickerValue = mode === 'multiSelector' ? valueIndex : valueIndex[0]

    return (
        <Picker
            mode={mode}
            range={range as any[]}
            rangeKey="label"
            // @ts-expect-error
            columnReset={columnReset}
            value={pickerValue}
            textProps={{ cancelText: '取消', okText: '确定' }}
            onChange={handleChange}
            onColumnChange={handleValueChange}
        >
            {props.children}
        </Picker>
    )
}

TaroPickerSelector = TaroPickerSelectorH5
/*  #endif  */

/*  #ifdef  wx  */
const TaroPickerSelectorWx: ComponentType<PropsWithChildren<TaroPickerSelectorProps>> = (props) => {
    const {
        range = [],
        value = [],
        mode = 'selector',
        title,
        children,
        onChange = () => {},
        onValueChange = () => {}
    } = props
    const [visible, setVisible] = useState(false)
    const [animation, setAnimation] = useState('slide-down')
    const [selectedValue, setSelectedValue] = useState(value)
    const realValue = useRef<unknown[] | undefined>(undefined)

    useEffect(() => {
        setSelectedValue(value)
    }, [value])

    const showModal = (e: any) => {
        e.stopPropagation()
        setVisible(true)
        setAnimation('slide-up')
        setSelectedValue(value)
    }

    const closeModal = (e?: any) => {
        e && e.stopPropagation()
        setAnimation('slide-down')
        // 延时 以展示完收起动画
        setTimeout(() => {
            setVisible(false)
        }, 150)
    }

    const handleChange = (e: any) => {
        if (mode === 'multiSelector') {
            const valueList = isArray(e.detail.value) ? e.detail.value : [e.detail.value]
            const nextValue = valueList.map((v: any, i: number) => getRangeItem(range, mode, i, Number(v))?.value)
            realValue.current = nextValue
            onValueChange(nextValue)
            return
        }
        const nextValue = [getRangeItem(range, mode, 0, Number(e.detail.value))?.value]
        realValue.current = nextValue
        onValueChange(nextValue)
    }

    const onConfirm = () => {
        onChange(realValue.current || selectedValue)
        // 展示过渡动画
        setTimeout(closeModal)
    }

    const renderMultiPicker = (data: any) => {
        return data.map((item: any, index: number) => {
            return (
                // biome-ignore lint/suspicious/noArrayIndexKey: columns are static and only identified by position
                <PickerViewColumn key={`${index}`}>
                    {item.map((i: any) => {
                        return (
                            <View className="flex items-center justify-center" key={i.value}>
                                {i.label}
                            </View>
                        )
                    })}
                </PickerViewColumn>
            )
        })
    }

    const getVlaueIndex = (selectValue: any[]) => {
        return selectValue.map((v, i) => {
            let index = 0
            const data = (mode === 'multiSelector' ? range[i] : range) || []
            ;(data as RangeItem[]).forEach((r: any, ri: number) => {
                if (r.value === v) {
                    index = ri
                }
            })
            return index
        })
    }

    return (
        <View onClick={showModal}>
            {visible && (
                <View
                    className={clsx(
                        'fixed bottom-0 left-0 right-0 top-0 z-998 bg-[rgba(0,0,0,0.5)]',
                        animation === 'slide-up' ? styles.maskEnter : styles.maskLeave
                    )}
                    onClick={closeModal}
                />
            )}
            {visible && (
                <View
                    className={clsx(
                        'pb-safe fixed bottom-0 left-0 z-999 box-border w-full bg-white text-center',
                        animation === 'slide-up' ? styles.modalEnter : styles.modalLeave
                    )}
                >
                    <View className="flex flex-row items-center justify-between bg-[rgba(248,249,251,1)] p-3.75 text-base">
                        <Text className="text-[#474B4E]" onClick={closeModal}>
                            取消
                        </Text>
                        <Text className="font-pingfang-medium text-base text-[rgba(11,15,18,1)]">{title}</Text>
                        <Text className="font-bold text-[#1fb081]" onClick={onConfirm}>
                            确定
                        </Text>
                    </View>
                    <PickerView className="h-75" value={getVlaueIndex(value)} onChange={handleChange}>
                        {mode === 'multiSelector' ? (
                            renderMultiPicker(range)
                        ) : (
                            <PickerViewColumn>
                                {(range as RangeItem[]).map((i: any) => {
                                    return (
                                        <View className="flex items-center justify-center" key={i.value}>
                                            {i.label}
                                        </View>
                                    )
                                })}
                            </PickerViewColumn>
                        )}
                    </PickerView>
                </View>
            )}
            {children}
        </View>
    )
}

TaroPickerSelector = TaroPickerSelectorWx
/*  #endif  */

export default TaroPickerSelector
