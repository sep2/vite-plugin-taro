import Taro from 'virtual:taro/api'
import { Button, CustomWrapper, Text, View } from 'virtual:taro/components'
import type { PropsWithChildren } from 'react'
import RecursiveProbe from './recursive-probe.tsx'
import SharedCard from './shared-card.tsx'
import StateCounter from './state-counter.tsx'

type PageFixtureProps = PropsWithChildren<{ name: 'red' | 'blue' }>

export default function PageFixture({ name, children }: PageFixtureProps) {
    return (
        <View className="section">
            <View id={`${name}-heading`} className="page-heading">
                {name.toUpperCase()} page
            </View>
            <View id={`${name}-collision`} className="collision-card">
                <Text>Same .collision-card selector, different page color.</Text>
            </View>
            <StateCounter id={`${name}-counter`} label={`${name} page counter`} />
            <SharedCard />
            <CustomWrapper id={`${name}-wrapper`}>
                <View className="collision-card">
                    <Text>CustomWrapper: this card must match the page color.</Text>
                    <StateCounter id={`${name}-wrapper-counter`} label="Wrapper counter" />
                </View>
            </CustomWrapper>
            <RecursiveProbe depth={20} id={`${name}-deep`} />
            {children}
            <Button
                id={`${name}-open-plain`}
                className="demo-button"
                onClick={() => {
                    void Taro.navigateTo({ url: '/pages/plain/plain' })
                }}
            >
                Open Plain page (no page CSS)
            </Button>
        </View>
    )
}
