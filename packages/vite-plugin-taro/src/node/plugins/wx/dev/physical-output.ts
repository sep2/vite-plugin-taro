import path from 'node:path'
import colors from 'picocolors'
import { firstValueFrom, ReplaySubject, take } from 'rxjs'
import type { ViteDevServer } from 'vite'
import { hmrControlPath } from './control-channel.ts'
import {
    hmrInfoFileName,
    hmrUpdateFileName,
    renderHmrInfo,
    renderHmrUpdate,
    renderInitialHmrUpdate,
    writeHmrFile
} from './hmr-files.ts'
import type { BuildEpoch, UpdatePublication } from './topology/types.ts'

/** Physical HMR-file edge. The command dispatcher serializes it with complete DevEngine output. */
export function createPhysicalOutputEdge({
    outDir,
    server,
    token
}: {
    outDir: string
    server: ViteDevServer
    token: string
}): Readonly<{
    close(): void
    writeBootstrap(epoch: BuildEpoch): Promise<void>
    writeUpdate(publication: UpdatePublication): Promise<void>
}> {
    const origins$ = new ReplaySubject<string>(1)
    const httpServer = server.httpServer
    if (!httpServer) {
        throw new Error('Vite did not create an HTTP server for WX development.')
    }

    let printed = false
    const publishOrigin = (): void => {
        const origin = server.resolvedUrls?.local[0]
        if (!origin) {
            throw new Error('Vite did not resolve a local development URL.')
        }
        origins$.next(origin)
    }

    if (httpServer.listening) {
        publishOrigin()
    } else {
        httpServer.once('listening', publishOrigin)
    }

    return {
        close(): void {
            httpServer.off('listening', publishOrigin)
            origins$.complete()
        },
        async writeBootstrap(epoch): Promise<void> {
            const origin = await firstValueFrom(origins$.pipe(take(1)))
            const info = {
                buildId: epoch.buildId,
                endpoint: new URL(hmrControlPath, origin).href,
                token
            }
            await Promise.all([
                writeHmrFile(outDir, hmrInfoFileName, renderHmrInfo(info)),
                writeHmrFile(outDir, hmrUpdateFileName, renderInitialHmrUpdate())
            ])

            if (!printed) {
                printed = true
                printDevToolsPath(server, outDir)
            }
        },
        async writeUpdate(publication): Promise<void> {
            await writeHmrFile(outDir, hmrUpdateFileName, renderHmrUpdate(publication))
        }
    }
}

function printDevToolsPath(server: ViteDevServer, outDir: string): void {
    const relativeOutDir = path.relative(server.config.root, outDir).split(path.sep).join('/')
    const devToolsPath = relativeOutDir ? `./${relativeOutDir}` : '.'
    server.config.logger.info(
        `  ${colors.green('➜')}  ${colors.bold(colors.cyan('WeChat DevTools:'))} ${colors.cyan(devToolsPath)}`
    )
}
