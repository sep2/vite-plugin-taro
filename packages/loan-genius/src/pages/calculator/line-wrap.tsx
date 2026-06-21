/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date: 2020-06-28 13:47:24
 * @Last Modified by: qiuz
 * @Last Modified time: 2021-01-04 22:04:16
 */

import { Modal, Pciker } from '@components'
import { Component } from 'react'
import { Button, Image, Input, Text, View } from 'virtual:taro/components'
import { RIGHT_ARROW } from './constants'

interface LineWrapProps {
    type: string[]
    data: any[]
    onChangePicker: (...args: any) => void
    onInputChange: (...args: any) => void
    onBlur: (...args: any) => void
}

export class LineWrap extends Component<LineWrapProps, any> {
    static defaultProps = {
        data: [],
        type: [],
        onChangePicker: () => {},
        onInputChange: () => {},
        onBlur: () => {}
    }

    constructor(props: LineWrapProps) {
        super(props)
        this.state = {
            visible: false,
            explainData: {},
            focus: []
        }
    }

    handlePickerChange = (data: any, index: number) => (value: any) => {
        const valueMap = data.range.filter((item: any) => item.value === Number(value[0]))
        this.props.onChangePicker(data, valueMap[0] || data.range[0], index)
    }

    handleInputChange = (item: any, index: number) => (e: any) => {
        let { value } = e.detail
        if (item.inputType === 'number' || item.keyboardType === 'number-pad') {
            value = parseInt(value, 10)
        }
        this.props.onInputChange(item, value, index)
    }

    showExplain = (data: any) => () => {
        this.setState({
            explainData: data,
            visible: true
        })
    }

    closeModal = () => {
        this.setState({
            visible: false
        })
    }

    onMoreClick = (_url: string) => () => {}

    onFocus = (index: number) => () => {
        const { focus } = this.state
        focus[index] = true
        this.setState({
            focus
        })
    }

    onBlur = (loan: any, index: number) => (e: any) => {
        const { focus } = this.state
        focus[index] = false
        this.setState(
            {
                focus
            },
            () => {
                loan.blurCheck && this.props.onBlur(e)
            }
        )
    }
    render() {
        const { data, type } = this.props
        const { visible, explainData, focus } = this.state
        const list = data.filter((_item) => type.indexOf(_item && _item.renderType) > -1)
        return (
            <View>
                {explainData.title && (
                    <Modal
                        className="pt-2.5"
                        visible={visible}
                        closable
                        transparent
                        animationType="none"
                        onClose={this.closeModal}
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
                                onClick={this.closeModal}
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
                                    <View onClick={this.showExplain(loan.explain)}>
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
                                            onChange={this.handlePickerChange(loan, index)}
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
                                        disabled={!IS_H5 ? loan.readOnly : false}
                                        readOnly={IS_H5 ? loan.readOnly : false}
                                        onBlur={this.onBlur(loan, index)}
                                        onFocus={this.onFocus(index)}
                                        onInput={this.handleInputChange(loan, index)}
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
}
