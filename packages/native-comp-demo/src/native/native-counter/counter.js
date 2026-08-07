Component({
    options: {
        multipleSlots: true
    },

    properties: {
        count: {
            type: Number,
            value: 0
        }
    },

    methods: {
        increment() {
            this.triggerEvent('increment', {
                value: this.properties.count + 1
            })
        }
    }
})
