import { getIndex, Index } from "./storage"
import { Chrome, Payload, Port } from "./types"

type Handler = (data?: any) => void

// the communication device shared among components
export default class Switchboard {
    actions: { [action: string]: { [source: string]: Handler } }
    queue: (() => void)[] | null
    chrome: Chrome
    port: Port | null
    index: Index | null

    constructor(chrome: Chrome) {
        this.actions = {}
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
    // send a message back the other way
    send(msg: Payload) {
        this.then(() => {
            this.port!.postMessage(msg)
        })
    }
    addActions(source: string, actions: { [prop: string]: Handler }) {
        for (const [action, handler] of Object.entries(actions)) {
            let handlers = this.actions[action]
            if (handlers === undefined) {
                handlers = {}
                this.actions[action] = handlers
            }
            handlers[source] = handler
        }
    }
    removeActions(source: string, actions: string[]) {
        for (const action of actions) {
            let handlers = this.actions[action]
            if (handlers) {
                delete handlers[source]
            }
        }
    }
    mounted(): Promise<void> {
        this.port = this.chrome.runtime.connect({ name: "popup" })
        this.port.onMessage.addListener((msg) => {
            let handlers = this.actions[msg.action]
            if (handlers) {
                for (const handler of Object.values(handlers)) {
                    handler(msg)
                }
            }
            // _ is a special identifier for the default handlers that handle all messages
            handlers = this.actions._
            if (handlers) {
                for (const handler of Object.values(handlers)) {
                    handler(msg)
                }
            }
        })
        // the channel doesn't open until you send a message down it
        this.port.postMessage({ action: "open" })
        return new Promise((resolve, reject) => {
            // prepare to handle messages
            getIndex(this.chrome)
                .then((index) => {
                    this.index = index
                    // handle all tasks that were awaiting initialization
                    while (this.queue?.length) {
                        (this.queue.shift() as () => void)()
                    }
                    this.queue = null
                    resolve()
                })
                .catch((error) => reject(error))
        })
    }
    // rebuild the index from storage; useful when restoring from a file, for instance
    rebootIndex(): Promise<void> {
        return new Promise((resolve, reject) => {
            getIndex(this.chrome)
                .then((index) => {
                    this.index = index
                    resolve()
                })
                .catch((e) => reject(e))
        })
    }
}
