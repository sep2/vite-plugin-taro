import { queryNative } from './native.ts'
import type { UpdateMeasurement } from './update-measurement.ts'

/** Both builds finish at the same SDK query callback for the committed revision's native geometry. */
export async function measureNativeUpdate(
    start: number,
    committed: number,
    revision: number
): Promise<UpdateMeasurement> {
    await new Promise<void>((resolve) => wx.nextTick(resolve))
    const [marker] = await queryNative(`>>> #benchmark-state-${revision}`, false)
    const acknowledged = wx.getPerformance().now()
    if (!marker || marker.id !== `benchmark-state-${revision}` || marker.height <= 0) {
        throw new Error(`Native marker mismatch: ${JSON.stringify(marker)}`)
    }
    return {
        duration: acknowledged - start,
        commitDuration: committed - start,
        layoutDuration: acknowledged - committed,
        revision
    }
}
