import type { TestEvent } from 'node:test/reporters'
import { inspect } from 'node:util'

/** Keeps CI output quiet without discarding assertion details or failed worker exit codes and signals. */
export default async function* ciTestReporter(source: AsyncIterable<TestEvent>): AsyncGenerator<string> {
    for await (const { type, data } of source) {
        switch (type) {
            case 'test:fail':
                if (data.todo !== undefined || data.skip !== undefined) {
                    break
                }
                yield `FAIL ${data.name}\n`
                if (data.file) {
                    yield `  at ${data.file}:${data.line}:${data.column}\n`
                }
                // Inspect the whole error: unwrapping its cause loses worker exitCode and signal metadata.
                yield `${inspect(data.details.error, { colors: false, depth: null })}\n`
                break
            case 'test:diagnostic':
                yield `${data.message}\n`
                break
            case 'test:stdout':
            case 'test:stderr':
                yield data.message
                break
            case 'test:interrupted':
                yield `Interrupted tests:\n${inspect(data.tests, { colors: false, depth: null })}\n`
                break
        }
    }
}
