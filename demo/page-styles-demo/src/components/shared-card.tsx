import { Text, View } from 'virtual:taro/components'
import styles from './shared-card.module.css'
import './shared-card.css'

export default function SharedCard() {
    return (
        <View className="shared-card">
            <Text>Shared Page-only CSS: this card stays purple on Red and Blue.</Text>
            <View className={styles.badge}>CSS Module: this badge stays yellow on Red and Blue.</View>
        </View>
    )
}
