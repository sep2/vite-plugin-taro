import { Button, Input, Text, View } from 'virtual:taro/components'

type DashboardControlsProps = Readonly<{
    counter: number
    input: string
    dense: boolean
    onCounterChange: () => void
    onDenseChange: () => void
    onInputChange: (value: string) => void
}>

export default function DashboardControls({
    counter,
    input,
    dense,
    onCounterChange,
    onDenseChange,
    onInputChange
}: DashboardControlsProps) {
    return (
        <View className="dashboard-controls">
            <Input
                id="stress-input"
                className="stress-input"
                value={input}
                placeholder="State must survive every edit"
                onInput={(event) => {
                    onInputChange(event.detail.value)
                }}
            />
            <View className="dashboard-buttons">
                <Button id="increment-button" className="stress-button stress-button-primary" onClick={onCounterChange}>
                    increment {counter}
                </Button>
                <Button id="density-button" className="stress-button" onClick={onDenseChange}>
                    density {dense ? 'dense' : 'relaxed'}
                </Button>
            </View>
            <Text className="dashboard-help">Edit marker bursts while both controls retain their values.</Text>
        </View>
    )
}
