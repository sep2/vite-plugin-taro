import assert from 'node:assert/strict'
import test from 'node:test'
import { transformWxReactRefreshModule } from './react-refresh.ts'

test('instruments a JSX-free WX App with Vite Oxc React Refresh', async () => {
    const appFile = '/project/src/app.ts'
    const code = `
function App({ children }) {
    return children
}
export default App
`

    const transformed = await transformWxReactRefreshModule(code, appFile, appFile)

    assert.match(transformed, /__wxRegisterRefreshType/)
    assert.match(transformed, /\$RefreshReg\$\(_c, "App"\)/)
    assert.match(transformed, /import\.meta\.hot\.accept\(\)/)
    assert.doesNotMatch(transformed, /react-refresh\/babel/)
})
