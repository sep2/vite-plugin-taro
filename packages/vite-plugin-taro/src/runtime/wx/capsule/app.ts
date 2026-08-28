// biome-ignore assist/source/organizeImports: Taro must initialize before the App component.
import { createReactApp, ReactDOM } from './taro-runtime.ts'
import React from 'react'

// @ts-expect-error: The wx build resolves this private App component.
import AppComponent from '\0vpt:app-component'

const config = createReactApp(AppComponent, React, ReactDOM, __VPT_APP_CONFIG__)

export default config
