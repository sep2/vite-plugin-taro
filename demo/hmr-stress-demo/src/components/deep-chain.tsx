import { View } from 'virtual:taro/components'
import type { ReactNode } from 'react'

type DeepChainProps = Readonly<{
    children: ReactNode
    remainingDepth: number
}>

/** Creates a deliberately deep Fiber/native-node path without exponential growth. */
export default function DeepChain({ children, remainingDepth }: DeepChainProps) {
    if (remainingDepth === 0) {
        return <View className="deep-chain-core">{children}</View>
    }

    return (
        <View className={remainingDepth % 2 === 0 ? 'deep-chain-even' : 'deep-chain-odd'}>
            <DeepChain remainingDepth={remainingDepth - 1}>{children}</DeepChain>
        </View>
    )
}
