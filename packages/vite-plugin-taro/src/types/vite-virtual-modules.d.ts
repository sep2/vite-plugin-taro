declare module '/@react-refresh' {
    export type RefreshResult = {
        updatedFamilies: Set<unknown>
        staleFamilies: Set<unknown>
    }

    export function register(type: unknown, id: string): void
    export function registerExportsForReactRefresh(filename: string, moduleExports: Record<string, unknown>): void
    export function validateRefreshBoundaryAndEnqueueUpdate(
        id: string,
        previousExports: Record<string, unknown>,
        nextExports: Record<string, unknown>
    ): string | undefined

    const runtime: {
        injectIntoGlobalHook(globalObject: typeof globalThis): void
    }
    export default runtime
}
