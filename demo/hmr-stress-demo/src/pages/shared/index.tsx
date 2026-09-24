import Taro from 'virtual:taro/api'
import { Button } from 'virtual:taro/components'
import StressDashboard from '../../components/stress-dashboard.tsx'

export default function Index() {
    return (
        <StressDashboard
            title="Shared tree"
            navigation={
                <Button
                    id="back-shared-button"
                    className="navigation-button"
                    onClick={() => {
                        void Taro.navigateBack()
                    }}
                >
                    back
                </Button>
            }
        />
    )
}
