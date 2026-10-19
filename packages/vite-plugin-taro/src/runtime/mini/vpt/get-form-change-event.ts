/**
 * Taro's FormElement value updates and text-input restoration need these events without business handlers.
 * DOM hosts retain the subscription when business handlers change; SDK event binding remains platform-specific.
 * Checkbox/radio groups use ordinary business subscriptions.
 */
export function getFormChangeEvent(nodeName: string): 'input' | 'change' | undefined {
    switch (nodeName) {
        case 'input':
        case 'textarea':
            return 'input'
        case 'picker':
        case 'picker-view':
        case 'slider':
        case 'switch':
            return 'change'
        default:
            return undefined
    }
}
