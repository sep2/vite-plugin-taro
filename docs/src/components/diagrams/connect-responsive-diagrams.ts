type LinkKind = 'static' | 'dynamic' | 'dependency' | 'flow'

interface DiagramLink {
    from: string
    to: string
    kind: LinkKind
    label?: string
}

interface DiagramSpec {
    name: string
    selector: string
    links: readonly DiagramLink[]
}

interface Point {
    x: number
    y: number
}

interface AnchoredLink extends DiagramLink {
    start: Point
    end: Point
    isHorizontal: boolean
}

interface RenderedLink extends DiagramLink {
    path: string
    labelPosition: Point
}

const findNode = (container: HTMLElement, name: string): HTMLElement => {
    const node = container.querySelector<HTMLElement>(`[data-node="${name}"]`)
    if (node === null) {
        throw new Error(`Missing diagram node: ${name}`)
    }
    return node
}

const center = (rect: DOMRect, frame: DOMRect): Point => ({
    x: rect.left - frame.left + rect.width / 2,
    y: rect.top - frame.top + rect.height / 2
})

const verticalAnchors = (from: DOMRect, to: DOMRect, frame: DOMRect): readonly [Point, Point] => {
    const fromCenter = center(from, frame)
    const toCenter = center(to, frame)
    const movesDown = toCenter.y >= fromCenter.y
    return movesDown
        ? [
              { x: fromCenter.x, y: from.bottom - frame.top },
              { x: toCenter.x, y: to.top - frame.top }
          ]
        : [
              { x: fromCenter.x, y: from.top - frame.top },
              { x: toCenter.x, y: to.bottom - frame.top }
          ]
}

const horizontalAnchors = (from: DOMRect, to: DOMRect, frame: DOMRect): readonly [Point, Point] => {
    const fromCenter = center(from, frame)
    const toCenter = center(to, frame)
    const movesRight = toCenter.x >= fromCenter.x
    return movesRight
        ? [
              { x: from.right - frame.left, y: fromCenter.y },
              { x: to.left - frame.left, y: toCenter.y }
          ]
        : [
              { x: from.left - frame.left, y: fromCenter.y },
              { x: to.right - frame.left, y: toCenter.y }
          ]
}

const anchorLink = (container: HTMLElement, frame: DOMRect, link: DiagramLink): AnchoredLink => {
    const fromRect = findNode(container, link.from).getBoundingClientRect()
    const toRect = findNode(container, link.to).getBoundingClientRect()
    const fromCenter = center(fromRect, frame)
    const toCenter = center(toRect, frame)
    const isHorizontal = Math.abs(toCenter.x - fromCenter.x) > Math.abs(toCenter.y - fromCenter.y)
    const [start, end] = isHorizontal
        ? horizontalAnchors(fromRect, toRect, frame)
        : verticalAnchors(fromRect, toRect, frame)
    return { ...link, start, end, isHorizontal }
}

const groupLinks = (links: readonly AnchoredLink[]): ReadonlyMap<string, readonly AnchoredLink[]> => {
    // This local mutable map builds shared connector trunks once, then remains read-only during rendering.
    const groups = new Map<string, AnchoredLink[]>()
    links.forEach((link) => {
        const key = `${link.from}-${link.isHorizontal ? 'horizontal' : 'vertical'}`
        const group = groups.get(key)
        if (group === undefined) {
            groups.set(key, [link])
            return
        }
        group.push(link)
    })
    return groups
}

const renderHorizontalLink = (
    link: AnchoredLink,
    group: readonly AnchoredLink[],
    drawsSharedTrunk: boolean
): RenderedLink => {
    const middleX = (link.start.x + group[0].end.x) / 2
    const pathStart = drawsSharedTrunk
        ? `M ${link.start.x} ${link.start.y} H ${middleX}`
        : `M ${middleX} ${link.start.y}`
    return {
        ...link,
        path: `${pathStart} V ${link.end.y} H ${link.end.x}`,
        labelPosition: { x: middleX, y: (link.start.y + link.end.y) / 2 }
    }
}

const renderVerticalLink = (
    link: AnchoredLink,
    group: readonly AnchoredLink[],
    drawsSharedTrunk: boolean
): RenderedLink => {
    const nearestEndY = Math.min(...group.map(({ end }) => end.y))
    const middleY = link.start.y + (nearestEndY - link.start.y) * 0.5
    const pathStart = drawsSharedTrunk
        ? `M ${link.start.x} ${link.start.y} V ${middleY}`
        : `M ${link.start.x} ${middleY}`
    return {
        ...link,
        path: `${pathStart} H ${link.end.x} V ${link.end.y}`,
        labelPosition: { x: (link.start.x + link.end.x) / 2, y: middleY }
    }
}

