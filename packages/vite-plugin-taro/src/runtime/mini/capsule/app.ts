// biome-ignore assist/source/organizeImports: Taro must initialize before the App component.
import { createVptApp } from '../taro/taro-runtime.ts'

// @ts-expect-error: The active Mini contract resolves this private App component.
import AppComponent from '\0vpt:app-component'

const config = createVptApp(AppComponent, __VPT_APP_CONFIG__)

export default config
