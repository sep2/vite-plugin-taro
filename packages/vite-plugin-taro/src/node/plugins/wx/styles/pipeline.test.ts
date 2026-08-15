import assert from 'node:assert/strict'
import test from 'node:test'
import { createWxStylePlugin } from './plugins.ts'

test('publishes only changed WXSS bytes', async () => {
    const styles = createWxStylePlugin(['/project/app.js'])
    // This mutable journal represents the host's durable atomic writer.
    const writes: string[] = []
    const write = async (wxss: string) => {
        writes.push(wxss)
    }
    const first = { classSet: new Set<string>(), wxss: '.app { color: red; }' }
    const second = { classSet: new Set<string>(), wxss: '.app { color: blue; }' }

    await styles.publish(first.wxss, write)
    await styles.publish(first.wxss, write)
    await styles.publish(second.wxss, write)

    assert.deepEqual(writes, [first.wxss, second.wxss])
})
