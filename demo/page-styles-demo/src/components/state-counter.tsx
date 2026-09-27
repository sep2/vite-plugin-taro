import { Button } from 'virtual:taro/components'
import { useState } from 'react'

export default function StateCounter({ id, label }: { id: string; label: string }) {
    // Deliberately local React state exposes accidental remounts during stylesheet HMR.
    const [count, setCount] = useState(0)

    return (
        <Button id={id} className="demo-button" onClick={() => setCount((value) => value + 1)}>
            {label}: {count}
        </Button>
    )
}
