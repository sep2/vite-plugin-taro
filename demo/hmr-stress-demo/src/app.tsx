import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
import type { PropsWithChildren } from 'react'
import './app.css'
import { appOutletFirst, hmrMarker } from './components/hmr-marker.ts'

function App({ children }: PropsWithChildren) {
    Taro.useLaunch(() => {
        console.log('[hmr-stress] launched')
    })

    const outletBranch = (
        <AppProjectionDepth key="page-outlet" depth={16}>
            {children}
        </AppProjectionDepth>
    )
    const decorationBranch = <DecorativeAppDepth key="decoration" depth={16} />
    const appBranches = appOutletFirst ? [outletBranch, decorationBranch] : [decorationBranch, outletBranch]

    return (
        <View className="app-projection-root">
            <Text id="app-hmr-status" className="app-projection-marker">{`App marker: ${hmrMarker}`}</Text>
            <Text id="app-outlet-status" className="app-projection-marker">
                {`App outlet: ${appOutletFirst ? 'first' : 'last'}`}
            </Text>
            {appBranches}
        </View>
    )
}

/** Forces the Page outlet across Taro's depth-reset component boundary. */
function AppProjectionDepth({ children, depth }: PropsWithChildren<{ depth: number }>) {
    if (depth === 0) return children
    return (
        <View className="app-projection-depth">
            <AppProjectionDepth depth={depth - 1}>{children}</AppProjectionDepth>
        </View>
    )
}

/** Creates a second deep App branch that must not receive the Page slot. */
function DecorativeAppDepth({ depth }: { depth: number }) {
    if (depth === 0) return <Text className="app-projection-decoration">App projection branch</Text>
    return (
        <View className="app-projection-decoration-depth">
            <DecorativeAppDepth depth={depth - 1} />
        </View>
    )
}

export default App
