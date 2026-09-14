import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { writeFixtureSource } from './write-fixture-source.ts'

test('concurrent readers only observe complete source generations during a burst', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loan-fixture-write-'))
    const file = path.join(root, 'page.tsx')
    const generations = Array.from(
        { length: 100 },
        (_, index) => `export const marker = ${index}\n${' '.repeat(27000)}`
    )
    const initialSource = 'export const marker = -1\n'
    const completeSources = new Set([initialSource, ...generations])
    // The publisher owns the reader lifetime; observations are collected until publication completes.
    let publishing = true
    const observed = new Set<string>()
    await writeFixtureSource(file, initialSource)
    const reader = (async () => {
        while (publishing) {
            observed.add(await readFile(file, 'utf8'))
        }
    })()
    try {
        for (const source of generations) {
            await writeFixtureSource(file, source)
        }
    } finally {
        publishing = false
        try {
            await reader
            assert.ok(observed.size > 0)
            for (const source of observed) {
                assert.ok(completeSources.has(source), `Reader observed an incomplete source (${source.length} bytes)`)
            }
            assert.deepEqual(await readdir(root), ['page.tsx'])
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    }
})

test('intentional syntax errors are published unchanged for recovery cases', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loan-fixture-syntax-'))
    try {
        const file = path.join(root, 'page.tsx')
        const invalidSource = 'export default function Broken(\n'
        await writeFixtureSource(file, invalidSource)
        assert.equal(await readFile(file, 'utf8'), invalidSource)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('failed publication removes its temporary file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loan-fixture-failure-'))
    try {
        const destination = path.join(root, 'directory')
        await mkdir(destination)
        await assert.rejects(writeFixtureSource(destination, 'source'))
        assert.deepEqual(await readdir(root), ['directory'])
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
