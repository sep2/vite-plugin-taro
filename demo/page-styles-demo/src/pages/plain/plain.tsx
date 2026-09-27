import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'
import StateCounter from '../../components/state-counter.tsx'

export default function Plain() {
    return (
        <View className="section">
            <Text>Plain imports no CSS. Its native page stylesheet must be empty.</Text>
            <View id="plain-leak-probe" className="leak-probe collision-card shared-card red-only blue-only lazy-card">
                Page-only selectors: this block must stay gray, with no colored card styles.
            </View>
            <StateCounter id="plain-counter" label="Plain counter" />
            <Button
                id="plain-back"
                className="demo-button"
                onClick={() => {
                    void Taro.navigateBack()
                }}
            >
                Back to retained page
            </Button>
        </View>
    )
}
