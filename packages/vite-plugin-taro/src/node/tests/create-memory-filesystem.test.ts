import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { VirtualFileSystem } from 'node:vfs'
import { normalizePath } from 'vite'
import { normalizeModuleId } from '../utils/modules.ts'
import { createMemoryFilesystem } from './create-memory-filesystem.ts'
import { getVfsDevicePath } from './get-vfs-device-path.ts'
import { projectTempDir } from './project-temp-dir.ts'

test('uses a Windows null-device spelling preserved by stock Vite', () => {
    for (const drive of ['C:', 'D:']) {
        const device = getVfsDevicePath('\\\\.\\nul', `${drive}\\workspace\\project`)
        assert.equal(device, `${drive}\\nul`)
        const root = path.win32.join(device, 'vfs', '1')
        const normalized = normalizeModuleId(`${root.replaceAll('\\', '/')}/component.ts?import`)
        assert.equal(path.win32.dirname(normalized), root.replaceAll('\\', '/'))
        assert.equal(path.win32.resolve(normalized), path.win32.join(root, 'component.ts'))
    }
    assert.equal(getVfsDevicePath('/dev/null', '/workspace/project'), '/dev/null')
})

for (const devNull of ['/dev/null', '\\\\.\\nul']) {
    test(`mounts and disposes the memory filesystem with device ${devNull}`, (context) => {
        const originalDevNull = os.devNull
        context.after(() => Object.defineProperty(os, 'devNull', { value: originalDevNull }))
        // Scope the simulated OS device to this test; the mocked mount leaves Node's router untouched.
        Object.defineProperty(os, 'devNull', { value: devNull })
        const descriptor = Object.getOwnPropertyDescriptor(os, 'devNull')
        const devicePath = getVfsDevicePath(devNull, process.cwd())
        const root = path.join(projectTempDir, 'mock-vfs-mount')
        const mount = context.mock.method(VirtualFileSystem.prototype, 'mount', () => {
            assert.equal(os.devNull, devicePath)
            return root
        })
        const unmount = context.mock.method(VirtualFileSystem.prototype, 'unmount', () => {})
        const defineProperty = context.mock.method(Object, 'defineProperty')
        {
            using fixture = createMemoryFilesystem()
            assert.equal(fixture.root, root)
            assert.equal(mount.mock.callCount(), 1)
            assert.equal(unmount.mock.callCount(), 0)
            assert.deepEqual(Object.getOwnPropertyDescriptor(os, 'devNull'), descriptor)
            const writes = defineProperty.mock.calls
                .filter(({ arguments: args }) => args[0] === os && args[1] === 'devNull')
                .map(({ arguments: args }) => args[2].value)
            assert.deepEqual(writes, devicePath === devNull ? [] : [devicePath, devNull])
        }
        assert.equal(unmount.mock.callCount(), 1)
    })

    test(`restores device ${devNull} when mounting throws`, (context) => {
        const originalDevNull = os.devNull
        context.after(() => Object.defineProperty(os, 'devNull', { value: originalDevNull }))
        // Scope the simulated OS device to this test, including the mount failure path.
        Object.defineProperty(os, 'devNull', { value: devNull })
        const descriptor = Object.getOwnPropertyDescriptor(os, 'devNull')
        context.mock.method(VirtualFileSystem.prototype, 'mount', () => {
            assert.equal(os.devNull, getVfsDevicePath(devNull, process.cwd()))
            throw new Error('mount failed')
        })
        assert.throws(() => createMemoryFilesystem(), /mount failed/)
        assert.deepEqual(Object.getOwnPropertyDescriptor(os, 'devNull'), descriptor)
    })
}

test('stock Vite module paths address the mounted memory tree', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(os, 'devNull')
    const root = await (async () => {
        using fixture = createMemoryFilesystem()
        assert.deepEqual(Object.getOwnPropertyDescriptor(os, 'devNull'), descriptor)
        assert.equal(path.resolve(normalizePath(fixture.root)), fixture.root)
        const entry = path.join(fixture.root, 'index.js')
        writeFileSync(entry, 'export const value = 1')
        const moduleId = normalizeModuleId(`${entry}?import`)
        assert.equal(readFileSync(moduleId, 'utf8'), 'export const value = 1')
        assert.equal(await readFile(path.resolve(moduleId), 'utf8'), 'export const value = 1')
        return fixture.root
    })()
    assert.equal(existsSync(root), false)
})

test('initializes the memory router before restoring the OS device spelling', () => {
    const device = path.join(projectTempDir, `vfs-device-${randomUUID()}`)
    const helper = new URL('./create-memory-filesystem.ts', import.meta.url).href
    // A fresh process owns the synthetic device spelling and the first-mount router cache.
    execFileSync(
        process.execPath,
        [
            '--experimental-vfs',
            '--input-type=module',
            '--eval',
            `
                import assert from 'node:assert/strict'
                import { existsSync, readFileSync, writeFileSync } from 'node:fs'
                import os from 'node:os'
                import path from 'node:path'
                import { normalizePath } from 'vite'
                import { createMemoryFilesystem } from ${JSON.stringify(helper)}

                const device = ${JSON.stringify(device)}
                const devNull = os.devNull
                Object.defineProperty(os, 'devNull', { value: device })
                using fixture = createMemoryFilesystem()
                Object.defineProperty(os, 'devNull', { value: devNull })
                assert.ok(fixture.root.startsWith(path.join(device, 'vfs') + path.sep))
                assert.equal(existsSync(device), false)
                const entry = path.join(fixture.root, 'index.js')
                writeFileSync(entry, 'memory')
                assert.equal(readFileSync(normalizePath(entry), 'utf8'), 'memory')
            `
        ],
        { cwd: path.resolve(import.meta.dirname, '../../..'), timeout: 30000 }
    )
    assert.equal(existsSync(device), false)
})
