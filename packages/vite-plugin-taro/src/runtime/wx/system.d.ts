declare module 'systemjs/s.js' {
    global {
        var System: System.Loader

        namespace System {
            /** A live SystemJS module namespace. */
            type Module = Readonly<Record<string, unknown>>

            /** Publishes bindings from a System.register declaration. */
            type Export = (name: string | Readonly<Record<string, unknown>>, value?: unknown) => unknown

            /** Receives live updates from a dependency namespace. */
            type Setter = (module: Module) => void

            /** The linker callbacks and evaluator returned by a module declaration. */
            interface Declaration {
                setters?: readonly (Setter | undefined)[]
                execute?: () => void | PromiseLike<void>
            }

            /** The import.meta object supplied to a module declaration. */
            interface Meta {
                readonly url: string
                readonly resolve: (specifier: string, parentId?: string) => Promise<string>
                readonly [name: string]: unknown
            }

            /** Runtime operations supplied to a module declaration. */
            interface Context {
                readonly import: (specifier: string) => Promise<Module>
                readonly meta: Meta
            }

            /** Declares a module without executing it. */
            type Declare = (exportBinding: Export, context: Context) => Declaration

            /** The registration captured from one System.register call. */
            type Registration = readonly [dependencies: readonly string[], declare: Declare]

            /** A hookable SystemJS loader instance. */
            interface Loader {
                import(id: string, parentId?: string): Promise<Module>
                instantiate(id: string, parentId?: string): Registration | PromiseLike<Registration>
                resolve(specifier: string, parentId?: string): string
            }
        }
    }
}
