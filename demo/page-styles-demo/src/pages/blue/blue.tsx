import Taro from 'virtual:taro/api'
import { Button, View } from 'virtual:taro/components'
import PageFixture from '../../components/page-fixture.tsx'
import './blue.css'

export default function Blue() {
    return (
        <PageFixture name="blue">
            <View className="leak-probe blue-only">Blue-only selector: this block must be blue.</View>
            <View id="blue-leak-probe" className="leak-probe red-only lazy-card">
                Red-only and lazy selectors: this block must stay gray.
            </View>
            <Button
                id="blue-back"
                className="demo-button"
                onClick={() => {
                    void Taro.navigateBack()
                }}
            >
                Back to retained Red page
            </Button>
        </PageFixture>
    )
}
