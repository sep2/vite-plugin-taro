const { scrollCb, setMdText, setQueryTowxmlNodeFn, setStreamFinish, stopImmediatelyCb } = require('./towxml/globalCb')

// This mutable registry lets Towxml's virtualization query sibling adapter instances without moving the React list into WXML.
const towxmlInstances = new Set()

setQueryTowxmlNodeFn.value = (callback) => {
    const queries = [...towxmlInstances].map((component) => {
        return new Promise((resolve) => {
            wx.createSelectorQuery()
                .in(component)
                .select('.towxml-host')
                .boundingClientRect((node) => {
                    resolve(node)
                })
                .exec()
        })
    })

    Promise.all(queries).then((nodes) => {
        callback(nodes.filter(Boolean))
    })
}

function syncMarkdown(component) {
    setMdText(component.data.towxmlId, component.data.initialMarkdown + component.streamMarkdown)
}

function appendMarkdownChunk(component) {
    const chunk = component.data.markdownChunk
    if (!chunk || chunk.sequence <= component.lastChunkSequence) return
    component.lastChunkSequence = chunk.sequence
    component.streamMarkdown += chunk.value
    syncMarkdown(component)
}

function finishStream(component) {
    if (component.data.streamFinished) {
        setStreamFinish(component.data.towxmlId)
    }
}

function stopTypewriter(component) {
    if (component.data.stopRequested) {
        stopImmediatelyCb(component.data.towxmlId)
    }
}

Component({
    options: {
        styleIsolation: 'shared'
    },
    properties: {
        towxmlId: {
            type: String,
            value: ''
        },
        initialMarkdown: {
            type: String,
            value: ''
        },
        markdownChunk: {
            type: Object,
            value: { sequence: 0, value: '' }
        },
        speed: {
            type: Number,
            value: 6
        },
        openTyper: {
            type: Boolean,
            value: true
        },
        theme: {
            type: String,
            value: 'light'
        },
        streamFinished: {
            type: Boolean,
            value: false
        },
        stopRequested: {
            type: Boolean,
            value: false
        },
        scrollTop: {
            type: Number,
            value: 0
        },
        trackScroll: {
            type: Boolean,
            value: false
        }
    },
    data: {
        // This mutable flag delays child creation until its global Markdown store has been primed.
        renderTowxml: false
    },
    observers: {
        initialMarkdown() {
            syncMarkdown(this)
        },
        markdownChunk() {
            appendMarkdownChunk(this)
        },
        streamFinished() {
            finishStream(this)
        },
        stopRequested() {
            stopTypewriter(this)
        },
        scrollTop(scrollTop) {
            if (this.data.trackScroll) {
                scrollCb({ detail: { scrollTop } })
            }
        }
    },
    lifetimes: {
        created() {
            // These mutable instance fields accumulate bounded React chunks entirely inside the native component.
            this.streamMarkdown = ''
            this.lastChunkSequence = -1
        },
        attached() {
            towxmlInstances.add(this)
        },
        ready() {
            appendMarkdownChunk(this)
            syncMarkdown(this)
            this.setData({ renderTowxml: true }, () => {
                // Re-sync after child creation because Towxml initializes its stream flags during ready().
                syncMarkdown(this)
                finishStream(this)
                stopTypewriter(this)
                this.triggerEvent('ready', { towxmlId: this.data.towxmlId })
            })
        },
        detached() {
            towxmlInstances.delete(this)
        }
    },
    methods: {
        handleFinish(event) {
            this.triggerEvent('finish', event.detail)
        },
        handleHistoryMessageFinish(event) {
            this.triggerEvent('historyMessageFinish', event.detail)
        }
    }
})
