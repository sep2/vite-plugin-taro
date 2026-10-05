/** Private graph binding; the Mini plugin supplies its source without loading the standalone discovery module. */
declare module '\0vpt:global-binding' {
    export const vptGlobal: typeof globalThis
}

/** Final native route config, with an object or data factory selected by its capsule. */
declare module '\0vpt:page-capsule' {
    const config: typeof import('./capsule/page.ts').default
    export default config
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
