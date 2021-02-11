import React, { ChangeEvent, SetStateAction } from 'react'
import { deepClone, anyDifference } from './modules/clone'
import { NoteRecord, ContentSelection, SourceRecord, CitationRecord, KeyPair, Query } from './modules/types'
import SwitchBoard from './modules/switchboard'
import { debounce, Mark, TT } from './modules/util'

import Autocomplete from '@material-ui/lab/Autocomplete'
import Chip from '@material-ui/core/Chip'
import TextField from '@material-ui/core/TextField'
import { makeStyles } from '@material-ui/core/styles'

import { Delete, FilterCenterFocus, Navigation, Save } from '@material-ui/icons'
import { App } from './App'
import { Grid, Popover, Typography as T } from '@material-ui/core'
import { enkey } from './modules/storage'

const hash = require('object-hash')

interface NoteProps {
    app: App,
}

export interface NoteState extends NoteRecord {
    unsavedContent: boolean,
    everSaved: boolean,
    citationIndex: number,
}

class Note extends React.Component<NoteProps, NoteState> {
    savedState: NoteState
    app: App
    debouncedCheckSavedState: () => void
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
            this.state = nullState()
            this.savedState = nullState() // used as basis of comparison to see whether the record is dirty
        }
        this.app.switchboard.addActions({
            selection: (msg) => { this.showSelection(msg) }
        })
        // make a debounced function that checks to see whether the note is dirty and needs a save
        this.debouncedCheckSavedState = debounce()(() => this.checkSavedState())
    }

    render() {
        const hasWord = this.hasWord()
        console.log("rendering this note:", this.state)
        return (
            <div className="note">
                <Header time={this.currentCitation()?.when} switchboard={this.app.switchboard} project={this.state.key[0]} />
                <StarWidget
                    starred={this.state.starred}
                    anyUnsaved={this.state.unsavedContent}
                    everSaved={this.state.everSaved}
                    star={() => this.star()}
                    save={() => this.saveNote()}
                    trash={() => {
                        this.app.confirm({
                            title: `Delete this note?`,
                            text: `Delete this note concerning "${this.state.citations[0].phrase}"?`,
                            callback: () => {
                                this.app.removeNote(this.state)
                                return true
                            }
                        })
                    }}
                />
                <Phrase phrase={this.currentCitation()} hasWord={hasWord} />
                <Annotations
                    gist={this.state.gist}
                    details={this.state.details}
                    citationNote={this.currentCitation()?.note || ''}
                    citationNoteHandler={(e) => {
                        const citations = deepClone(this.state.citations)
                        citations[this.state.citationIndex].note = e.target.value
                        this.setState({ citations })
                        this.debouncedCheckSavedState()
                    }}
                    gistHandler={(e) => { this.setState({ gist: e.target.value }); this.debouncedCheckSavedState() }}
                    notesHandler={(e) => { this.setState({ details: e.target.value }); this.debouncedCheckSavedState() }}
                />
                <Tags note={this} />
                <Relations relations={this.state.relations} hasWord={hasWord} />
                <Citations citations={this.state.citations} hasWord={hasWord} />
            </div>
        );
    }

    componentDidMount() {
        if (!this.state.everSaved) {
            this.app.switchboard.then(() => {
                const key = deepClone(this.state.key)
                key[0] = this.app.switchboard.index!.currentProject
                this.setState({ key })
            })
        }
    }

    componentWillUnmount() {
        this.app.makeHistory(this.state, this.savedState)
        this.app.switchboard.removeActions("selection")
    }

    checkSavedState() {
        this.setState({
            unsavedContent: anyDifference(this.state, this.savedState, "unsavedContent", "citationIndex")
        })
    }

    // check to see whether any information relevant to the display of this note has changed
    // since it was last displayed
    checkForDeletions() {
        if (this.state.everSaved) {
            this.app.switchboard.index?.find({ type: "lookup", phrase: this.currentCitation().phrase, project: this.state.key[0] })
                .then((response) => {
                    switch (response.type) {
                        case 'ambiguous':
                            // this should be unreachable since we have a project at this point
                            this.app.warn("unexpected state found in checkForDeletions") // TODO we probably don't want this in the wild
                            break
                        case 'found':
                            // check to see whether any of the citations are missing
                            // TODO make sure this works
                            const keys = new Set(
                                Object.values(this.state.relations).reduce(
                                    (acc: string[], pairs) => acc.concat(pairs.map(p => enkey(p))),
                                    []
                                )
                            )
                            this.app.switchboard.index?.missing(keys)
                                .then((missing) => {
                                    if (missing.size) {
                                        this.savedState = { unsavedContent: false, everSaved: true, citationIndex: 0, ...response.match }
                                        const relations = deepClone(this.state.relations)
                                        for (let [k, v] of Object.entries(relations)) {
                                            let ar = v as KeyPair[]
                                            ar = ar.filter((p) => !missing.has(enkey(p)))
                                            if (ar.length) {
                                                relations[k] = ar
                                            } else {
                                                delete relations[k]
                                            }
                                        }
                                        this.setState({ relations })
                                        this.checkSavedState()
                                        this.app.notify("some relations have been deleted")
                                    }
                                })
                                .catch((error) => this.app.error(`Error when looking for missing relations: ${error}`))
                            break
                        case 'none':
                            this.savedState = nullState()
                            const newState = {
                                key: deepClone(this.state.key),
                                unsavedContent: true,
                                relations: {},
                                citations: deepClone(this.state.citations.slice(0, 1))
                            }
                            if (!this.app.switchboard.index?.reverseProjectIndex.has(this.state.key[0])) {
                                newState.key[0] = 0 // set to the default project
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

    star() {
        this.setState({ starred: !this.state.starred })
        this.checkSavedState()
    }

    showSelection({ selection, source }: { selection: ContentSelection, source: SourceRecord }) {
        const citation: CitationRecord = {
            source,
            note: '',
            ...selection,
            when: [new Date()],
        }
        const query: Query = { type: "lookup", phrase: selection.phrase, project: this.state.key[0] }
        this.app.switchboard.index!.find(query)
            .then((found) => {
                switch (found.type) {
                    case "found":
                        const foundState: NoteState = {
                            unsavedContent: true,
                            everSaved: true,
                            citationIndex: 0,
                            ...found.match,
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
                        this.app.setState({ search: query, searchResults: [found.match] })
                        this.setState(foundState)
                        break
                    case "none":
                        this.app.setState({ search: query, searchResults: [] })
                        const newState = nullState()
                        newState.unsavedContent = true
                        newState.citations.push(citation)
                        this.setState(newState)
                        break
                    case "ambiguous":
                        this.app.setState({ tab: 2, search: query, searchResults: found.matches })
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
        this.app.switchboard.index?.add({ phrase: this.currentCitation().phrase, project: this.state.key[0], data: data }).then((pk) => {
            this.savedState = deepClone(this.state)
            const key = deepClone(this.state.key)
            key[1] = pk
            this.savedState.key = key
            this.setState({ key, unsavedContent: false, everSaved: true })
        })
    }

    // obtain all the tags ever used
    allTags() {
        return Array.from(this.app.switchboard.index?.tags || []).sort()
    }
}

export default Note;

const headerStyles = makeStyles((theme) => ({
    project: {
        fontSize: 'smaller',
        fontWeight: 'bold',
        color: theme.palette.grey[500],
    },
    date: {
        fontSize: 'smaller',
        width: '100%',
        color: theme.palette.grey[500],
    }
}))

function Header(props: { time?: Date[], switchboard: SwitchBoard, project: number }) {
    const { time, switchboard, project: realm } = props
    const classes = headerStyles()
    let t = time ? time[0] : null, date
    const project = switchboard.index?.reverseProjectIndex.get(realm)
    return (
        <Grid container spacing={1}>
            <Grid container item xs>
                <TT msg="project"><T className={classes.project}>{project}</T></TT> {/* TODO make this a selector */}
            </Grid>
            <Grid container item xs>
                <T align="right" className={classes.date}>
                    {t?.toLocaleDateString()} {/* TODO make this a list of dates */}
                </T>
            </Grid>
        </Grid>
    )
}

const widgetStyles = makeStyles((theme) => ({
    root: {
        display: 'table',
        float: 'right',
        lineHeight: '1.2rem',
        fontSize: 'small',
        textAlign: 'center',
    },
    star: {
        cursor: "pointer",
    },
    save: {
        cursor: "pointer",
        color: theme.palette.warning.dark
    },
    delete: {
        cursor: "pointer",
        color: theme.palette.error.dark
    },
    arrow: {
        cursor: 'pointer',
    },
    nav: {
        padding: theme.spacing(1)
    },
    focus: {
        cursor: "pointer",
        display: "table",
        margin: "0 auto",
        marginBottom: theme.spacing(0.1),
    }
}))

function StarWidget({ starred, anyUnsaved, everSaved, star, save, trash }:
    { starred: boolean, anyUnsaved: boolean, everSaved: boolean, star: () => void, save: () => void, trash: () => void }) {
    const classes = widgetStyles()
    const [anchorEl, setAnchorEl] = React.useState<null | Element>(null);

    const open = Boolean(anchorEl);
    const id = open ? 'simple-popover' : undefined;

    const saveWidget = !anyUnsaved ?
        null :
        <div onClick={save}>
            <TT msg="save unsaved content" placement="left">
                <Save className={classes.save} />
            </TT>
        </div>
    const deleteWidget = !everSaved ?
        null :
        <div onClick={trash}><Delete className={classes.delete} /></div>
    return (
        <div className={classes.root}>
            <div onClick={star} className={classes.star}><TT msg="bookmark" placement="left"><Mark starred={starred} /></TT></div>
            <span className={classes.arrow} onClick={(event) => { setAnchorEl(event.currentTarget) }}>
                <Navigation color="primary" id="nav" />
            </span>
            <Popover
                id={id}
                open={open}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{
                    vertical: 'center',
                    horizontal: 'center',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <div className={classes.nav}>
                    <div className={classes.focus}>
                        <FilterCenterFocus color="primary"/>
                    </div>
                    stuff
                </div>
            </Popover>
            {saveWidget}
            {deleteWidget}
        </div>
    )
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
    text: {
        width: '100%',
        marginTop: theme.spacing(1),
        '&:first-child': {
            marginTop: 0,
        }
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
    return (
        <Autocomplete
            id="clone-form-relations"
            className={classes.text}
            options={options}
            value={tags}
            onChange={(_event, tags) => { note.setState({ tags }); note.checkSavedState() }}
            multiple
            freeSolo
            autoComplete
            renderInput={(params) => <TextField {...params} label="Tags" placeholder="category" />}
            renderTags={
                (value, getTagProps) =>
                    value.map((obj, index) => <Chip variant="outlined" size="small" label={obj} {...getTagProps({ index })} />)
            }
        />
    )

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

const annotationStyles = makeStyles((theme) => ({
    note: {
        width: "100%"
    }
}))

function Annotations(
    { gist, details, citationNote, gistHandler, notesHandler, citationNoteHandler }: {
        gist: string,
        citationNote: string,
        details: string,
        citationNoteHandler: (e: ChangeEvent<HTMLInputElement>) => void,
        gistHandler: (e: ChangeEvent<HTMLInputElement>) => void,
        notesHandler: (e: ChangeEvent<HTMLTextAreaElement>) => void
    }) {
    const classes = annotationStyles();
    return <div>
        <TextField
            label="Note on Citation"
            id="citation-note"
            placeholder="Notes on the citation above"
            className={classes.note}
            rowsMax={2}
            value={citationNote}
            onChange={citationNoteHandler}
        />
        <TextField
            label="Gist"
            id="gist"
            multiline
            placeholder="Essential information about this topic"
            className={classes.note}
            rowsMax={2}
            value={gist}
            onChange={gistHandler}
        />
        <TextField
            label="Elaboration"
            id="details"
            multiline
            placeholder="Further observations about this topic"
            className={classes.note}
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

export function nullState(): NoteState {
    return {
        key: [0, -1], // "namespace" and primary key for the note; project indices map to names; e.g., "German"; project 0 is the default; -1 represents an unsaved note
        gist: "", // the most important notes about the phrase
        details: "", // less essential notes about the phrase
        tags: [], // tags used to categorize phrases
        citations: [], // instances this *particular* phrase, after normalization, has been found
        relations: {},
        starred: false,
        unsavedContent: false,
        everSaved: false,
        citationIndex: 0,
    }
}

