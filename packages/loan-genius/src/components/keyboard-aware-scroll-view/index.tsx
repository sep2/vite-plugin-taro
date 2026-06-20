/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-10 23:38:41
 * @Last Modified by: qiuz
 */

import { ScrollView } from 'virtual:taro/components'
import clsx from 'clsx'

function TaroKeyboardAwareScrollView(props: any) {
    const { className = '', children } = props
    return (
        <ScrollView scrollY className={clsx('flex-1', className)}>
            {children}
        </ScrollView>
    )
}

export default TaroKeyboardAwareScrollView
