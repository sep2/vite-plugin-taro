import { type Logger, type Plugin, rolldownVersion, version as viteVersion } from 'vite'
import { packageRequire } from '../../utils/packages.ts'

type VptPackageJson = Readonly<{
    dependencies: Readonly<{ rolldown: string }>
    peerDependencies: Readonly<{ vite: string }>
}>

const packageJson = packageRequire('vite-plugin-taro/package.json') as VptPackageJson
const testedViteVersion = packageJson.peerDependencies.vite
const testedRolldownVersion = packageJson.dependencies.rolldown

/** Reports untested runtime versions through Vite's configured logger without blocking startup. */
export function createDepsPlugin(): Plugin {
    return {
        name: 'vpt:deps',
        configResolved({ logger }) {
            warnDependencyVersions(viteVersion, rolldownVersion, logger)
        }
    }
}

export function warnDependencyVersions(
    actualViteVersion: string,
    actualRolldownVersion: string,
    logger: Pick<Logger, 'warn'>
): void {
    if (actualViteVersion !== testedViteVersion) {
        logger.warn(
            `[vpt] Tested with vite@${testedViteVersion}, but found vite@${actualViteVersion}. Compatibility is not guaranteed.`
        )
    }

    if (actualRolldownVersion !== testedRolldownVersion) {
        logger.warn(
            `[vpt] Tested with rolldown@${testedRolldownVersion}, but found rolldown@${actualRolldownVersion}. Compatibility is not guaranteed.`
        )
    }
}
