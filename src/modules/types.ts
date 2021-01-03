export interface CitationRecord {
    // some text extracted at the moment of selection
    // this is saved for display and summary and because if pages change Selection objects may cease to work
    phrase: string,       // the text selected
    before: string,       // the context preceding the selection
    after: string,        // the context following the selection
    when: Date[],         // the times that this selection was looked up *on the same page*
    selection: Selection  // where the text was found on the page
    source: SourceRecord, // the page where the text was found
}

// a representation of a selection
export interface Selection {
    path: string, // somewhat optimized/generalized CSS selector to find the common parent node holding the anchor and focus
    anchor: Node, // where the selection starts
    focus: Node,  // where the selection ends
}

// representing the anchor or focus of a selection
export interface Node {
    path: string,          // a CSS selector providing an *absolute* path (relative to a common parent) of the DOM node which is contains the relevant text node
    offset: number,        // the character offset from the beginning of the relevant text node
    parentOffset?: number, // the index of the relevant text node among the children of the parent node -- absent of the point in question is not within a text node
}

export interface SourceRecord {
    url: string,   // the URL the selection was found on
    title: string, // the chrome extension provides this, and it may be useful for display and summary
}

export type KeyPair = [projectKey: number, phraseKey: number]

export interface NoteRecord {
    gist: string,                             // essential notes about a phrase
    details: string,                          // free-form notes on the phrase -- an elaboration on the gist
    tags: string[],                           // closed-class tags categorizing the phrase
    citations: CitationRecord[],              // all the times this phrase has been looked up
    relations: { [name: string]: KeyPair[] }, // relations of this phrase to other phrases
    starred: boolean,                         // whether this phrase is marked as of particular interest
}

export interface ProjectInfo {
    pk: number,                    // the primary key (unique identifier) of the project
    name: string,                  // a human-readable primary key
    description: string,           // a description of the project's contents
    normalizer: string,            // the name of the Normalizer the project uses
    relations: [string, string][], // the relations the project recognizes
}

export type ProjectIdentifier = string | number | ProjectInfo;

export interface Normalizer {
    pk: number,
    name: string,
    description: string,
    code: (phrase: string) => string,
}

// the sort of string-keyed object typically given as a parameter to chrome extension API methods
export type Payload = { [key: string]: any }

// a port for communication over the chrome extension API
export interface Port {
    onMessage: {
        addListener: (callback: (message: Payload) => void) => void,
    }
    postMessage: (message: Payload) => void
}

// the Chrome extension API (the portion of it which we use)
export interface Chrome {
    storage: {
        local: {
            get: (key: string[], callback: (arg: any) => void) => void,
            set: (vals: Payload, callback?: () => void) => void,
            clear: (callback?: () => void) => void,
            getBytesInUse: (arg: null, callback: (bytes: number) => void) => void,
        }
    },
    extension: {
        connect: (params: { [key: string]: string }) => Port,
    }
    runtime: { lastError: string },
}

export interface ContentSelection {
    phrase: string,
    before: string,
    after: string,
    selection: Selection
}