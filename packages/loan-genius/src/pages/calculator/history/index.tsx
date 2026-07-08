/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:40:47
 * @Last Modified by: qiuz
 */

import { ScrollView, Text, View } from 'virtual:taro/components'
import { NavigationBar, SafeAreaView } from '@components'
import { getStorageData } from '@utils'
import { useEffect, useState } from 'react'

export default function LoanGeniusHistory() {
    const [historyList, setHistoryList] = useState<any[]>([])

    useEffect(() => {
        let mounted = true

        const loadHistory = async () => {
            const data = (await getStorageData('LOAN_HISTORY')) || []
            if (mounted) {
                setHistoryList(data)
            }
        }

        void loadHistory()

        return () => {
            mounted = false
        }
    }, [])

    return (
        <SafeAreaView className="flex size-full flex-1 flex-col bg-white">
            <NavigationBar>
                <Text>计算历史</Text>
            </NavigationBar>
            <ScrollView scrollY enable-flex="true" className="flex flex-col flex-1 overflow-x-hidden overflow-y-scroll">
                {historyList.map((item: any, index: number) => {
                    return (
                        <View
                            // biome-ignore lint/suspicious/noArrayIndexKey: stored history rows have no stable id
                            key={index}
                            className="flex flex-row items-center justify-between border-0 border-b border-solid border-[#E7EBEE] py-5 px-5"
                        >
                            <View className="flex flex-col">
                                <Text className="font-pingfang-regular text-xs text-[rgba(71,75,78,1)]">
                                    公积金贷{item.accumulatFundYear}年
                                </Text>
                                <Text className="mt-2 font-pingfang-medium text-base text-[rgba(11,15,18,1)]">
                                    {item.accumulatTotalPirce}万
                                </Text>
                            </View>
                            <View className="flex flex-col">
                                <Text className="font-pingfang-regular text-xs text-[rgba(71,75,78,1)]">
                                    商业贷{item.commerceLoanYear}年
                                </Text>
                                <Text className="mt-2 font-pingfang-medium text-base text-[rgba(11,15,18,1)]">
                                    {item.commerceTotalPirce}万
                                </Text>
                            </View>
                            <View className="flex flex-col">
                                <Text className="font-pingfang-regular text-xs text-[rgba(71,75,78,1)]">
                                    {item.payMonthStr}
                                </Text>
                                <Text className="mt-2 font-pingfang-medium text-base text-[rgba(11,15,18,1)]">
                                    {item.firstPay}元
                                </Text>
                            </View>
                        </View>
                    )
                })}
            </ScrollView>
        </SafeAreaView>
    )
}
