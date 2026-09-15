import { Button, Text, View } from 'virtual:taro/components'
import { useEffect, useState } from 'react'
import { runPolyfillChecks } from '../../run-polyfill-checks.ts'

// Starts during module evaluation to check that configured polyfills load before page code.
const startupResults = runPolyfillChecks()

type Results = Awaited<ReturnType<typeof runPolyfillChecks>>

export default function Index() {
    // Results are replaced after each completed suite; null represents the initial run.
    const [results, setResults] = useState<Results | null>(null)
    // Prevent overlapping manual runs while asynchronous checks are pending.
    const [running, setRunning] = useState(true)

    useEffect(() => {
        // Ignore the pending startup result after this effect is cleaned up by unmount or HMR.
        let active = true
        void startupResults.then((next) => {
            if (active) {
                setResults(next)
                setRunning(false)
            }
        })
        return () => {
            active = false
        }
    }, [])

    async function rerun() {
        setRunning(true)
        setResults(await runPolyfillChecks())
        setRunning(false)
    }

    const passed = results?.filter((result) => result.passed).length ?? 0

    return (
        <View className="page">
            <Text className="title">Polyfill demo</Text>
            <Text className="description">Explicit core-js modules, checked in the mini-program runtime.</Text>
            <Text id="polyfill-summary" className="summary">
                {running ? 'Running checks…' : `${passed}/${results?.length} passed`}
            </Text>
            <Button id="polyfill-rerun" disabled={running} onClick={rerun}>
                Run again
            </Button>
            {results?.map((result, index) => (
                <View
                    key={result.module}
                    id={`polyfill-result-${index}`}
                    className={`result ${result.passed ? 'pass' : 'fail'}`}
                >
                    <Text className="name">
                        {result.passed ? 'PASS' : 'FAIL'} · {result.name}
                    </Text>
                    <Text className="module">{result.module}</Text>
                    <Text className="detail">{result.detail}</Text>
                </View>
            ))}
        </View>
    )
}
