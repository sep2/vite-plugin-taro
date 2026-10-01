import { findPackageJSON } from 'node:module'
import { type Logger, type Plugin, rolldownVersion, version as viteVersion } from 'vite'
import { packageRequire } from '../../utils/packages.ts'

const dependencyNames = ['vite', 'rolldown', 'vite-plugin-taro-runtime'] as const

type DependencyVersions = Readonly<Record<(typeof dependencyNames)[number], string>>
type VptPackageJson = Readonly<{
    version: string
    dependencies: Readonly<{ rolldown: string }>
    peerDependencies: Readonly<{ vite: string }>
}>

const packageJson = packageRequire('vite-plugin-taro/package.json') as VptPackageJson
// Bare-package metadata resolution also works for older runtimes that do not export package.json.
const runtimePackageJson = packageRequire(findPackageJSON('vite-plugin-taro-runtime', import.meta.url)!) as Readonly<{
    version: string
}>
const testedVersions: DependencyVersions = {
    vite: packageJson.peerDependencies.vite,
    rolldown: packageJson.dependencies.rolldown,
    // VPT and its runtime share a fixed release group; workspace:* is not a version to compare against.
    'vite-plugin-taro-runtime': packageJson.version
}

/** Reports untested dependency versions through Vite's configured logger without blocking startup. */
export function createDepsPlugin(): Plugin {
    return {
        name: 'vpt:deps',
        configResolved({ logger }) {
            warnDependencyVersions(
                {
                    vite: viteVersion,
                    rolldown: rolldownVersion,
                    'vite-plugin-taro-runtime': runtimePackageJson.version
                },
                logger
            )
        }
    }
}

/** Report every mismatch independently so one untested dependency cannot hide another. */
export function warnDependencyVersions(actualVersions: DependencyVersions, logger: Pick<Logger, 'warn'>): void {
    for (const dependency of dependencyNames) {
        const testedVersion = testedVersions[dependency]
        const actualVersion = actualVersions[dependency]
        if (actualVersion !== testedVersion) {
            logger.warn(
                `[vpt] Requires ${dependency}@${testedVersion}, but found ${dependency}@${actualVersion}. Compatibility is not guaranteed.`
            )
        }
    }
}
