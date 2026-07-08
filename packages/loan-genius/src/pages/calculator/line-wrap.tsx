/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date: 2020-06-28 13:47:24
 * @Last Modified by: qiuz
 * @Last Modified time: 2021-01-04 22:04:16
 */

import { Button, Image, Input, Text, View } from 'virtual:taro/components'
import { Modal, Pciker } from '@components'
import { useState } from 'react'
import { RIGHT_ARROW } from './constants'

interface LineWrapProps {
    type?: string[]
    data?: any[]
    onChangePicker?: (...args: any) => void
    onInputChange?: (...args: any) => void
    onBlur?: (...args: any) => void
}

export function LineWrap({
    type = [],
    data = [],
    onChangePicker = () => {},
    onInputChange = () => {},
    onBlur: handleBlur = () => {}
}: LineWrapProps) {
    const [visible, setVisible] = useState(false)
    const [explainData, setExplainData] = useState<any>({})
    const [focus, setFocus] = useState<boolean[]>([])

    const handlePickerChange = (item: any, index: number) => (value: any) => {
        const valueMap = item.range.filter((rangeItem: any) => rangeItem.value === Number(value[0]))
        onChangePicker(item, valueMap[0] || item.range[0], index)
    }

    const handleInputChange = (item: any, index: number) => (e: any) => {
        let { value } = e.detail
        if (item.inputType === 'number' || item.keyboardType === 'number-pad') {
            value = parseInt(value, 10)
        }
        onInputChange(item, value, index)
    }

    const showExplain = (item: any) => () => {
        setExplainData(item)
        setVisible(true)
    }

    const closeModal = () => {
        setVisible(false)
    }

    const onFocus = (index: number) => () => {
        setFocus((currentFocus) => {
            const nextFocus = [...currentFocus]
            nextFocus[index] = true
            return nextFocus
        })
    }

    const onInputBlur = (loan: any, index: number) => (e: any) => {
        setFocus((currentFocus) => {
            const nextFocus = [...currentFocus]
            nextFocus[index] = false
            return nextFocus
        })
        loan.blurCheck && handleBlur(e)
    }

    const list = data.filter((_item) => type.indexOf(_item && _item.renderType) > -1)
    const isH5Target = import.meta.env.VITE_PLUGIN_TARO_TARGET === 'h5'

    return (
        <View>
            {explainData.title && (
                <Modal
                    className="pt-2.5"
                    visible={visible}
                    closable
                    transparent
                    animationType="none"
                    onClose={closeModal}
                >
                    <View className="flex flex-col p-1.25 pt-0">
                        <Text className="mb-5 mt-2.5 w-full text-center font-pingfang-semibold text-xl font-bold text-[rgba(11,15,18,1)]">
                            {explainData.title}
                        </Text>
                        <View className="flex flex-col pb-5">
                            <Text className="font-pingfang-regular text-base font-normal leading-6 text-[rgba(11,15,18,1)]">
                                {explainData.content}
                            </Text>
                        </View>

                        <Button
                            className={
                                'after:content-none p-2 w-full rounded-xs leading-normal border-none bg-[rgba(35,201,147,1)]'
                            }
                            onClick={closeModal}
                        >
                            <Text className="font-pingfang-semibold text-base font-bold text-white">我知道了</Text>
                        </Button>
                    </View>
                </Modal>
            )}
            {list.map((loan: any, index: number) => {
                let valueIndex = 0
                if (loan.range) {
                    loan.range = loan.rangeFilter
                        ? loan.range.filter((_r: any) => _r.limit === loan.rangeFilter)
                        : loan.range
                    valueIndex = loan.range.findIndex((item: any) => item.value === Number(loan.value))
                }
                return (
                    <View key={loan.name} className="relative flex flex-row items-center justify-between py-5.5">
                        <View className="mr-4.5 flex w-28 shrink-0 flex-row items-center">
                            <Text className="text-base font-normal text-[rgba(11,15,18,1)]">{loan.name}</Text>
                            {loan.icon && (
                                <View onClick={showExplain(loan.explain)}>
                                    <Image className="ml-0.5 size-3.5" src={loan.icon} />
                                </View>
                            )}
                        </View>
                        <View className="flex flex-1 flex-row items-center">
                            {loan.type === 'selector' ? (
                                <View className="flex-1">
                                    <Pciker
                                        mode="selector"
                                        title={loan.name}
                                        value={[loan.value]}
                                        range={loan.range}
                                        onChange={handlePickerChange(loan, index)}
                                    >
                                        <Text className="inline-flex text-base text-[#0B0F12]">
                                            {loan.range[valueIndex] && loan.range[valueIndex].label}
                                        </Text>
                                    </Pciker>
                                </View>
                            ) : (
                                <Input
                                    // Taro 内置类型未覆盖 number-pad
                                    // @ts-expect-error
                                    keyboardType={loan.keyboardType}
                                    type={loan.inputType || 'text'}
                                    maxLength={loan.maxLength}
                                    className="flex-1 bg-transparent p-0 font-pingfang-regular text-base text-[#0B0F12]"
                                    style={loan.valueStyle || {}}
                                    disabled={!isH5Target ? loan.readOnly : false}
                                    readOnly={isH5Target ? loan.readOnly : false}
                                    onBlur={onInputBlur(loan, index)}
                                    onFocus={onFocus(index)}
                                    onInput={handleInputChange(loan, index)}
                                    value={`${
                                        loan.value !== 0
                                            ? (loan.ratio ? loan.ratio * loan.value : loan.value) || ''
                                            : focus[index]
                                              ? ''
                                              : 0
                                    }`}
                                />
                            )}
                            <View className="shrink-0">
                                {loan.unit === 'arrowright' ? (
                                    <Image className="size-2.5" src={RIGHT_ARROW} />
                                ) : (
                                    <Text className="text-base text-[rgba(151,155,158,1)]" style={loan.unitStyle}>
                                        {loan.unit}
                                    </Text>
                                )}
                            </View>
                        </View>
                        <Text className="absolute bottom-0 h-px w-full bg-[#E7EBEE]" />
                    </View>
                )
            })}
        </View>
    )
}
