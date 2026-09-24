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
        <div className={`${styles.botanicalSprig} ${placementClasses[placement]}`} aria-hidden="true">
            <div className={`${styles.botanicalStem} bg-primary-stem`} />
            <div className={`${styles.botanicalLeaf} ${styles.botanicalLeafOne} bg-botanical-leaf`} />
            <div className={`${styles.botanicalLeaf} ${styles.botanicalLeafTwo} bg-botanical-leaf`} />
            <div className={`${styles.botanicalLeaf} ${styles.botanicalLeafThree} bg-botanical-leaf`} />
            <div className={`${styles.botanicalLeaf} ${styles.botanicalLeafFour} bg-botanical-leaf`} />
            <div className={styles.botanicalFlower}>
                <div className={`${styles.botanicalPetal} ${styles.botanicalPetalOne} bg-petal`} />
                <div className={`${styles.botanicalPetal} ${styles.botanicalPetalTwo} bg-petal`} />
                <div className={`${styles.botanicalPetal} ${styles.botanicalPetalThree} bg-petal`} />
                <div className={`${styles.botanicalPetal} ${styles.botanicalPetalFour} bg-petal`} />
                <div className={`${styles.botanicalFlowerCenter} bg-sun`} />
            </div>
        </div>
    )
}
