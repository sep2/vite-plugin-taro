#!/usr/bin/env node
import { copyFileSync, cpSync, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { relocateRuntimeDeclarations } from './relocate-runtime-declarations.ts'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(packageRoot, 'dist')
const runtimeCjsFilePattern = /^index\.cjs\.(?:d\.ts|js(?:\.map)?)$/
const platformModules = ['runtime', 'components-react', 'runtime-utils'] as const
const platformPackages = ['@tarojs/plugin-platform-weapp', '@tarojs/plugin-platform-alipay'] as const

build()

/**
 * Builds the publishable runtime package from pinned Taro development dependencies.
 *
 * pnpm applies the repository patches before this script runs. The resulting files must be copied into this package because
 * development dependencies are absent from consumer installations and npm exports cannot address files outside the published
 * package. Runtime packages retain their complete ESM graphs; compiler plugin packages are reduced to the artifacts VPT executes.
 */
function build(): void {
    rmSync(distRoot, { recursive: true, force: true })
    copyRuntimeDist()
    copyApiRuntime()
    copyTaroFacade()
    copyComponentsRuntime()
    copyRouterRuntime()
    copyTaroH5Runtime()
    copyPackageDist('@tarojs/react')
    copyFrameworkReactAdapter()
    platformPackages.forEach(copyPlatformPackage)
    copyH5Platform()
    relocateRuntimeDeclarations(distRoot)
}

/**
 * Copies both exported ESM runtime entries and their complete shared module graph.
 *
 * The modular index entry serves Mini Programs and runtime.esm serves H5. Their relative imports, declarations, and source maps
 * require the rest of the distribution. The unexported index.cjs build is the only duplicate representation and is excluded with
 * its declaration and source map, avoiding about 595 KB of dead package weight without transforming any retained file.
 */
function copyRuntimeDist(): void {
    const dependency = '@tarojs/runtime'
    cpSync(resolveDependencyDist(dependency), resolveOutputRoot(dependency), {
        recursive: true,
        filter: (source) => !runtimeCjsFilePattern.test(path.basename(source))
    })
}

/** Keeps the modular API graph, excluding its three duplicate bundled representations. */
function copyApiRuntime(): void {
    cpSync(resolveDependencyDist('@tarojs/api'), path.join(resolveOutputRoot('@tarojs/api'), 'dist'), {
        recursive: true,
        filter: (source) => !/^(?:index\.(?:cjs|esm)|taro)\.js(?:\.map)?$/.test(path.basename(source))
    })
}

/** The unchanged CommonJS facade needs its nested package boundary inside this ESM package. */
function copyTaroFacade(): void {
    const output = resolveOutputRoot('@tarojs/taro')
    mkdirSync(output, { recursive: true })
    for (const entry of ['index.js', 'package.json', 'types']) {
        cpSync(resolveDependencyPath('@tarojs/taro', entry), path.join(output, entry), { recursive: true })
    }
}

/** Copies eager React/Stencil components, not the alternate lazy-loader JavaScript graph. */
function copyComponentsRuntime(): void {
    const output = resolveOutputRoot('@tarojs/components')
    for (const entry of [
        'lib/react',
        'dist/components',
        'types',
        'global.css',
        'dist/taro-components/taro-components.css'
    ]) {
        const destination = path.join(output, entry)
        mkdirSync(path.dirname(destination), { recursive: true })
        cpSync(resolveDependencyPath('@tarojs/components', entry), destination, { recursive: true })
    }
}

/** Preserves the exact router bundle VPT uses and declarations, without duplicate CJS/browser bundles. */
function copyRouterRuntime(): void {
    const output = resolveOutputRoot('@tarojs/router')
    cpSync(resolveDependencyDist('@tarojs/router'), path.join(output, 'dist'), {
        recursive: true,
        filter: (source) =>
            statSync(source).isDirectory() ||
            source.endsWith('.d.ts') ||
            /^index\.esm\.js(?:\.map)?$/.test(path.basename(source))
    })
    cpSync(resolveDependencyPath('@tarojs/router', 'types'), path.join(output, 'types'), { recursive: true })
}

/** The modular H5 APIs close over utils and the generated relative style-inject module. */
function copyTaroH5Runtime(): void {
    for (const entry of ['dist/api', 'dist/utils', 'dist/node_modules', 'types']) {
        cpSync(
            resolveDependencyPath('@tarojs/taro-h5', entry),
            path.join(resolveOutputRoot('@tarojs/taro-h5'), entry),
            {
                recursive: true
            }
        )
    }
}

/** Copies a runtime-only package distribution without transforming its files. */
function copyPackageDist(dependency: string): void {
    cpSync(resolveDependencyDist(dependency), resolveOutputRoot(dependency), { recursive: true })
}

/**
 * Copies only the React application runtime. First-party facades statically export its lifecycle hooks, so the upstream
 * api-loader and CLI/compiler entry are neither executed nor published.
 */
function copyFrameworkReactAdapter(): void {
    const dependency = '@tarojs/plugin-framework-react'
    const dependencyDist = resolveDependencyDist(dependency)
    const outputRoot = resolveOutputRoot(dependency)
    mkdirSync(outputRoot, { recursive: true })
    copyFileSync(path.join(dependencyDist, 'runtime.js'), path.join(outputRoot, 'runtime.js'))
    copyFileSync(path.join(dependencyDist, 'runtime.js.map'), path.join(outputRoot, 'runtime.js.map'))
}

/**
 * Copies the Mini Program platform runtime boundary without its Taro compiler plugin.
 *
 * runtime.js installs platform API behavior, components-react.js owns the platform component table, and runtime-utils.js owns
 * template component metadata used by VPT's skeleton generator. Their source maps and complete declaration tree belong to those
 * runtime-facing modules. dist/index.js is the upstream CLI platform plugin, which VPT never executes; shipping it would add dead
 * package weight, while executing it would require reintroducing @tarojs/service and the compiler dependency graph.
 */
function copyPlatformPackage(dependency: (typeof platformPackages)[number]): void {
    const dependencyDist = resolveDependencyDist(dependency)
    const outputRoot = resolveOutputRoot(dependency)
    mkdirSync(outputRoot, { recursive: true })

    platformModules.forEach((moduleName) => {
        copyFileSync(path.join(dependencyDist, `${moduleName}.js`), path.join(outputRoot, `${moduleName}.js`))
        copyFileSync(path.join(dependencyDist, `${moduleName}.js.map`), path.join(outputRoot, `${moduleName}.js.map`))
    })
    cpSync(path.join(dependencyDist, 'types'), path.join(outputRoot, 'types'), { recursive: true })
}

/**
 * Copies the H5 runtime API implementation and the definition consumed by its runtime canIUse implementation.
 *
 * The rest of @tarojs/plugin-platform-h5/dist implements Taro's compiler program. VPT owns that compilation pipeline, so its
 * index.js and compiler declarations are neither imported nor exported by the runtime package.
 */
function copyH5Platform(): void {
    const dependency = '@tarojs/plugin-platform-h5'
    const dependencyDist = resolveDependencyDist(dependency)
    const outputRoot = resolveOutputRoot(dependency)
    mkdirSync(outputRoot, { recursive: true })
    cpSync(path.join(dependencyDist, 'runtime', 'apis'), path.join(outputRoot, 'runtime', 'apis'), { recursive: true })
    copyFileSync(path.join(dependencyDist, 'definition.json'), path.join(outputRoot, 'definition.json'))
}

/**
 * Resolves the physical dist directory through Node's module resolver.
 *
 * cpSync requires a filesystem path rather than a package specifier. Resolving package.json from this build module selects the
 * runtime package's exact direct dependency—including pnpm's patched instance—without assuming a hoisted node_modules or pnpm
 * store path.
 */
function resolveDependencyDist(dependency: string): string {
    return resolveDependencyPath(dependency, 'dist')
}

/** Resolves from the pinned direct build dependency, including pnpm's patched instance. */
function resolveDependencyPath(dependency: string, entry: string): string {
    return fileURLToPath(new URL(entry, import.meta.resolve(`${dependency}/package.json`)))
}

/** Mirrors an @tarojs package name directly below this package's dist directory. */
function resolveOutputRoot(dependency: string): string {
    return path.join(distRoot, dependency.slice('@tarojs/'.length))
}
