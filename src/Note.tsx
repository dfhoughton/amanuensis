import React, { ChangeEvent } from 'react'
import { deepClone, anyDifference } from './modules/clone'
import { NoteRecord, ContentSelection, SourceRecord, CitationRecord, KeyPair } from './modules/types'
import SwitchBoard from './modules/switchboard'
import { TT } from './modules/util'

import Autocomplete from '@material-ui/lab/Autocomplete'
import Chip from '@material-ui/core/Chip'
import TextField from '@material-ui/core/TextField'
import { makeStyles } from '@material-ui/core/styles'

import { Star, StarBorder, Save } from '@material-ui/icons'
import { App } from './App'

const hash = require('object-hash')

interface NoteProps {
    app: App,
}

export interface NoteState extends NoteRecord {
    unsavedContent: boolean,
    project: number,
    citationIndex: number,
}

class Note extends React.Component<NoteProps, NoteState> {
    savedState: NoteState
    debouncedCheckSavedState: () => void
    checkSavedState: () => void
    app: App
    constructor(props: Readonly<NoteProps>) {
        super(props);
        this.app = props.app
        const visit = this.app.recentHistory()
        if (visit) {
            const { current, saved } = deepClone(visit)
            this.state = current
            this.savedState = saved
            this.checkForDeletions()
        } else {
            this.state = this.nullState()
            this.savedState = this.nullState() // used as basis of comparison to see whether the record is dirty
        }
        this.app.switchboard.addActions({
            selection: (msg) => { this.showSelection(msg) }
        })
        // make a debounced function that checks to see whether the note is dirty and needs a save
        let i: NodeJS.Timeout | undefined
        this.checkSavedState = () => this.setState({ unsavedContent: anyDifference(this.state, this.savedState, "unsavedContent", "citationIndex") })
        this.debouncedCheckSavedState = function () {
            if (i) {
                clearInterval(i)
            }
            i = setTimeout(this.checkSavedState, 200)
        }
    }

    render() {
        const hasWord = this.hasWord()
        return (
            <div className="note">
                <Header time={this.currentCitation()?.when} switchboard={this.app.switchboard} project={this.state.project} />
                <StarWidget
                    starred={this.state.starred}
                    unsaved={this.state.unsavedContent}
                    star={() => this.star()}
                    save={() => this.saveNote()}
                />
                <Phrase phrase={this.currentCitation()} hasWord={hasWord} />
                <Annotations
                    gist={this.state.gist}
                    details={this.state.details}
                    gistHandler={(e) => { this.setState({ gist: e.target.value }); this.debouncedCheckSavedState() }}
                    notesHandler={(e) => { this.setState({ details: e.target.value }); this.debouncedCheckSavedState() }}
                />
                <Tags note={this} />
                <Relations relations={this.state.relations} hasWord={hasWord} />
                <Citations citations={this.state.citations} hasWord={hasWord} />
            </div>
        );
    }

    componentWillUnmount() {
        this.app.makeHistory(this.state, this.savedState)
        this.app.switchboard.removeActions("selection")
    }

    nullState(): NoteState {
        return {
            project: 0, // "namespace" for the note; project indices map to names; e.g., "German"; project 0 is the default
            gist: "", // the most important notes about the phrase
            details: "", // less essential notes about the phrase
            tags: [], // tags used to categorize phrases
            citations: [], // instances this *particular* phrase, after normalization, has been found
            relations: {},
            starred: false,
            unsavedContent: false,
            citationIndex: 0,
        }
    }

    // check to see whether any information relevant to the display of this note has changed
    // since it was last displayed
    checkForDeletions() {
        if (this.isSaved()) {
            this.app.switchboard.index?.find(this.currentCitation().phrase, this.state.project)
                .then((response) => {
                    switch (response.state) {
                        case 'ambiguous':
                        case 'found':
                            break
                        case 'none':
                            this.savedState = this.nullState()
                            const newState = {
                                unsavedContent: true,
                                relations: {},
                                project: this.state.project,
                                citations: deepClone(this.state.citations.slice(0,1))
                            }
                            if (!this.app.switchboard.index?.reverseProjectIndex.has(this.state.project)) {
                                newState.project = 0 // set to the default project
                            }
                            this.setState(newState)
                            this.app.notify("this note is no longer saved")
                            break
                    }
                })
                .catch((error) => this.app.error(error))
        }
    }

    currentCitation(): CitationRecord {
        return this.state.citations[this.state.citationIndex]
    }

    hasWord(): boolean {
        return !!(this.currentCitation()?.phrase && /\S/.test(this.currentCitation().phrase))
    }

    isSaved(): boolean {
        return !!this.savedState.citations.length
    }

    star() {
        this.setState({ starred: !this.state.starred })
        this.checkSavedState()
    }

