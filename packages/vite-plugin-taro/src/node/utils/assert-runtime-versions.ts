import { rolldownVersion, version as viteVersion } from 'vite'
import { packageRequire } from './packages.ts'

type VptPackageJson = Readonly<{
    dependencies: Readonly<{ rolldown: string }>
    peerDependencies: Readonly<{ vite: string }>
}>

const packageJson = packageRequire('vite-plugin-taro/package.json') as VptPackageJson
const requiredViteVersion = packageJson.peerDependencies.vite
const requiredRolldownVersion = packageJson.dependencies.rolldown

/** Verifies that Vite uses the versions pinned by VPT. */
export function assertRuntimeVersions(): void {
    assertRuntimeVersionValues(viteVersion, rolldownVersion)
}

export function assertRuntimeVersionValues(actualViteVersion: string, actualRolldownVersion: string): void {
    if (actualViteVersion !== requiredViteVersion) {
        throw new Error(`vpt requires vite@${requiredViteVersion}, but found vite@${actualViteVersion}.`)
    }

    if (actualRolldownVersion !== requiredRolldownVersion) {
        throw new Error(
            `vpt requires rolldown@${requiredRolldownVersion}, but found rolldown@${actualRolldownVersion}.`
        )
    }
}
