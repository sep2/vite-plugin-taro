/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:36:13
 * @Last Modified by: qiuz
 */

import clsx from 'clsx'
import type { FunctionComponent, PropsWithChildren } from 'react'
import { Image, View } from 'virtual:taro/components'
import { CLOSE_ICON } from './constant'
import type { TaroModalProps } from './type'

const TaroModal: FunctionComponent<PropsWithChildren<TaroModalProps>> = (props) => {
    const {
        visible = false,
        closable = false,
        maskClosable = true,
        className = '',
        onClose = () => {},
        children
    } = props

    if (!visible) {
        return null
    }

    const handleMaskClick = () => {
        if (maskClosable) {
            onClose()
        }
    }

    const stopPropagation = (event: any) => {
        event.stopPropagation()
    }

    return (
        <View
            className={clsx(
                'fixed bottom-0 left-0 right-0 top-0 z-1000 flex items-center justify-center bg-[rgba(0,0,0,0.5)]',
                className
            )}
            onClick={handleMaskClick}
        >
            <View className="relative w-4/5 overflow-hidden rounded-md bg-white" onClick={stopPropagation}>
                {closable && (
                    <Image src={CLOSE_ICON} onClick={onClose} className="absolute right-2.5 top-2.5 z-1 size-7" />
                )}
                <View className="px-3.75 pb-3.75 pt-5">{children}</View>
            </View>
        </View>
    )
}

export default TaroModal
