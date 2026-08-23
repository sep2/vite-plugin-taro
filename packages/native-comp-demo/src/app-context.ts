import { createContext } from 'react'

type AppContextValue = Readonly<{
    effectReady: boolean
    incrementShell: () => void
    incrementWrap: () => void
    wrapCount: number
}>

export const AppContext = createContext<AppContextValue>({
    effectReady: false,
    incrementShell: () => undefined,
    incrementWrap: () => undefined,
    wrapCount: -1
})
