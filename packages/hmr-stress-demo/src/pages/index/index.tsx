import Taro from 'virtual:taro/api'
import { Button } from 'virtual:taro/components'
import StressDashboard from '../../components/stress-dashboard.tsx'

export default function Index() {
    return (
        <StressDashboard
            title="Primary tree"
            navigation={
                <Button
                    id="open-mirror-button"
                    className="navigation-button"
                    onClick={() => {
                        void Taro.navigateTo({ url: '/pages/mirror/index' })
                    }}
                >
                    open mirror
                </Button>
            }
        />
    )
}
