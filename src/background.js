const rule1 = {
    conditions: [
        new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { schemes: ['https', 'http'] }
        })
    ],
    actions: [new chrome.declarativeContent.ShowPageAction()]
}
chrome.runtime.onInstalled.addListener(function () {
    chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
        chrome.declarativeContent.onPageChanged.addRules([rule1])
    })
})
const state = {
    contentPort: null,
    popupPort: null,
    connected: false,
}

function handlePopupMessage(msg) {
    switch (msg.action) {
        case 'open':
            state.connected = true
            state.contentPort.postMessage({ action: 'getSelection' })
            break
        case 'goto':
            state.contentPort?.postMessage(msg)
            break
        case 'select':
            state.contentPort.postMessage(msg)
            break
    }
}

function handleContentMessage(msg) {
    switch (msg.action) {
        case 'selection':
            if (state.connected) {
                chrome.tabs.query({ active: true }, (tabs) => {
                    const tab = tabs[0]
                    if (tab) {
                        const { title, url } = tab
                        state.popupPort.postMessage({ ...msg, source: { title, url } })
                    }
                })
            }
            break
        case 'open':
            if (state.connected) {
                // this should be a reload, but send back the active URL to confirm it's what the popup expects
                chrome.tabs.query({ active: true }, (tabs) => {
                    const tab = tabs[0]
                    if (tab) {
                        const { url } = tab
                        state.popupPort.postMessage({ action: 'reloaded', url })
                    }
                })
            }
            break
        case 'error':
            if (state.connected) {
                state.popupPort.postMessage(msg)
            }
            break
        case 'ready':
            if (state.connected) {
                state.popupPort.postMessage(msg)
            }
    }
}

chrome.extension.onConnect.addListener(function (port) {
    port.onMessage.addListener(function (msg) {
        console.log(port.name, msg)
        switch (port.name) {
            case "content":
                state.contentPort = port
                handleContentMessage(msg)
                break
            case "popup":
                state.popupPort = port
                handlePopupMessage(msg)
                break
        }
    });
    port.onDisconnect.addListener(function () {
        console.log(port.name, 'disconnect')
        switch (port.name) {
            case "popup":
                state.connected = false
                break
        }
    })
});