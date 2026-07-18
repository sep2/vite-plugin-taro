/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:41:04
 * @Last Modified by: qiuz
 */

import Taro from 'virtual:taro/api'
import { Image, ScrollView, Text, View } from 'virtual:taro/components'
import { NavigationBar, SafeAreaView } from '@components'
import { getGlobalData, getStorageData } from '@utils'
import clsx from 'clsx'
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { CHECK_RIDIO, CHECK_RIDIO_Y, MONTY_DATA, MONTY_TITLE } from '../constants'

const HelloLazy = React.lazy(() => import('../../../components/hello.tsx'))

export default function LoanGeniusMonthlyPayments() {
    const pageRef = useRef(1)
    const totalRef = useRef(0)
    const [state, setState] = useState<any>({
        checked: 'equalInterest',
        equalInterest: {},
        equalPrincipal: {},
        equalInterestMonthList: [],
        interestList: [],
        assessInfo: null,
        equalPrincipalMonthList: [],
        principalList: [],
        tip: '',
        loanAmount: 0
    })

    const init = useCallback((data: any = {}) => {
        try {
            const { equalInterestMonthList = [], equalPrincipalMonthList = [] } = data
            totalRef.current = Math.floor(equalInterestMonthList.length / 10)
            setState((currentState: any) => ({
                ...currentState,
                interestList: equalInterestMonthList.slice(0, 10),
                principalList: equalPrincipalMonthList.slice(0, 10),
                ...data
            }))
        } catch (error) {
            console.log(error)
        }
    }, [])

    useEffect(() => {
        let mounted = true

        const loadData = async () => {
            const params = getGlobalData('COMPUTE_RESULT') || {}
            init(params)
            const { type = 'equalInterest' } = (await getStorageData('USER_LOAN_WAY')) || {}
            if (mounted) {
                setState((currentState: any) => ({
                    ...currentState,
                    checked: type
                }))
            }
        }

        void loadData()

        return () => {
            mounted = false
        }
    }, [init])

    const selectFirst = (data: any) => async () => {
        await Taro.setStorage({ key: 'USER_LOAN_WAY', data })
        setState((currentState: any) => ({
            ...currentState,
            checked: data.type
        }))
        Taro.showToast({
            title: `月供将以${data.title}的形式展示`,
            icon: 'none'
        })
    }

    const onScrollToLower = () => {
        if (pageRef.current >= totalRef.current) return
        pageRef.current++
        setState((currentState: any) => ({
            ...currentState,
            interestList: currentState.equalInterestMonthList.slice(0, pageRef.current * 10),
            principalList: currentState.equalPrincipalMonthList.slice(0, pageRef.current * 10)
        }))
    }

    const { checked, interestList, principalList, loanAmount, tip } = state

    return (
        <SafeAreaView className="box-border flex h-screen w-full flex-1 flex-col overflow-hidden bg-white">
            <NavigationBar>
                <Text>对比月供</Text>
            </NavigationBar>
            <ScrollView
                className="flex flex-col flex-1 overflow-x-hidden overflow-y-scroll"
                scrollY
                enable-flex="true"
                enableBackToTop
                onScrollToLower={onScrollToLower}
            >
                <View className="px-5">
                    <View className="mt-5.5 flex flex-row flex-nowrap items-center">
                        <Text className="font-pingfang-medium text-xl text-[rgba(11,15,18,1)]">贷款总额</Text>

                        <Suspense fallback={<View>loading...</View>}>
                            <HelloLazy />
                        </Suspense>

                        <Text className="mx-1.25 font-avenir-black text-22 font-bold text-[rgba(11,15,18,1)]">
                            {loanAmount}
                        </Text>
                        <Text className="font-pingfang-medium text-xl text-[rgba(11,15,18,1)]">万</Text>
                    </View>
                    <Text className="mt-1.25 flex font-pingfang-regular text-sm font-normal text-[rgba(71,75,78,1)]">
                        {tip}
                    </Text>

                    <View className="mt-5 box-border flex w-full flex-row justify-around rounded-xs border border-solid border-[rgba(230,230,230,1)] bg-white px-6.75 pb-7.5 pt-7">
                        {MONTY_DATA.map((item: any) => {
                            return (
                                <View key={item.type}>
                                    <Text className="font-pingfang-medium text-lg text-[rgba(11,15,18,1)]">
                                        {item.title}
                                    </Text>
                                    <View className="mt-7.5 flex flex-col">
                                        <Text className="font-pingfang-regular text-xs font-normal text-[rgba(71,75,78,1)]">
                                            {MONTY_TITLE[item.type]}
                                        </Text>
                                        <Text className="mt-1.25 font-avenir-black text-xl text-[rgba(11,15,18,1)]">
                                            {state[item.type].payMonth}
                                        </Text>
                                    </View>
                                    <View className="mt-7.5 flex flex-col">
                                        <Text className="font-pingfang-regular text-xs font-normal text-[rgba(71,75,78,1)]">
                                            利息总额（万元）
                                        </Text>
                                        <Text className="mt-1.25 font-avenir-black text-xl text-[rgba(11,15,18,1)]">
                                            {state[item.type].totalInterest}
                                        </Text>
                                    </View>
                                    <View className="mt-7.5 flex flex-col">
                                        <Text className="font-pingfang-regular text-xs font-normal text-[rgba(71,75,78,1)]">
                                            特点
                                        </Text>
                                        <Text className="mt-2.25 font-pingfang-regular text-sm text-[rgba(11,15,18,1)]">
                                            {item.type !== 'equalPrincipal'
                                                ? '每月月供稳定'
                                                : `每月递减${state[item.type].monthDecline}元`}
                                        </Text>
                                    </View>
                                    <View className="mt-7.5 flex flex-row items-center" onClick={selectFirst(item)}>
                                        <Image
                                            className="mr-1.25 size-3"
                                            src={item.type === checked ? CHECK_RIDIO_Y : CHECK_RIDIO}
                                        />
                                        <Text className="font-pingfang-regular text-sm text-[rgba(11,15,18,1)]">
                                            优先看{item.title}
                                        </Text>
                                    </View>
                                </View>
                            )
                        })}
                    </View>

                    <View className="mb-12.5">
                        <Text className="mb-3.75 mt-7.5 flex font-pingfang-medium text-xl text-[rgba(11,15,18,1)]">
                            还款细则
                        </Text>
                        <View className="flex h-9.5 flex-row items-center justify-between bg-[#EFF1F1]">
                            <Text className="flex flex-1 justify-center text-center font-pingfang-medium text-xs font-bold text-[rgba(11,15,18,1)]" />
                            <Text className="flex flex-1 justify-center text-center font-pingfang-medium text-xs font-bold text-[rgba(11,15,18,1)]">
                                等额本息
                            </Text>
                            <Text className="flex flex-1 justify-center text-center font-pingfang-medium text-xs font-bold text-[rgba(11,15,18,1)]">
                                等额本金
                            </Text>
                        </View>
                        {interestList.map((item: any, index: number) => {
                            return (
                                <View
                                    // biome-ignore lint/suspicious/noArrayIndexKey: repayment rows are static and only identified by month position
                                    key={index + ''}
                                    className={clsx(
                                        'flex h-9.5 flex-row items-center justify-between',
                                        index % 2 === 0 ? 'bg-white' : 'bg-[#FCFBFC]'
                                    )}
                                >
                                    <Text className="flex flex-1 justify-center text-center font-pingfang-medium text-xs font-bold text-[rgba(11,15,18,1)]">
                                        第{index + 1}个月
                                    </Text>
                                    <Text className="flex flex-1 justify-center text-center font-pingfang-regular text-xs text-[rgba(11,15,18,1)]">
                                        ￥{item}
                                    </Text>
                                    <Text className="flex flex-1 justify-center text-center font-pingfang-regular text-xs text-[rgba(11,15,18,1)]">
                                        ￥{principalList[index]}
                                    </Text>
                                </View>
                            )
                        })}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    )
}
