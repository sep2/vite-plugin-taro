/** biome-ignore-all assist/source/organizeImports: keep side effect orders */

import { createHashHistory, createReactApp, createRouter, handleAppMount, window } from './taro-runtime.ts'
import type { Route, SpaRouterConfig } from '@tarojs/router/types/router'
import React from 'react'
import ReactDOM from 'react-dom/client'

// @ts-expect-error: The H5 build resolves this private App component.
import AppComponent from '\0vpt:app-component'

declare const __VITE_PLUGIN_TARO_H5_APP_CONFIG__: SpaRouterConfig
declare const __VITE_PLUGIN_TARO_H5_ROUTES__: Route[]

const browserWindow = window as unknown as Window &
    typeof window & {
        __taroAppConfig: SpaRouterConfig
    }
const config = __VITE_PLUGIN_TARO_H5_APP_CONFIG__
browserWindow.__taroAppConfig = config
config.routes = __VITE_PLUGIN_TARO_H5_ROUTES__
const app = createReactApp(AppComponent, React, ReactDOM, config)
const history = createHashHistory({ window: browserWindow })
handleAppMount(config, history)
// @ts-expect-error Taro's implementation receives the React adapter object despite declaring a string.
createRouter(history, app, config, React)
