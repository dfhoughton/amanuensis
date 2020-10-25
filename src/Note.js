import React from 'react'
import { deepClone, anyDifference } from './modules/clone'

/*global chrome*/
class Note extends React.Component {
    constructor(props) {
        super();
        this.switchboard = props.switchboard;
        const nullState = {
            phrase: {},
            realm: 0, // "namespace" for the note; realm indices map to names; e.g., "German"; realm 0 is the default
            note: "", // notes about the phrase
            tags: [], // tags used to categorize phrases
            citations: [], // instances this *particular* phrase, after normalization, has been found
            relations: {},
            starred: false,
            unsavedContent: false,
            source: null,
        }
        this.savedState = deepClone(nullState) // used as basis of comparison to see whether the record is dirty
        this.switchboard.addActions({
            selection: (msg) => { this.showSelection(msg) }
        })
    }

    checkForUnsavedContent() {
        this.setState({ unsavedContent: anyDifference(this.state, this.savedState) })
    }

    render() {
        const hasWord = !!this.state.phrase.word;
        return (
            <div className={"note"}>
                <span className={`star${this.state.starred ? ' starred' : ''}`} onClick={() => this.star()} />
                <span className={`dot${this.state.starred ? ' filled' : ''}`} onClick={() => this.saveNote()} />
                <Phrase phrase={this.state.phrase} hasWord={hasWord} />
                {/* annotations needed here */}
                <Tags tags={this.state.tags} hasWord={hasWord} />
                <Citations citations={this.state.citations} hasWord={hasWord} />
                <Relations relations={this.state.relations} hasWord={hasWord} />
            </div>
        );
    }

    star() {
        this.setState({ starred: !this.state.starred })
        this.checkForUnsavedContent()
    }

    showSelection({ selection, tab }) {
        const citation = {
            source: { selection, tab: { title: tab.title, url: tab.url }, when: [new Date()] },
            phrase: { before: selection.before, after: selection.after, word: selection.phrase },
        }
        let existing = this.index.find(selection.phrase)
        if (existing) {
            // we've seen this phrase before
            if (existing.length === 1) {
                // and only in one realm
            } else {
                // we need the user to choose a realm
            }
        } else {
            // this is the first time we've seen this phrase
        }
        chrome.storage.local.get(this.normalize(selection.phrase), (result) => {
            let newState, found = result && result.citations
            if (found) {
                newState = {
                    ...citation,
                    ...result,
                    unsavedContent: false, // FIXME -- need to think about this
                }
            } else {
                newState = {
                    ...citation,
                    starred: false,
                    tags: [],
                    note: '',
                    citations: [],
                    relations: [],
                    unsavedContent: true,
                }
            }
            newState.savedState = null
            newState.savedState = deepClone(newState, 'savedState', 'when')
            console.log(newState)
            this.setState(newState)
        })
    }

    // have we seen this selection before on this page?
    sameCitation(c) {
        return this.state.phrase.word === c.selection.phrase &&
            this.state.phrase.before === c.selection.before &&
            this.state.source.tab.title === c.tab.title &&
            this.state.source.url === c.tab.url &&
            this.state.source.path === c.path &&
            !anyDifference(this.state.source.anchor, c.anchor) &&
            !anyDifference(this.state.source.focus, c.focus)
    }

    saveNote() {
        if (!this.state.unsavedContent) {
            // no-op
            return
        }
        // TODO
        // check to see whether we already have this citation
        let found = false
        const savedState = { ...this.state }
        delete savedState.phrase
        delete savedState.source
        delete savedState.savedState
        delete savedState.unsavedContent
        savedState.citations = savedState.citations.splice()
        for (let i = 0; i < savedState.citations.length; i++) {
            const c = savedState.citations[i]
            if (this.sameCitation(c)) {
                found = true
                // just store the latest timestamp
                c.when = c.when.splice()
                c.when.push(this.source.when[0])
                break
            }
        }
        if (!found) {
            savedState.citations.push(this.source)
        }
        chrome.storage.local.set(this.normalize(this.state.phrase.word), savedState, () => {
            const newState = deepClone(this.state, 'savedState')
            newState.unsavedContent = false
            newState.savedState = deepClone(newState, 'savedState')
            this.setState(newState)
            this.report("success", "saved note")
        })
    }

    // report the outcome of some action 
    report(level, msg) {
        console.log({ level, msg })
    }

    // obtain all the tags ever used
    allTags(callback) {
        chrome.storage.local.get(null, (results) => {
            const tags = new Set()
            for (let i = 0; i < results.length; i++) {
                const r = results[i]
                for (let j = 0; j < r.tags.length; j++) {
                    tags.add(r.tags[j])
                }
            }
            callback(tags)
        })
    }
}

export default Note;

function Phrase(props) {
    if (props.hasWord) {
        const phrase = { ...props.phrase };
        return (
            <div className="phrase">
                <span className="before">{phrase.before}</span>
                <span className="word">{phrase.word}</span>
                <span className="after">{phrase.after}</span>
            </div>
        )
    } else {
        return <div className="phrase no-phrase">No phrase</div>
    }
}

function Tags(props) {
    if (!props.hasWord) {
        return null
    }
    const tags = props.tags.slice(0, props.tags.length).map((step, tag) => {
        return (
            <li key={tag}>
                {tag}
            </li>
        )
    });
    return (
        <ul className="tags">
            {tags}
        </ul>
    );
}

function Citations(props) {
    if (!props.hasWord) {
        return null
    }
    const citations = props.citations.slice(0, props.citations.length).map((step, cite) => {
        const citation = { ...cite };
        return ( // should include date, and it should be possible to delete a citation
            <li key={citation.url}>
                {citation.url}
            </li>
        )
    });
    return (
        <ul className="citations">
            {citations}
        </ul>
    );
}

function Relations(props) {
    if (!props.hasWord) {
        return null
    }
    const relations = props.relations.slice(0, props.relations.length).map((step, pal) => {
        // relations are stored as an object whose keys are relationship types and whose values are lists
        // each object in the list consists of a phrase, a realm, and index, and optionally a note
        const relation = { ...pal };
        return (
            <li key={relation.word}>
                {relation.word}
            </li>
        )
    });
    return (
        <ul className="relations">
            {relations}
        </ul>
    );
}
