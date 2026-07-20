import path from 'node:path'
import colors from 'picocolors'
import { firstValueFrom, ReplaySubject, type Subject, take } from 'rxjs'
import type { ViteDevServer } from 'vite'
import type { Build, WxHostFact } from '../topology.ts'
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
 * Owns physical development artifacts and publishes patch-write result facts itself.
 *
 * Complete output comes from DevEngine. DevHost combines that output with `writeBootstrap()` into the single full-build
 * operation; ordinary patch delivery is self-contained here because its success/failure is a topology fact.
 */
export function createPhysicalOutputEdge({
    facts$,
    outDir,
    server,
    token
}: {
    facts$: Subject<WxHostFact>
    outDir: string
    server: ViteDevServer
    token: string
}): Readonly<{
    close(): void
    writeBootstrap(build: Readonly<{ buildId: string }>): Promise<void>
    writePatches(build: Build, fromVersion: number): Promise<void>
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
        async writePatches(build, fromVersion): Promise<void> {
            try {
                await writeHmrFile(outDir, hmrPatchesFileName, renderHmrPatches(build, fromVersion))
                facts$.next({
                    type: 'patches-written',
                    buildId: build.buildId,
                    fromVersion,
                    ok: true,
                    targetVersion: build.patches.length
                })
            } catch (error) {
                facts$.next({
                    type: 'patches-written',
                    buildId: build.buildId,
                    error,
                    fromVersion,
                    ok: false,
                    targetVersion: build.patches.length
                })
            }
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
