declare module 'systemjs/dist/s.js' {
    global {
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
                /** Creates the import.meta context supplied to a registration declaration. */
                createContext(parentId: string): Meta

                /** Resolves, links, and evaluates through the normal asynchronous SystemJS pipeline. */
                import(id: string, parentId?: string): Promise<Module>

                /**
                 * Uses the same registry and evaluator but requires every unresolved registration and execute function in
                 * the static closure to complete synchronously. An asynchronous phase throws without rollback and must be
                 * treated as a fatal placement invariant violation for the current runtime heap.
                 */
                importSync(id: string, parentId?: string): Module
                instantiate(id: string, parentId?: string): Registration | PromiseLike<Registration>
                resolve(specifier: string, parentId?: string): string
            }
        }
    }
}
