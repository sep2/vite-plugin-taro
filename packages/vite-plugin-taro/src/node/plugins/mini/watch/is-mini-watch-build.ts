import type { ConfigEnv, UserConfig } from 'vite'

/** Selects watch builds that write a physical Mini Program project. */
export function isMiniWatchBuild({ build, command }: Pick<UserConfig, 'build'> & Pick<ConfigEnv, 'command'>): boolean {
    return command === 'build' && Boolean(build?.watch) && build?.write !== false && !build?.watch?.skipWrite
}
