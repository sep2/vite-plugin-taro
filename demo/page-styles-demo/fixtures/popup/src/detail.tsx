import { Button, View } from 'virtual:taro/components'
import Popup from '@taroify/core/popup'
import '@taroify/core/popup/style'
import { useState } from 'react'

export default function Detail() {
    // The page owns the Popup's visibility across native tap events.
    const [open, setOpen] = useState(false)
    return (
        <View>
            <Button id="open-popup" onClick={() => setOpen(true)}>
                Show order
            </Button>
            <Popup open={open} placement="bottom" onClose={() => setOpen(false)}>
                <View id="order-popup">Order details</View>
            </Popup>
        </View>
    )
}
