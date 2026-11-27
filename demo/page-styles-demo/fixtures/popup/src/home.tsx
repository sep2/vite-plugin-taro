import Taro from 'virtual:taro/api'
import { Button } from 'virtual:taro/components'

export default function Home() {
    return <Button onClick={() => Taro.navigateTo({ url: '/orders/detail' })}>Order details</Button>
}
