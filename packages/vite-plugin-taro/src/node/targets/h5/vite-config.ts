import type { UserConfig } from 'vite'
import type { BuildContext } from '../../build-context.ts'
import { packageRequire } from '../../package-paths.ts'

export function createH5ViteConfig(context: BuildContext): UserConfig {
    return {
        define: createH5TaroDefines(),
        resolve: {
            mainFields: ['main:h5', 'browser', 'module', 'jsnext:main', 'jsnext'],
            alias: [
                {
                    find: /^@stencil\/core\/internal\/client$/,
                    replacement: packageRequire.resolve('@stencil/core/internal/client', {
                        paths: [packageRequire.resolve('@tarojs/components/package.json')]
                    })
                },
                {
                    find: /^@tarojs\/components$/,
                    replacement: packageRequire.resolve('@tarojs/components/lib/react')
                },
                {
                    find: /^@tarojs\/components\/dist\/components$/,
                    replacement: packageRequire.resolve('@tarojs/components/dist/components')
                },
                {
                    find: /^@tarojs\/taro$/,
                    replacement: packageRequire.resolve('@tarojs/plugin-platform-h5/dist/runtime/apis')
                }
            ]
        },
        optimizeDeps: {
            exclude: ['@stencil/core/internal/client']
        },
        build: {
            target: 'es2018',
            minify: !context.development
        }
    }
}

function createH5TaroDefines(): Record<string, string> {
    return {
        'process.env.FRAMEWORK': JSON.stringify('react'),
        'process.env.SUPPORT_TARO_POLYFILL': JSON.stringify('disabled'),
        'process.env.TARO_ENV': JSON.stringify('h5'),
        'process.env.TARO_PLATFORM': JSON.stringify('web'),
        'process.env.SUPPORT_DINGTALK_NAVIGATE': JSON.stringify('disabled'),
        DEPRECATED_ADAPTER_COMPONENT: 'false'
    }
}
