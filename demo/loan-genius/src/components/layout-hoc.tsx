import { View } from 'virtual:taro/components'
import type { ComponentType } from 'react'
import SafeAreaView from './safe-area-view'

type PageLayout = Readonly<{
    className: string
    safeArea: boolean
}>

class LayoutHoc {
    HOC(Page: ComponentType, layout: PageLayout) {
        const Container = layout.safeArea ? SafeAreaView : View

        // A named function keeps the method-created default export recognizable to React Refresh after minification.
        return function TopViewPage() {
            return (
                <Container className={layout.className}>
                    <Page />
                </Container>
            )
        }
    }
}

const layoutHoc = new LayoutHoc()
export default layoutHoc
