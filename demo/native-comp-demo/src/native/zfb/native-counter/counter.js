Component({
    props: {
        count: 0,
        onIncrement: () => undefined
    },

    methods: {
        increment() {
            this.props.onIncrement({
                value: this.props.count + 1
            })
        }
    }
})
