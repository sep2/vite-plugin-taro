import { View } from 'virtual:taro/components'
import styles from './botanical-sprig.module.css'

const placementClasses = {
    top: styles.botanicalSprigTop,
    side: styles.botanicalSprigSide,
    cta: styles.botanicalSprigCta
} as const

interface BotanicalSprigProps {
    placement: keyof typeof placementClasses
}

export function BotanicalSprig({ placement }: BotanicalSprigProps) {
    return (
        <View className={`${styles.botanicalSprig} ${placementClasses[placement]}`} aria-hidden="true">
            <View className={`${styles.botanicalStem} bg-primary-stem`} />
            <View className={`${styles.botanicalLeaf} ${styles.botanicalLeafOne} bg-botanical-leaf`} />
            <View className={`${styles.botanicalLeaf} ${styles.botanicalLeafTwo} bg-botanical-leaf`} />
            <View className={`${styles.botanicalLeaf} ${styles.botanicalLeafThree} bg-botanical-leaf`} />
            <View className={`${styles.botanicalLeaf} ${styles.botanicalLeafFour} bg-botanical-leaf`} />
            <View className={styles.botanicalFlower}>
                <View className={`${styles.botanicalPetal} ${styles.botanicalPetalOne} bg-petal`} />
                <View className={`${styles.botanicalPetal} ${styles.botanicalPetalTwo} bg-petal`} />
                <View className={`${styles.botanicalPetal} ${styles.botanicalPetalThree} bg-petal`} />
                <View className={`${styles.botanicalPetal} ${styles.botanicalPetalFour} bg-petal`} />
                <View className={`${styles.botanicalFlowerCenter} bg-sun`} />
            </View>
        </View>
    )
}
