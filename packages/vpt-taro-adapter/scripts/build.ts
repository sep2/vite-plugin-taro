#!/usr/bin/env node
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(packageRoot, 'dist')
const runtimeCjsFilePattern = /^index\.cjs\.(?:d\.ts|js(?:\.map)?)$/
const platformModules = ['runtime', 'components-react', 'runtime-utils'] as const
const platformPackages = ['@tarojs/plugin-platform-weapp', '@tarojs/plugin-platform-alipay'] as const

build()

/**
 * Builds the publishable adapter from pinned Taro development dependencies.
 *
 * pnpm applies the repository patches before this script runs. The resulting files must be copied into this package because
 * development dependencies are absent from consumer installations and npm exports cannot address files outside the published
 * package. Runtime packages retain their complete ESM graphs; compiler plugin packages are reduced to the artifacts VPT executes.
 */
function build(): void {
    rmSync(distRoot, { recursive: true, force: true })
    copyRuntimeDist()
    copyPackageDist('@tarojs/react')
    copyFrameworkReactAdapter()
    platformPackages.forEach(copyPlatformPackage)
    copyH5Platform()
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

/** Copies a runtime-only package distribution without transforming its files. */
function copyPackageDist(dependency: string): void {
    cpSync(resolveDependencyDist(dependency), resolveOutputRoot(dependency), { recursive: true })
}

/**
 * Copies only the two framework artifacts VPT executes.
 *
 * runtime.js creates the React application runtime. api-loader.js injects Taro's framework lifecycle exports into VPT's API
 * facade. The remaining dist/index.js is Taro's complete CLI/compiler plugin; it imports @tarojs/helper, lodash, Acorn, and
 * webpack-specific integrations that VPT replaces and must not publish as application support code.
 *
 * Upstream api-loader.js uses CommonJS module.exports. This package is type=module, so preserving the .js extension would make
 * Node interpret the copied loader as ESM when VPT loads it with require(). The .cjs extension preserves its original module
 * semantics without changing its contents.
 */
function copyFrameworkReactAdapter(): void {
    const dependency = '@tarojs/plugin-framework-react'
    const dependencyDist = resolveDependencyDist(dependency)
    const outputRoot = resolveOutputRoot(dependency)
    mkdirSync(outputRoot, { recursive: true })
    copyFileSync(path.join(dependencyDist, 'runtime.js'), path.join(outputRoot, 'runtime.js'))
    copyFileSync(path.join(dependencyDist, 'runtime.js.map'), path.join(outputRoot, 'runtime.js.map'))
    copyFileSync(path.join(dependencyDist, 'api-loader.js'), path.join(outputRoot, 'api-loader.cjs'))
    copyFileSync(path.join(dependencyDist, 'api-loader.js.map'), path.join(outputRoot, 'api-loader.js.map'))
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
 * Copies the H5 runtime API implementation and the API definition consumed by VPT's Babel transform.
 *
 * The rest of @tarojs/plugin-platform-h5/dist implements Taro's compiler program. VPT owns that compilation pipeline, so its
 * index.js and compiler declarations are neither imported nor exported by the adapter.
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
 * adapter's exact direct dependency—including pnpm's patched instance—without assuming a hoisted node_modules or pnpm store path.
 */
function resolveDependencyDist(dependency: string): string {
    return fileURLToPath(new URL('./dist', import.meta.resolve(`${dependency}/package.json`)))
}

/** Mirrors an @tarojs package name directly below this package's dist directory. */
function resolveOutputRoot(dependency: string): string {
    return path.join(distRoot, dependency.slice('@tarojs/'.length))
}
