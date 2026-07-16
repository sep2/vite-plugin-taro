import './bootstrap.ts'
import { createAppShellConfig } from './app-config.ts'

declare const __VITE_PLUGIN_TARO_APP_CONFIG__: Record<string, unknown>

const loadAppModule = () => import('./app-module.ts')

App(createAppShellConfig(loadAppModule, __VITE_PLUGIN_TARO_APP_CONFIG__))
