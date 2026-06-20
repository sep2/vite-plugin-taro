/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:38:41
 * @Last Modified by: qiuz
 */

import clsx from 'clsx'
import { ScrollView } from 'vite-plugin-taro/components'

function TaroKeyboardAwareScrollView(props: any) {
    const { className = '', children } = props
    return (
        <ScrollView scrollY className={clsx('flex-1 overflow-hidden', className)}>
            {children}
        </ScrollView>
    )
}

export default TaroKeyboardAwareScrollView
