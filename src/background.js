const state = {
    contentPort: null,
    popupPort: null,
}

function sendToContent(msg) {
    state.contentPort?.postMessage(msg)
}
function sendToPopup(msg) {
    state.popupPort?.postMessage(msg)
}

function handlePopupMessage(msg) {
    switch (msg.action) {
        case 'open':
            chrome.tabs.query({ active: true }, (tabs) => {
                const tab = tabs[0]
                if (tab) {
                    const { url } = tab
                    sendToContent({ action: 'getSelection' })
                    sendToPopup({ action: 'url', url })
                }
            })
            break
        case 'goto':
        case 'select':
            sendToContent(msg)
            break
    }
}

function handleContentMessage(msg) {
    switch (msg.action) {
        case 'selection':
            chrome.tabs.query({ active: true }, (tabs) => {
                const tab = tabs[0]
                if (tab) {
                    const { title, url } = tab
                    sendToPopup({ ...msg, source: { title, url } })
                }
            })
            break
        case 'open':
            // this should be a reload, but send back the active URL to confirm it's what the popup expects
            chrome.tabs.query({ active: true }, (tabs) => {
                const tab = tabs[0]
                if (tab) {
                    const { url } = tab
                    sendToPopup({ action: 'reloaded', url })
                }
            })
            break
        case 'noSelection':
        case 'error':
            sendToPopup(msg)
            break
    }
}

chrome.runtime.onConnect.addListener(function (port) {
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
                state.popupPort = null
                break
            case "content":
                state.contentPort = null
                break
        }
    })
});