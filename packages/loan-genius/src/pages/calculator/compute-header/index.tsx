/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-01 13:55:57
 * @Last Modified by: qiuz
 */

import { BoxShadow, LinearGradient } from '@components'
import { formatFloat } from '@utils'
import { type FunctionComponent, memo } from 'react'
import { Image, Text, View } from 'vite-plugin-taro/components'
import { GRADIENT_BG, PERCENT_ICON, RIGHT_ARROW, RIGHT_ARROW_WHITE } from '../constants'

interface LoanGeniusHeaderProps {
    way: number
    houseTotal: number
    userLoanWay: string
    tip: string
    downPayRate: number
    equalInterestPayMonth: string
    equalPrincipalPayMonth: string
    goHistory: () => void
    goMonthlyPayments: () => void
}

const LoanGeniusHeader: FunctionComponent<LoanGeniusHeaderProps> = (props) => {
    const {
        way,
        houseTotal,
        tip,
        userLoanWay,
        downPayRate,
        equalInterestPayMonth,
        equalPrincipalPayMonth,
        goHistory,
        goMonthlyPayments
    } = props

    return (
        <View>
            <LinearGradient
                locations={[0, 0.75, 1]}
                src={GRADIENT_BG}
                colors={['#12BA83', '#12BA83', '#9AE7CD']}
                className="relative z-3 h-40 w-full"
                useColors
                color="linear-gradient(360deg,rgba(154,231,205,1) 0%, rgba(18,186,131,1) 20%, rgba(18,186,131,1) 100%)"
            >
                <Image src={PERCENT_ICON} className="absolute -bottom-2 right-0 -z-1 h-full w-26.25" />
                <View className="flex w-full flex-col px-5">
                    <View className="mt-5 flex flex-row items-center justify-between">
                        <View className="flex flex-row items-center">
                            <Text className="text-xl font-bold text-white">房屋总价</Text>
                            <Text
                                className="mx-1.25 text-22 font-bold text-white"
                                // 针对andriod文字偏下设置
                                style={{
                                    // @ts-expect-error
                                    includeFontPadding: false,
                                    textAlignVertical: 'center'
                                }}
                            >
                                {way === 1 ? houseTotal : '--'}
                            </Text>
                            <Text className="text-xl font-bold text-white">万</Text>
                        </View>
                        <View className="flex flex-row items-center" onClick={goHistory}>
                            <Text className="text-sm font-normal text-white">查看历史</Text>
                            <Image className="size-2.5" src={RIGHT_ARROW_WHITE} />
                        </View>
                    </View>
                    <Text className="mt-1.25 w-full text-sm font-normal leading-4.5 text-white">{tip}</Text>
                </View>
            </LinearGradient>
            <BoxShadow
                shadowColor="#E7EBEE"
                shadowOffset={{
                    width: 0,
                    height: 2
                }}
                shadowOpacity={1}
                shadowRadius={3.84}
                className="relative z-10 mx-auto -mt-14 box-border flex h-28 w-9/10 flex-row items-start justify-between rounded-xs bg-white px-7.5 py-6.25"
                elevation={5}
                boxShadow="0px 1px 5px 0px #E7EBEE"
            >
                <View className="flex flex-col">
                    <Text className="mb-1.5 text-xs font-normal text-[rgba(11,15,18,1)]">首付款</Text>
                    <View className="-mt-2.5 flex h-6 flex-row items-baseline">
                        <Text
                            className="text-2xl font-bold text-[rgba(11,15,18,1)]"
                            numberOfLines={1}
                            style={{
                                // @ts-expect-error
                                includeFontPadding: false,
                                textAlignVertical: 'center'
                            }}
                        >
                            {way === 1 ? Math.floor(formatFloat(houseTotal * downPayRate || 0, 1) as number) : '--'}
                            {way === 1 && <Text className="h-full text-xs text-[rgba(11,15,18,1)]">万</Text>}
                        </Text>
                    </View>
                </View>
                <View className="flex flex-col items-end">
                    <Text className="mb-1.5 text-xs font-normal text-[rgba(11,15,18,1)]">
                        {userLoanWay === '等额本息' ? '每月应还(等额本息)' : '首月应还(等额本金)'}
                    </Text>
                    <View className="-mt-2.5 flex h-6 flex-row items-baseline">
                        <Text
                            className="text-2xl font-bold text-[rgba(11,15,18,1)]"
                            style={{
                                // @ts-expect-error
                                includeFontPadding: false,
                                textAlignVertical: 'bottom'
                            }}
                        >
                            {userLoanWay === '等额本息' ? equalInterestPayMonth : equalPrincipalPayMonth}
                            <Text className="h-full text-xs text-[rgba(11,15,18,1)]">元</Text>
                        </Text>
                    </View>
                    <View className="mt-2.5 flex flex-row items-center" onClick={goMonthlyPayments}>
                        <Text className="text-xs font-normal text-[rgba(71,75,78,1)]">
                            对比{userLoanWay === '等额本息' ? '等额本金' : '等额本息'}
                            月供
                        </Text>
                        <Image className="size-2.5" src={RIGHT_ARROW} />
                    </View>
                </View>
            </BoxShadow>
        </View>
    )
}

export default memo(LoanGeniusHeader)
