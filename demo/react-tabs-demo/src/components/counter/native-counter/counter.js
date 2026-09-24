Component({
    properties: {
        count: {
            type: Number,
            value: 0
        }
    },

    methods: {
        decrement() {
            this.triggerEvent('decrement')
        },

        increment() {
            this.triggerEvent('increment')
        }
    }
})
