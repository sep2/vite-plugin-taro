/** biome-ignore-all assist/source/organizeImports: keep side effect orders */

import { createHashHistory, createReactApp, createRouter, handleAppMount, window } from './taro-runtime.ts'
import type { SpaRouterConfig } from '@tarojs/router/types/router'
import React from 'react'
import ReactDOM from 'react-dom/client'

// @ts-expect-error: The H5 build resolves this private App component.
import AppComponent from '\0vpt:app-component'

const browserWindow = window as unknown as Window &
    typeof window & {
        __taroAppConfig: SpaRouterConfig
    }
const config = __VPT_H5_APP_CONFIG__
browserWindow.__taroAppConfig = config
config.routes = __VPT_H5_ROUTES__
const app = createReactApp(AppComponent, React, ReactDOM, config)
const history = createHashHistory({ window: browserWindow })
handleAppMount(config, history)
// @ts-expect-error Taro's implementation receives the React adapter object despite declaring a string.
createRouter(history, app, config, React)
