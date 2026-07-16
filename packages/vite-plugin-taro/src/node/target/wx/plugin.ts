import type { Plugin } from 'vite'
import { DevEnvironment } from 'vite'

const wxEnvironmentName = 'wx'
const wxJavaScriptTarget = 'es2018'

export function createWxTargetPlugin(): Plugin {
    return {
        name: 'vite-plugin-taro:wx',

        config() {
            return {
                // WX has native App/Page entries and must not use Vite's SPA HTML fallback.
                appType: 'custom',

                // Vite's development source transforms must emit syntax supported by the WX runtime.
                oxc: { target: wxJavaScriptTarget },

                // The default app builder targets the browser client; WX is the only production environment for this target.
                builder: {
                    async buildApp(builder) {
                        await builder.build(builder.environments[wxEnvironmentName])
                    }
                },

                environments: {
                    [wxEnvironmentName]: {
                        // WX consumes client-side package exports, CSS, and assets without being a browser environment.
                        consumer: 'client',

                        dev: {
                            // WX modules execute in DevTools, so Vite must transform them without a Node ModuleRunner.
                            createEnvironment(name, config) {
                                return new DevEnvironment(name, config, {
                                    // HMR stays disabled until the WX metadata channel has an update consumer.
                                    hot: false
                                })
                            }
                        },

                        build: {
                            // WX has no browser module-preload runtime.
                            modulePreload: false,

                            // Production chunks must use the same WX-supported syntax level as development modules.
                            target: wxJavaScriptTarget
                        }
                    }
                }
            }
        }
    }
}