const renderLinks = (container: HTMLElement, frame: DOMRect, links: readonly DiagramLink[]): RenderedLink[] => {
    const anchoredLinks = links.map((link) => anchorLink(container, frame, link))
    const groups = groupLinks(anchoredLinks)

    return anchoredLinks.map((link) => {
        const key = `${link.from}-${link.isHorizontal ? 'horizontal' : 'vertical'}`
        const group = groups.get(key) ?? [link]
        const drawsSharedTrunk = group[0] === link
        return link.isHorizontal
            ? renderHorizontalLink(link, group, drawsSharedTrunk)
            : renderVerticalLink(link, group, drawsSharedTrunk)
    })
}

const svgNamespace = 'http://www.w3.org/2000/svg'

const createSvgElement = <Name extends keyof SVGElementTagNameMap>(
    name: Name,
    attributes: Readonly<Record<string, string>>
): SVGElementTagNameMap[Name] => {
    const element = document.createElementNS(svgNamespace, name)
    Object.entries(attributes).forEach(([attribute, value]) => {
        element.setAttribute(attribute, value)
    })
    return element
}

const createMarker = (markerId: string): SVGMarkerElement => {
    const marker = createSvgElement('marker', {
        id: markerId,
        viewBox: '0 0 10 10',
        refX: '9',
        refY: '5',
        markerWidth: '5',
        markerHeight: '5',
        orient: 'auto-start-reverse'
    })
    marker.append(createSvgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z' }))
    return marker
}

const createLinkPath = (link: RenderedLink, markerId: string): SVGPathElement =>
    createSvgElement('path', {
        class: `diagram-link diagram-link-${link.kind}`,
        'data-from': link.from,
        'data-to': link.to,
        d: link.path,
        ...(link.kind === 'flow' ? { 'marker-end': `url(#${markerId})` } : {})
    })

const createLinkLabel = (link: RenderedLink): SVGTextElement => {
    const label = createSvgElement('text', {
        class: `diagram-link-label diagram-link-label-${link.kind}`,
        x: String(link.labelPosition.x),
        y: String(link.labelPosition.y - 6),
        'text-anchor': 'middle'
    })
    label.textContent = link.label ?? ''
    return label
}

const renderDiagram = ({ name, selector, links }: DiagramSpec): void => {
    const container = document.querySelector<HTMLElement>(selector)
    const svgElement = container?.querySelector<SVGSVGElement>(':scope > [data-diagram-links]')
    if (container === null || container === undefined || svgElement === null || svgElement === undefined) {
        return
    }

    const frame = svgElement.getBoundingClientRect()
    if (frame.width === 0 || frame.height === 0) {
        return
    }

    const renderedLinks = renderLinks(container, frame, links)
    const markerId = `diagram-arrow-${name}`
    const paths = renderedLinks.map((link) => createLinkPath(link, markerId))
    const labels = renderedLinks.filter((link) => link.label !== undefined).map(createLinkLabel)

    svgElement.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`)
    svgElement.replaceChildren(createMarker(markerId), ...paths, ...labels)
}

export function connectResponsiveDiagrams(diagramSpecs: readonly DiagramSpec[]): () => void {
    const renderDiagrams = (): void => diagramSpecs.forEach(renderDiagram)
    const diagramElements = diagramSpecs
        .map(({ selector }) => document.querySelector<HTMLElement>(selector))
        .filter((element): element is HTMLElement => element !== null)

    // One mutable frame handle coalesces font and resize events into a single geometry pass per paint.
    let renderFrame: number | undefined
    // This lifecycle flag prevents a resolved font promise from reviving a disconnected diagram.
    let isConnected = true

    const scheduleRender = (): void => {
        if (!isConnected || renderFrame !== undefined) return
        renderFrame = requestAnimationFrame(() => {
            renderFrame = undefined
            renderDiagrams()
        })
    }

    const resizeObserver = new ResizeObserver(scheduleRender)
    diagramElements.forEach((element) => {
        resizeObserver.observe(element)
    })
    void document.fonts.ready.then(scheduleRender)
    scheduleRender()

    return () => {
        isConnected = false
        resizeObserver.disconnect()
        if (renderFrame !== undefined) cancelAnimationFrame(renderFrame)
    }
}
