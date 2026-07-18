// biome-ignore assist/source/organizeImports: Taro must initialize before the App component.
import { createReactApp, ReactDOM } from './taro-runtime.ts'
import React from 'react'
import { appConfig } from '../amphibious/bootstrap.ts'

// @ts-expect-error: The WX build resolves this private App component.
import AppComponent from '\0vpt:app-component'

export default createReactApp(AppComponent, React, ReactDOM, appConfig)
