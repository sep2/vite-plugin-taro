import { defineConfig } from 'vite'
import vpt from 'vite-plugin-taro'

export default defineConfig({
    plugins: [
        vpt({
            target: 'wx',
            app: 'src/app.tsx',
            pages: [{ path: 'home' }, { path: 'detail', subpackage: 'orders' }],
            appJson: {},
            projectConfigJson: { appid: 'touristappid', compileType: 'miniprogram', projectname: 'subpackage-popup' }
        })
    ]
})
