import Taro from 'virtual:taro/api'
import { Button, View } from 'virtual:taro/components'
import { lazy, Suspense, useState } from 'react'
import PageFixture from '../../components/page-fixture.tsx'
import './red.css'

const LazyCard = lazy(() => import('../../components/lazy-card.tsx'))

export default function Red() {
    // Keep the lazy subtree mounted after loading so its counter can detect CSS-HMR remounts.
    const [showLazy, setShowLazy] = useState(false)

    return (
        <PageFixture name="red">
            <View className="leak-probe red-only">Red-only selector: this block must be red.</View>
            <View id="red-leak-probe" className="leak-probe blue-only">
                Blue-only selector: this block must stay gray, even after visiting Blue.
            </View>
            <Button id="red-load-lazy" className="demo-button" disabled={showLazy} onClick={() => setShowLazy(true)}>
                Load lazy card
            </Button>
            {showLazy ? (
                <Suspense fallback={<View>Loading lazy card...</View>}>
                    <LazyCard />
                </Suspense>
            ) : null}
            <Button
                id="red-open-blue"
                className="demo-button"
                onClick={() => {
                    void Taro.navigateTo({ url: '/pages/blue/blue' })
                }}
            >
                Open Blue page (retain Red)
            </Button>
        </PageFixture>
    )
}
