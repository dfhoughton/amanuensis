import { getIndex, Index } from "./storage"
import { Chrome, Port, Payload } from './types'

// the communication device shared among components
export default class Switchboard {
    actions: Map<string, (data?: Payload) => void>
    queue: (() => void)[]
    chrome: Chrome
    port: Port
    index: Index

    constructor(chrome: Chrome) {
        this.actions = new Map()
        this.queue = []
        this.chrome = chrome
        this.port = null
        this.index = null
    }
    // enqueue and action to perform as soon as the channel is open
    then(callback: () => void) {
        if (this.queue) {
            this.queue.push(callback)
        } else {
            callback()
        }
    }
    addActions(actions: { [prop: string]: () => void }) {
        for (const [name, action] of Object.entries(actions)) {
            this.actions.set(name, action)
        }
    }
    mounted() {
        this.port = this.chrome.extension.connect({ name: "popup" })
        this.port.onMessage.addListener((msg) => {
            this.actions.get(msg.action)?.(msg)
        });
        // the channel doesn't open until you send a message down it
        this.port.postMessage({ action: 'open' })
        // prepare to handle messages
        getIndex(this.chrome, (arg) => {
            if (typeof arg === 'string') {
                alert(arg) // TODO something nicer
            } else {
                this.index = arg
                // handle all tasks that were awaiting initialization
                while (this.queue.length) {
                    this.queue.shift()()
                }
                this.queue = null
            }
        })
    }
}