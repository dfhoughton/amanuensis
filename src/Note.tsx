import React from 'react'
import { deepClone, anyDifference } from './modules/clone'
import { NoteRecord, ContentSelection, SourceRecord, CitationRecord, KeyPair } from './modules/types'
import SwitchBoard from './modules/switchboard'

interface NoteProps {
    switchboard: SwitchBoard
}

interface NoteState extends NoteRecord {
    unsavedContent: boolean,
    realm: number,
}

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
        const hasWord = !!this.currentCitation()?.phrase;
        return (
            <div className={"note"}>
                <span className={`star${this.state.starred ? ' starred' : ''}`} onClick={() => this.star()} />
                <span className={`dot${this.state.starred ? ' filled' : ''}`} onClick={() => this.saveNote()} />
                <Phrase phrase={this.currentCitation()} hasWord={hasWord} />
                <Annotations note={this.state.note} />
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

    showSelection({ selection, source }: { selection: ContentSelection, source: SourceRecord }) {
        const citation: CitationRecord = {
            source,
            ...selection,
            when: [new Date()],
        }
        this.switchboard.index?.find(selection.phrase, this.state.realm)
            .then((found) => {
                switch (found.state) {
                    case "found":
                        const foundState: NoteState = {
                            realm: found.realm,
                            unsavedContent: true,
                            ...found.record,
                        }
                        // look for an earlier citation identical to this
                        let match: CitationRecord | null = null
                        const { source, selection } = citation
                        for (let i = 0; i < foundState.citations.length; i++) {
                            const c = foundState.citations[i]
                            if (citation.phrase === c.phrase &&
                                citation.before === c.before &&
                                citation.after === c.after &&
                                source.title === c.source.title &&
                                source.url === c.source.url &&
                                selection.path === c.selection.path &&
                                !anyDifference(selection.anchor, c.selection.anchor) &&
                                !anyDifference(selection.focus, c.selection.focus)
                            ) {
                                match = c
                                break
                            }
                        }
                        if (match) {
                            match.when.unshift(citation.when[0])
                        } else {
                            foundState.citations.unshift(citation)
                        }
                        this.setState(foundState)
                        break
                    case "none":
                        this.setState({
                            realm: 0,
                            note: "",
                            tags: [],
                            citations: [citation],
                            relations: {},
                            starred: false,
                            unsavedContent: true,
                        })
                        break
                    case "ambiguous":
                        // TODO ask user to choose the realm
                        break
                }
            })
            .catch((error) => {
                console.error(error) // TODO improve error handling
            })
    }

    saveNote() {
        if (!this.state.unsavedContent) {
            return
        }
        const data = deepClone(this.state, "unsavedContent", "realm")
        this.switchboard.index?.add({ phrase: this.currentCitation().phrase, realm: this.state.realm, data: data }).then(() => {
            this.savedState = deepClone(this.state)
            this.setState({ unsavedContent: false })
        })
    }

    // report the outcome of some action 
    report(level: "error" | "info" | "warn", msg: string) {
        switch (level) {
            case "error":
                console.error(msg)
                break
            case "info":
                console.log(msg)
                break
            case "warn":
                console.warn(msg)
                break
        }
    }

    // obtain all the tags ever used
    allTags() {
        return Array.from(this.switchboard.index?.tags || []).sort()
    }
}

export default Note;

function Phrase(props: { hasWord: boolean; phrase: CitationRecord; }) {
    if (props.hasWord) {
        const phrase = { ...props.phrase };
        return (
            <div className="phrase">
                <span className="before">{phrase.before}</span>
                <span className="word">{phrase.phrase}</span>
                <span className="after">{phrase.after}</span>
            </div>
        )
    } else {
        return <div className="phrase no-phrase">No phrase</div>
    }
}

function Tags(props: { hasWord: boolean; tags: string[]; }) {
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

function Citations(props: { hasWord: boolean; citations: CitationRecord[]; }) {
    if (!props.hasWord) {
        return null
    }
    const citations = props.citations.slice(1, props.citations.length).map((cite) => {
        return ( // should include date, and it should be possible to delete a citation
            <li key={cite.source.url}>
                {cite.source.url}
            </li>
        )
    });
    return (
        <ul className="citations">
            {citations}
        </ul>
    );
}

function Annotations(props: { note: string }) {
    // TODO add on-change handler
    return <textarea value={props.note}></textarea>
}

function Relations(props: { hasWord: boolean; relations: { [name: string]: KeyPair[] } }) {
    if (!props.hasWord) {
        return null
    }
    // TODO we need to pass in a function as well that allows the modification of relations
    // the switchboard and realm are in here to facilitate lazily loading in the instances of the relation
    const relations = Object.entries(props.relations).map(([k, v],) => <li key={k}>{k}</li>)
    return (
        <ul className="relations">
            {relations}
        </ul>
    );
}
