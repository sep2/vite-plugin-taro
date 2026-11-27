import path from 'node:path'
import type { Rolldown } from 'vite'
import type { MiniSubpackage } from '../mini-contract.ts'
import { toLogicalChunkId } from '../module/chunk-path.ts'
import { classifyMiniModule, miniBootstrapId, miniTransportOutputPath, pageLoaderFileName } from '../module/module.ts'
import type { PackageLocation } from '../placer/placement.ts'

/**
 * Emits the main transport and package-local page loaders in generateBundle, after placement and content-hash resolution.
 * Both use the package-neutral final filename as the SystemJS registration ID and the package-qualified filename
 * for the literal native require path. Preliminary hash placeholders must not escape into this late-generated file.
 *
 * Transport itself executes only as native CommonJS in common/vpt-transport.js, outside the bundled graph. Together
 * with bootstrap it publishes native namespaces to SystemJS without re-evaluating their module bodies.
 *
 * Do not generate this table in renderChunk: that hook runs before Rolldown's final minifier/code generator, which can rewrite
 * require.async("path") into require.async(`path`). TikTok (tt) misses these template-literal dependencies in its static scan,
 * causing "Can't find module" even when the referenced subpackage file exists. This is a dependency-discovery issue, not a
 * difference in JavaScript string values.
 *
 * Emit the finished CommonJS as an asset in generateBundle so Rolldown writes it without minifying or reprinting its quoted
 * paths. Fixed compact syntax and JSON-encoded IDs need no AST or quote-repair pass, while application chunks retain full
 * compression, mangling, and whitespace removal.
 */
export function createTransportOutput({
    bundle,
    subpackages,
    getPackageLocation
}: {
    bundle: Rolldown.OutputBundle
    subpackages: readonly MiniSubpackage[]
    getPackageLocation(chunk: Rolldown.OutputChunk): PackageLocation
}) {
    // Main transport accumulates only capsule and amphibious routes in deterministic bundle-key order.
    const mainCases: string[] = []
    // Each page package accumulates its synchronous cases during the same final-filename pass as the main transport.
    const pageCases = new Map(
        subpackages.filter((pkg) => pkg.pages.length > 0).map((pkg) => [pkg.root, [] as string[]] as const)
    )
    // Rolldown owns the final (possibly hashed) entry path imported by the package loaders.
    let bootstrapFileName: string | undefined

    for (const key of Object.keys(bundle).sort()) {
        const chunk = bundle[key]
        if (chunk.type !== 'chunk') {
            continue
        }
        if (chunk.facadeModuleId === miniBootstrapId) {
            bootstrapFileName = chunk.fileName
        }
        const kind = classifyMiniModule(chunk)
        if (kind === 'native') {
            continue
        }
        // Select the native loading API directly from typed package ownership; infrastructure must stay synchronous in main.
        const location = getPackageLocation(chunk)
        const asynchronous = location.kind === 'subpackage'
        if (kind === 'amphibious' && asynchronous) {
            throw new Error(`Amphibious module must be in the main package: ${chunk.fileName}`)
        }

        // Entries retain their declared filenames; only non-entry chunks gain a package prefix during placement.
        const logicalId = toLogicalChunkId(
            asynchronous && !chunk.isEntry ? chunk.fileName.slice(location.root.length + 1) : chunk.fileName
        )
        // Only native loading crosses the logical/physical boundary and receives the package-qualified path.
        const label = `case ${JSON.stringify(logicalId)}:return `
        if (location.kind === 'subpackage') {
            pageCases
                .get(location.root)
                ?.push(`${label}require(${quotedPath(pageLoaderFileName(location.root), chunk.fileName)});`)
        }
        const load = `${asynchronous ? 'require.async' : 'require'}(${quotedPath(miniTransportOutputPath, chunk.fileName)})`
        // Amphibious namespaces must be required lazily during registration execution, never while bootstrap imports transport.
        // Capsules already export registrations; bridging only native namespaces avoids eager bootstrap recursion.
        const registration = kind === 'amphibious' ? `amphibious(function(){return ${load}})` : load
        mainCases.push(`${label}${registration};`)
    }

    const loaders = Array.from(pageCases, ([root, cases]) => renderPageLoader(root, cases, bootstrapFileName))
    return [renderMainTransport(mainCases), ...loaders] as const
}

/** Emits the closed routing table used by the shared bootstrap. */
function renderMainTransport(cases: readonly string[]) {
    // Fixed syntax and JSON-encoded paths produce CommonJS shaped like:
    // function amphibious(load) {
    //     return [[], function(exportBinding) {
    //         return { execute() { exportBinding(load()) } }
    //     }]
    // }
    // exports.transport = function(moduleId) {
    //     switch (moduleId) {
    //         case 'app-capsule.js': return require('../app-capsule.js')
    //         case 'common/page.js': return require.async('../sub/p_account/common/page.js')
    //         case 'common/bootstrap.js': return amphibious(function() { return require('./bootstrap.js') })
    //         default: throw new Error('Unknown module: ' + moduleId)
    //     }
    // }
    // 'asset' means opaque output bytes, not a non-JavaScript file: the host still executes this .js as CommonJS.
    // A regular chunk belongs to the module/rendering pipeline. A prebuilt chunk bypasses it, but our Rolldown 1.2.8
    // bundled-dev test retained stale transport content at the same filename after lazy imports changed. Asset emission
    // updates changed source correctly; dev-host.integration.test.ts covers adding and removing lazy routes on rebuild.
    // Unlike this graph-dependent table, common/vpt-global.js can remain prebuilt because application edits do not change it.
    // The default branch rejects IDs absent from the closed output graph rather than attempting an undeclared native load.
    return {
        type: 'asset',
        fileName: miniTransportOutputPath,
        source: `"use strict";function amphibious(r){return[[],function(e){return{execute:function(){e(r())}}}]}exports.transport=function(m){switch(m){${cases.join('')}default:throw new Error('Unknown module: '+m)}};`
    } satisfies Rolldown.EmittedAsset
}

/** Emits the synchronous reader shared by the Page shells in one subpackage. */
function renderPageLoader(root: string, cases: readonly string[], bootstrapFileName: string | undefined) {
    if (!bootstrapFileName) {
        throw new Error('Page loaders require the shared Mini Program bootstrap entry')
    }
    const fileName = pageLoaderFileName(root)
    // The inherited registry owns all module records. Only synchronous instantiation is package-local;
    // declaration-context import() must keep the shared loader as its receiver even after the Page returns.
    return {
        type: 'asset',
        fileName,
        source: `"use strict";var system=require(${quotedPath(fileName, bootstrapFileName)}).System,loader=Object.create(system);loader.import=system.import.bind(system);loader.instantiate=function(m){switch(m){${cases.join('')}default:return system.instantiate(m)}};exports.System=loader;`
    } satisfies Rolldown.EmittedAsset
}

/** Keeps the native dependency visible as a literal, relative to the file that executes require. */
function quotedPath(from: string, to: string): string {
    const relative = path.posix.relative(path.posix.dirname(from), to)
    return JSON.stringify(relative.startsWith('.') ? relative : `./${relative}`)
}
