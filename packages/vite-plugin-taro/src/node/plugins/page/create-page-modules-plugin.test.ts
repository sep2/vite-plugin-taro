import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import { createMemoryBuildProject } from '../../tests/create-memory-build-project.ts'
import { apiModuleId } from '../api/api-module-id.ts'
import { createPageModulesPlugin, pageEntryPrefix } from './create-page-modules-plugin.ts'

test('matches filesystem paths without changing Rolldown module IDs', async (t) => {
    const project = createMemoryBuildProject({
        'src/home.tsx': `
            import { defineVptPage } from 'virtual:vpt';
            defineVptPage(() => ({}));
            export default () => 'Home';
        `
    })
    t.after(() => project[Symbol.dispose]())
    const invalidate = t.mock.fn()
    const plugin = await createPageModulesPlugin(project.root, '\0test:entry', invalidate)
    const file = normalizePath(path.join(project.root, 'src/home.tsx'))
    const changedFile = `${path.dirname(file)}/./home.tsx`
    // Distinguish the original module ID from the watcher path on every OS.
    const moduleId = `${path.join(project.root, 'src')}${path.sep}.${path.sep}home.tsx`
    const resolveId = plugin.resolveId
    assert.ok(typeof resolveId === 'function')
    assert.equal(Reflect.apply(resolveId, {}, [apiModuleId, moduleId]), '\0ps:declaration:home')

    const getModuleInfo = t.mock.fn(() => ({ importers: [`${pageEntryPrefix}home`], dynamicImporters: [] }))
    await Reflect.apply(plugin.hotUpdate, { getModuleInfo }, [
        { file: changedFile, type: 'update', modules: [moduleId] }
    ])
    assert.deepEqual(getModuleInfo.mock.calls[0]?.arguments, [moduleId])
    assert.equal(invalidate.mock.callCount(), 0)
})
