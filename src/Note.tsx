import React from 'react'
import { deepClone, anyDifference } from './modules/clone'
import { NoteRecord, Chrome, CitationRecord } from './modules/types'
import SwitchBoard from './modules/switchboard'

interface NoteProps {
    switchboard: SwitchBoard
}

interface NoteState extends NoteRecord {
    unsavedContent: boolean,
    realm: number,
}

/*global chrome*/
class Note extends React.Component<NoteProps, NoteState> {
    switchboard: SwitchBoard;
    savedState: NoteState;
    constructor(props: Readonly<NoteProps>) {
        super(props);
        this.switchboard = props.switchboard;
        this.state = {
            realm: 0, // "namespace" for the note; realm indices map to names; e.g., "German"; realm 0 is the default
            note: "", // notes about the phrase
            tags: [], // tags used to categorize phrases
            citations: [], // instances this *particular* phrase, after normalization, has been found
            relations: {},
            starred: false,
            unsavedContent: false,
        }
        this.savedState = deepClone(this.state) // used as basis of comparison to see whether the record is dirty
        this.switchboard.addActions({
            selection: (msg) => { this.showSelection(msg) }
        })
    }

    checkForUnsavedContent() {
        this.setState({ unsavedContent: anyDifference(this.state, this.savedState, "unsavedContent") })
    }

    currentCitation(): CitationRecord {
        return this.state.citations[0]
    }

    render() {
        const hasWord = !!this.state.citations[0].phrase;
        return (
            <div className={"note"}>
                <span className={`star${this.state.starred ? ' starred' : ''}`} onClick={() => this.star()} />
                <span className={`dot${this.state.starred ? ' filled' : ''}`} onClick={() => this.saveNote()} />
                <Phrase phrase={this.currentCitation().phrase} hasWord={hasWord} />
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
        this.switchboard.index.find(selection.phrase, this.state.realm)
            .then((found) => {
                switch (found.state) {
                    case "found":
                        // will need to set state
                        break
                    case "none":
                        // TODO announce somehow that we couldn't find anything
                        break
                    case "ambiguous":
                        // TODO ask user to choose the realm
                        break
                }
            })
            .catch((error) => {
                console.error(error) // TODO improve error handling
            })
        // chrome.storage.local.get(this.normalize(selection.phrase), (result) => {
        //     let newState, found = result && result.citations
        //     if (found) {
        //         newState = {
        //             ...citation,
        //             ...result,
        //             unsavedContent: false, // FIXME -- need to think about this
        //         }
        //     } else {
        //         newState = {
        //             ...citation,
        //             starred: false,
        //             tags: [],
        //             note: '',
        //             citations: [],
        //             relations: [],
        //             unsavedContent: true,
        //         }
        //     }
        //     newState.savedState = null
        //     newState.savedState = deepClone(newState, 'savedState', 'when')
        //     console.log(newState)
        //     this.setState(newState)
        // })
    }

    // have we seen this selection before on this page?
    sameCitation(c) {
        const current = this.currentCitation()
        const { source, selection } = current
        return current.phrase === c.selection.phrase &&
            current.before === c.selection.before &&
            current.after === c.selection.after &&
            source.title === c.tab.title &&
            source.url === c.tab.url &&
            selection.path === c.path &&
            !anyDifference(selection.anchor, c.anchor) &&
            !anyDifference(selection.focus, c.focus)
    }

    saveNote() {
        if (!this.state.unsavedContent) {
            return
        }
        const data = deepClone(this.state, "unsavedContent", "realm")
        this.switchboard.index.add({ phrase: this.currentCitation().phrase, realm: this.state.realm, data: data }).then(() => {
            this.savedState = deepClone(this.state)
            this.setState({ unsavedContent: false })
        })
    }

    // report the outcome of some action 
    report(level, msg) {
        console.log({ level, msg })
    }

    // obtain all the tags ever used
    allTags() {
        return Array.from(this.switchboard.index.tags).sort()
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
    const citations = props.citations.slice(1, props.citations.length).map((step, cite) => {
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
