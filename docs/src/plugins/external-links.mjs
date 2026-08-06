export function externalLinks() {
    return (tree) => addExternalLinkAttributes(tree)
}

function addExternalLinkAttributes(node) {
    if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href
        if (typeof href === 'string' && /^https?:\/\//.test(href)) {
            // Replacing the properties object keeps the transformation local to this link node.
            node.properties = {
                ...node.properties,
                target: '_blank',
                rel: ['noopener', 'noreferrer']
            }
        }
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) addExternalLinkAttributes(child)
    }
}
