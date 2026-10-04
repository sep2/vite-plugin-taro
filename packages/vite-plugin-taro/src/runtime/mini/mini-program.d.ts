/** Private graph binding; the Mini plugin supplies its source without loading the standalone discovery module. */
declare module '\0vpt:global-binding' {
    export const vptGlobal: typeof globalThis
}

/** Ordinary route config consumed by the shared native Page shell. */
declare module '\0vpt:page-capsule' {
    const config: ReturnType<typeof import('./capsule/create-page-config.ts').createPageConfig>
    export default config
}

/** Platform constructor selected by the Mini runtime contract. */
declare module 'vpt:mini-page-constructor' {
    const Page: typeof import('../mini/native/mini-page-constructor.ts').default
    export default Page
}

/** Native routing table generated from finalized chunk paths rather than bundled as a source module. */
declare module '\0vpt:mini-transport' {
    export const transport: (moduleId: string) => System.Registration | PromiseLike<System.Registration>
}

/** SystemJS loader installed on the language global before any native shell imports a capsule. */
declare var System: System.Loader

/** Minimal mounted Page surface used by the shared App-data scheduler. */
type MiniProgramPage = {
    setData(data: Readonly<Record<string, unknown>>, callback?: () => void): void
}

/** Returns every mounted native Page in stack order. */
declare function getCurrentPages(): MiniProgramPage[]

/** Registers the native Mini Program application. */
declare function App(options: object): void

/** Registers a native Mini Program page. */
declare function Page(options: object): void

/** Registers a native Mini Program component. */
declare function Component(options: object): void
