/** Selects Vite's client environment, which owns application entries and target output. */
export function isClientEnvironment(environment: Readonly<{ name: string }>): boolean {
    return environment.name === 'client'
}
