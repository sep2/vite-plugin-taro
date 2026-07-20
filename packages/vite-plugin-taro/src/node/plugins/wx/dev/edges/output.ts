import path from 'node:path'
import colors from 'picocolors'
import { firstValueFrom, ReplaySubject, take } from 'rxjs'
import type { ViteDevServer } from 'vite'
import type { PatchProjection } from '../topology.ts'
import { hmrControlPath } from './control.ts'
import {
    hmrInfoFileName,
    hmrPatchesFileName,
    renderHmrInfo,
    renderHmrPatches,
    renderInitialHmrPatches,
    writeHmrFile
} from './files.ts'

/**
 * Owns physical development artifacts only.
 *
 * Complete output is written by the DevEngine. This edge materializes its App metadata and inert patches dependency,
 * then later overwrites only hmr/patches.js for ordinary HMR delivery.
 */
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
    writeBootstrap(build: Readonly<{ buildId: string }>): Promise<void>
    writePatches(projection: PatchProjection): Promise<void>
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
        async writeBootstrap(build): Promise<void> {
            const origin = await firstValueFrom(origins$.pipe(take(1)))
            const info = {
                buildId: build.buildId,
                endpoint: new URL(hmrControlPath, origin).href,
                token
            }
            await Promise.all([
                writeHmrFile(outDir, hmrInfoFileName, renderHmrInfo(info)),
                writeHmrFile(outDir, hmrPatchesFileName, renderInitialHmrPatches())
            ])
            if (!printed) {
                printed = true
                printDevToolsPath(server, outDir)
            }
        },
        async writePatches(projection): Promise<void> {
            await writeHmrFile(outDir, hmrPatchesFileName, renderHmrPatches(projection))
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