    showSelection({ selection, source }: { selection: ContentSelection, source: SourceRecord }) {
        const citation: CitationRecord = {
            source,
            ...selection,
            when: [new Date()],
        }
        this.app.switchboard.index?.find(selection.phrase, this.state.project)
            .then((found) => {
                switch (found.state) {
                    case "found":
                        const foundState: NoteState = {
                            project: found.project,
                            unsavedContent: true,
                            citationIndex: 0,
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
                            project: 0,
                            details: "",
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
            .catch((error) => this.app.error(error))
    }

    saveNote() {
        if (!this.state.unsavedContent) {
            return
        }
        const data = deepClone(this.state, "unsavedContent", "project")
        this.app.switchboard.index?.add({ phrase: this.currentCitation().phrase, project: this.state.project, data: data }).then(() => {
            this.savedState = deepClone(this.state)
            this.setState({ unsavedContent: false })
        })
    }

    // obtain all the tags ever used
    allTags() {
        return Array.from(this.app.switchboard.index?.tags || []).sort()
    }
}

export default Note;

const headerStyles = makeStyles((theme) => ({
    root: {

    },
    date: {
        textAlign: 'right',
        fontSize: 'smaller',
        color: theme.palette.grey[500],
    }
}))

function Header(props: { time?: Date[], switchboard: SwitchBoard, project: number }) {
    const { time, switchboard, project: realm } = props
    const classes = headerStyles()
    let t = time ? time[0] : null, date
    const project = switchboard.index?.reverseProjectIndex.get(realm)
    return <div className={classes.root}>
        <div>{project}</div>
        <div className={classes.date}>
            {t?.toLocaleDateString()}
        </div>
    </div>
}

const widgetStyles = makeStyles((theme) => ({
    root: {
        display: 'table',
        float: 'right',
        lineHeight: '1.2rem',
        fontSize: 'small',
        textAlign: 'center',
    },
    save: {
        color: theme.palette.warning.dark
    },
    unstarred: {
        color: theme.palette.grey[500]
    },
}))

function StarWidget(props: { starred: boolean, unsaved: boolean, star: () => void, save: () => void }) {
    const classes = widgetStyles()
    const star = props.starred ? <Star color="secondary" /> : <StarBorder className={classes.unstarred} />
    const save = !props.unsaved ?
        null :
        <div onClick={props.save}>
            <TT msg="save unsaved content" placement="left">
                <Save className={classes.save} />
            </TT>
        </div>
    return <div className={classes.root}>
        <div onClick={props.star}><TT msg="bookmark" placement="left">{star}</TT></div>
        {save}
    </div>
}

const phraseStyles = makeStyles((theme) => ({
    root: {

    },
    word: {
        backgroundColor: theme.palette.secondary.light,
    }
}))

function Phrase({ hasWord, phrase }: { hasWord: boolean; phrase: CitationRecord; }) {
    const classes = phraseStyles()
    if (hasWord) {
        return (
            <div className={classes.root}>
                <span>{phrase.before}</span>
                <span className={classes.word}>{phrase.phrase}</span>
                <span>{phrase.after}</span>
            </div>
        )
    } else {
        return <div className={classes.root}>No phrase</div>
    }
}

const tagStyles = makeStyles((theme) => ({
    root: {
        width: 500,
        '& > * + *': {
            marginTop: theme.spacing(2),
        },
    },
}))

function Tags(props: { note: Note }) {
    const classes = tagStyles()
    const { note } = props
    const { tags } = note.state
    if (!note.hasWord()) {
        return null
    }
    let options: string[]
    if (note.app.switchboard.index?.tags) {
        options = Array.from(note.app.switchboard.index.tags)
    } else {
        options = []
    }
    return <div className={classes.root}>
        <Autocomplete
            multiple
            id="tags"
            options={options.sort()}
            value={tags}
            onChange={(_event, tags) => { note.setState({ tags }); note.checkSavedState() }}
            freeSolo
            size="small"
            renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                    <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                ))
            }
            renderInput={(params) => (
                <TextField {...params} variant="filled" label="Tags" placeholder="category" />
            )}
        />
    </div>
}

function Citations(props: { hasWord: boolean; citations: CitationRecord[]; }) {
    if (!props.hasWord) {
        return null
    }
    const citations = props.citations.slice(0, props.citations.length).map((cite) => {
        return ( // should include date, and it should be possible to delete a citation
            <li key={hash(cite.source.url)}>
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

function Annotations(
    { gist, details, gistHandler, notesHandler }: {
        gist: string,
        details: string,
        gistHandler: (e: ChangeEvent<HTMLInputElement>) => void,
        notesHandler: (e: ChangeEvent<HTMLTextAreaElement>) => void
    }) {
    return <div>
        <TextField
            label="Gist"
            id="gist"
            multiline
            placeholder="Essential information about this topic."
            style={{ width: "100%" }}
            rowsMax={2}
            value={gist}
            onChange={gistHandler}
        />
        <TextField
            label="Elaboration"
            id="details"
            multiline
            placeholder="Further observations about this topic."
            style={{ width: "100%" }}
            rowsMax={6}
            value={details}
            onChange={notesHandler}
        />
    </div>
}

function Relations(props: { hasWord: boolean; relations: { [name: string]: KeyPair[] } }) {
    if (!props.hasWord) {
        return null
    }
    // TODO we need to pass in a function as well that allows the modification of relations
    // the switchboard and project are in here to facilitate lazily loading in the instances of the relation
    const relations = Object.entries(props.relations).map(([k, v],) => <li key={k}>{k}</li>)
    return (
        <ul className="relations">
            {relations}
        </ul>
    );
}
