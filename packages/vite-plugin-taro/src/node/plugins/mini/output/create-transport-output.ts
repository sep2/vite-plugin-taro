import path from 'node:path'
import type { Rolldown } from 'vite'
import { toLogicalChunkId } from '../module/chunk-path.ts'
import { classifyMiniModule, miniTransportFileName } from '../module/module.ts'
import type { PackageLocation } from '../placer/placement.ts'

/**
 * Emits the closed transport table in generateBundle, after placement and content-hash resolution. Each switch case has two
 * identities: the package-neutral final filename is the SystemJS registration ID, while the package-qualified filename
 * supplies the literal native require path. Preliminary hash placeholders must not escape into this late-generated file.
 *
 * Transport itself executes only as native CommonJS in common/vpt/, separate from the bundled chunk namespace. Together
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
    getPackageLocation
}: {
    bundle: Rolldown.OutputBundle
    getPackageLocation(chunk: Rolldown.OutputChunk): PackageLocation
}) {
    // Fixed syntax and JSON-encoded paths produce CommonJS shaped like:
    // function amphibious(load) {
    //     return [[], function(exportBinding) {
    //         return { execute() { exportBinding(load()) } }
    //     }]
    // }
    // exports.transport = function(moduleId) {
    //     switch (moduleId) {
    //         case 'app-capsule.js': return require('../../app-capsule.js')
    //         case 'common/page.js': return require.async('../../sub/p_account/common/page.js')
    //         case 'common/bootstrap.js': return amphibious(function() { return require('../bootstrap.js') })
    //         default: throw new Error('Unknown module: ' + moduleId)
    //     }
    // }
    // One local journal accumulates only capsule and amphibious routes in deterministic bundle-key order.
    const cases: string[] = []
    const directory = path.posix.dirname(miniTransportFileName)
    for (const key of Object.keys(bundle).sort()) {
        const chunk = bundle[key]
        if (chunk.type !== 'chunk') {
            continue
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

        // Placement prefixes only physical filenames. SystemJS retains the package-neutral identity with resolved hashes.
        const logicalId = toLogicalChunkId(
            asynchronous ? chunk.fileName.slice(location.root.length + 1) : chunk.fileName
        )
        // Only native loading crosses the logical/physical boundary and receives the package-qualified path.
        const relative = path.posix.relative(directory, chunk.fileName)
        const requirePath = JSON.stringify(relative.startsWith('.') ? relative : `./${relative}`)
        const load = `${asynchronous ? 'require.async' : 'require'}(${requirePath})`
        // Amphibious namespaces must be required lazily during registration execution, never while bootstrap imports transport.
        // Capsules already export registrations; bridging only native namespaces avoids eager bootstrap recursion.
        const registration = kind === 'amphibious' ? `amphibious(function(){return ${load}})` : load
        cases.push(`case ${JSON.stringify(logicalId)}:return ${registration};`)
    }

    // 'asset' means opaque output bytes, not a non-JavaScript file: the host still executes this .js as CommonJS.
    // A regular chunk belongs to the module/rendering pipeline. A prebuilt chunk bypasses it, but our Rolldown 1.2.8
    // bundled-dev test retained stale transport content at the same filename after lazy imports changed. Asset emission
    // updates changed source correctly; dev-host.integration.test.ts covers adding and removing lazy routes on rebuild.
    // Unlike this graph-dependent table, common/vpt/global.js can remain prebuilt because application edits do not change it.
    // The default branch rejects IDs absent from the closed output graph rather than attempting an undeclared native load.
    return {
        type: 'asset',
        fileName: miniTransportFileName,
        source: `"use strict";function amphibious(r){return[[],function(e){return{execute:function(){e(r())}}}]}exports.transport=function(m){switch(m){${cases.join('')}default:throw new Error('Unknown module: '+m)}};`
    } satisfies Rolldown.EmittedAsset
}
