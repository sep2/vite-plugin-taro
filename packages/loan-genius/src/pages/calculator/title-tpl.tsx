/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date: 2020-06-28 13:47:24
 * @Last Modified by: qiuz
 */

import clsx from 'clsx'
import type { FunctionComponent } from 'react'
import { Text, View } from 'vite-plugin-taro/components'

interface TitleTplProps {
    title: string
    data: any[]
    activeIndex: number
    onWayClick: (...args: any) => void
}

export const TitleTpl: FunctionComponent<TitleTplProps> = (props) => {
    const { title = '', data = [], onWayClick = () => {}, activeIndex = 0 } = props

    const handleClick = (item: any, index: number) => () => {
        onWayClick(item, index)
    }

    return (
        <View className="mb-3.75 flex flex-row items-baseline justify-between pt-6.25">
            <Text className="text-xl font-bold text-[rgba(11,15,18,1)]">{title}</Text>
            <View className="flex flex-row items-end">
                {data.map((item: any, index: number) => {
                    return (
                        <View
                            key={item.id}
                            onClick={handleClick(item, index)}
                            className="relative ml-5 flex items-center"
                        >
                            <Text
                                className={clsx(
                                    'text-sm font-bold text-[rgba(11,15,18,1)]',
                                    activeIndex === item.index && 'text-[#1FB081]'
                                )}
                            >
                                {item.name}
                            </Text>
                            {activeIndex === item.index && (
                                <View className="absolute -bottom-1.25 left-0 right-0 mx-auto flex h-0.5 w-3.75 self-center bg-[rgba(35,201,147,1)]" />
                            )}
                        </View>
                    )
                })}
            </View>
        </View>
    )
}
