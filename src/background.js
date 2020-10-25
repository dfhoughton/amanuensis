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
    }
}

function handleContentMessage(msg) {
    switch (msg.action) {
        case 'selection':
            if (state.connected) {
                chrome.tabs.query({active: true}, (tabs) => {
                    const tab = tabs[0]
                    if (tab) {
                        state.popupPort.postMessage({...msg, tab})
                    }
                })
            }
            break
    }
}

chrome.extension.onConnect.addListener(function (port) {
    port.onMessage.addListener(function (msg) {
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
        switch (port.name) {
            case "popup":
                state.connected = false
                break
        }
    })
});