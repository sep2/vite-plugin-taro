import { Text, View } from 'virtual:taro/components'
import { NavigationBar } from '../../components/navigation-bar/navigation-bar.tsx'

export default function ShadcnDemo() {
    return (
        <View className="relative flex flex-col flex-1 h-screen w-full overflow-hidden">
            <NavigationBar>
                <Text>shadcn demo</Text>
            </NavigationBar>
        </View>
    )
}
