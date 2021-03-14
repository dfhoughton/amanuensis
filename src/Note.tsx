import React, { ChangeEvent, useState } from 'react'

import Autocomplete from '@material-ui/lab/Autocomplete'
import Chip from '@material-ui/core/Chip'
import TextField from '@material-ui/core/TextField'
import { makeStyles } from '@material-ui/core/styles'
import { Collapse, Fade, Grid, Menu, MenuItem, Popover, Typography as T } from '@material-ui/core'
import { Delete, ExpandMore, FilterCenterFocus, Navigation, Save, UnfoldLess, UnfoldMore } from '@material-ui/icons'

import { deepClone, anyDifference } from './modules/clone'
import { NoteRecord, ContentSelection, SourceRecord, CitationRecord, KeyPair, Query } from './modules/types'
import SwitchBoard from './modules/switchboard'
import { debounce, Expando, formatDates, Mark, sameNote, TT } from './modules/util'
import { App, Visit } from './App'
import { enkey } from './modules/storage'

interface NoteProps {
    app: App,
}

export interface NoteState extends NoteRecord {
    unsavedContent: boolean,
    everSaved: boolean,
    unsavedCitation: boolean,
    citationIndex: number,
}

class Note extends React.Component<NoteProps, NoteState> {
    savedState: NoteState
    app: App
    debouncedCheckSavedState: () => void
    focusing: CitationRecord | null
    constructor(props: Readonly<NoteProps>) {
        super(props)
        this.focusing = null
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
        this.app.switchboard.addActions("note", {
            selection: (msg) => { this.showSelection(msg) },
            reloaded: (msg) => { this.focused(msg.url) },
            noSelection: (msg) => { this.app.urlSearch() },
        })
        // make a debounced function that checks to see whether the note is dirty and needs a save
        this.debouncedCheckSavedState = debounce()(() => this.checkSavedState())
    }

    render() {
        const hasWord = this.hasWord()
        return (
            <div className="note">
                {hasWord && <Header note={this} />}
                {hasWord && <Widgets app={this.props.app} n={this} />}
                <Phrase phrase={this.currentCitation()} hasWord={hasWord} />
                {hasWord && <Annotations
                    gist={this.state.gist}
                    details={this.state.details}
                    citationNote={this.currentCitation()?.note || ''}
                    citationNoteHandler={(e) => {
                        const citations = deepClone(this.state.citations)
                        citations[this.state.citationIndex].note = e.target.value
                        this.setState({ citations }, this.debouncedCheckSavedState)
                    }}
                    gistHandler={(e) => this.setState({ gist: e.target.value }, this.debouncedCheckSavedState)}
                    notesHandler={(e) => this.setState({ details: e.target.value }, this.debouncedCheckSavedState)}
                />}
                <Tags note={this} />
                <Relations relations={this.state.relations} hasWord={hasWord} />
                <Citations note={this} />
            </div>
        );
    }

    // bring a citation into focus
    focus() {
        this.focusing = this.currentCitation()
        this.app.switchboard.send({ action: 'goto', citation: this.focusing })
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
        this.app.switchboard.removeActions("note", ["selection", "focused", "reloaded", "noSelection"])
    }

    checkSavedState() {
        this.setState({
            unsavedContent: anyDifference(this.state, this.savedState, "unsavedContent", "citationIndex", "everSaved", "unsavedCitation")
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
                                        this.savedState = { unsavedContent: false, unsavedCitation: false, everSaved: true, citationIndex: 0, ...response.match }
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
                                        this.setState({ relations }, () => this.checkSavedState())
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

    focused(url: string) {
        const citation = this.currentCitation()
        if (citation?.source.url === url) {
            this.focusing = null
            this.app.switchboard.send({ action: 'select', selection: citation })
        }
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
                            unsavedCitation: true,
                            citationIndex: 0,
                            ...found.match,
                        }
                        const index = mergeCitation(foundState, citation)
                        if (index === undefined) {
                            foundState.citationIndex = foundState.citations.length - 1
                        } else {
                            foundState.citationIndex = index
                            foundState.unsavedCitation = false
                        }
                        this.app.setState({ search: query, searchResults: [found.match] })
                        this.setState(foundState)
                        break
                    case "none":
                        this.app.setState({ search: query, searchResults: [] })
                        const newState = nullState()
                        newState.unsavedCitation = true
                        newState.key[0] = this.app.state.defaultProject
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

    // move the current unsaved citation to a new project
    changeProject(pk: number) {
        if (!this.state.unsavedCitation) {
            this.app.error('once a citation is saved with a note, its project cannot be changed')
            return
        }
        const citation = deepClone(this.state.citations[this.state.citations.length - 1])
        this.app.switchboard.index!.find({ type: 'lookup', phrase: '' })
            .then((result) => {
                let previousNote: NoteRecord | undefined
                switch (result.type) {
                    case 'ambiguous':
                        previousNote = result.matches.find((n) => n.key[0] === pk)
                        break
                    case 'found':
                        if (result.match.key[0] === pk) {
                            previousNote = result.match
                        }
                        break
                }
                if (previousNote) {
                    // merge the new citation into those already present
                    const index = mergeCitation(previousNote, citation)
                    let state: NoteState = { ...nullState(), ...previousNote }
                    if (index === undefined) {
                        state = { ...state, citationIndex: state.citations.length - 1, unsavedCitation: true }
                    } else {
                        state = { ...state, citationIndex: index }
                    }
                    this.setState({ ...state, everSaved: true, unsavedContent: true })
                } else {
                    const state = nullState()
                    state.citations.push(citation)
                    state.key[0] = pk
                    state.unsavedCitation = true
                    state.unsavedContent = true
                    this.setState(state)
                }
            })
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
    },
    projectPicker: {
        fontSize: '12pt',
    },
    defaultProject: {
        fontStyle: "italic",
        color: theme.palette.grey[500],
    },
}))

function Header({ note }: { note: Note }) {
    const time = note.currentCitation()?.when
    const realm = note.state.key[0]
    const classes = headerStyles()
    let t = time ? time[0] : null
    const project = note.app.switchboard.index?.reverseProjectIndex.get(realm)
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    let changer
    if (note.state.unsavedCitation || note.app.switchboard.index!.projects.size > 1) {
        const open = Boolean(anchorEl);
        const handleClick = (event: React.MouseEvent<HTMLElement>) => {
            setAnchorEl(event.currentTarget);
        };
        const closer = (i: number) => {
            return () => {
                setAnchorEl(null)
                note.changeProject(i)
            }
        }
        changer = <>
            <span onClick={handleClick} className={classes.projectPicker}><ExpandMore fontSize="inherit" /></span>
            <Menu
                anchorEl={anchorEl}
                keepMounted
                open={open}
                onClose={() => setAnchorEl(null)}
                TransitionComponent={Fade}
            >
                {Array.from(note.app.switchboard.index!.projects.values()).map((pi) =>
                    <MenuItem key={pi.pk} onClick={closer(pi.pk)} selected={pi.pk === note.state.key[0]}>
                        {pi.name ? pi.name : <span className={classes.defaultProject}>default</span>}
                    </MenuItem>)}
            </Menu>
        </>
    }
    return (
        <Grid container spacing={1}>
            <Grid container item xs>
                <T className={classes.project}>{project}</T> {/* TODO make this a selector */}
                {changer}
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
}))

function Widgets({ app, n }: { n: Note, app: App }) {
    const classes = widgetStyles()

    const t = () => {
        app.confirm({
            title: `Delete this note?`,
            text: `Delete this note concerning "${n.state.citations[0].phrase}"?`,
            callback: () => {
                return new Promise((resolve, _reject) => {
                    app.removeNote(n.state)
                    n.savedState = nullState()
                    const state: NoteState = deepClone(n.state)
                    state.relations = {}
                    state.everSaved = false
                    state.unsavedContent = true
                    n.setState(state)
                    resolve(undefined)
                })
            }
        })
    }

    const saveWidget = !n.state.unsavedContent ?
        null :
        <div onClick={() => n.saveNote()}>
            <TT msg="save unsaved content" placement="left">
                <Save className={classes.save} />
            </TT>
        </div>
    const deleteWidget = !n.state.everSaved ?
        null :
        <div onClick={t}><Delete className={classes.delete} /></div>
    return (
        <div className={classes.root}>
            <Nav app={app} n={n} />
            {saveWidget}
            {deleteWidget}
        </div>
    )
}

const navStyles = makeStyles((theme) => ({
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
    },
}))

function Nav({ app, n }: { app: App, n: Note }) {
    const [anchorEl, setAnchorEl] = React.useState<null | Element>(null);
    if (app.state.history.length < 1) {
        return null
    }
    const classes = navStyles()
    const open = Boolean(anchorEl);
    const id = open ? 'simple-popover' : undefined;
    return (
        <div>
            <span className={classes.arrow} onClick={(event) => { setAnchorEl(event.currentTarget) }}>
                <Navigation color="primary" id="nav" />
            </span>
            <Popover
                id={id}
                open={open}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
            >
                <div className={classes.nav}>
                    <div className={classes.focus} onClick={() => n.focus()}>
                        <FilterCenterFocus color="primary" />
                    </div>
                    {app.state.history.map((v) => <HistoryLink v={v} app={app} n={n} />)}
                </div>
            </Popover>
        </div>
    )
}

const historyLinkStyles = makeStyles((theme) => ({
    root: {
        cursor: 'pointer',
        display: 'table',
        margin: '0 auto',
    },
    current: {
        backgroundColor: theme.palette.secondary.light,
    }
}))

function HistoryLink({ v, app, n }: { v: Visit, app: App, n: Note }) {
    const classes = historyLinkStyles()
    const note = app.currentNote()
    const currentKey = note && sameNote(note, v.current)
    const callback = () => {
        if (!currentKey) {
            app.goto(v.current, () => {
                const visit = app.recentHistory()
                n.savedState = visit!.saved
                n.setState(visit!.current)
            })
        }
    }
    const cz = currentKey ? `${classes.root} ${classes.current}` : classes.root
    return (
        <div key={enkey(v.current.key)} onClick={callback} className={cz}>
            {v.current.citations[0].phrase}
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
            onChange={(_event, tags) => note.setState({ tags }, () => note.checkSavedState())}
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

function Citations({ note }: { note: Note }) {
    return <div>{note.state.citations.map((c, i) => <Cite note={note} i={i} c={c} />)}</div>
}

const citationsStyles = makeStyles((theme) => ({
    cell: {
        fontSize: 'smaller',
    },
    first: {
        fontWeight: 'bold',
        cursor: 'pointer',
    },
    current: {
        fontWeight: 'bold',
        backgroundColor: theme.palette.secondary.light,
    },
    repeat: {
        color: theme.palette.grey[500],
        cursor: 'pointer',
    },
    date: {
        color: theme.palette.grey[500]
    },
}))

function Cite({ note, i, c }: { note: Note, i: number, c: CitationRecord }) {
    const classes = citationsStyles()
    const current = i === note.state.citationIndex
    let cz = classes.first
    if (current) {
        cz = classes.current
    } else if (i > 0 && c.phrase === note.state.citations[i - 1].phrase) {
        cz = classes.repeat
    }
    let cb
    if (!current) {
        cb = () => note.setState({ citationIndex: i })
    }
    const key = `${note.state.key[0]}:${note.state.key[1]}:${i}`
    return (
        <Grid container spacing={1} key={key}>
            <Grid item xs={2} className={cz} onClick={cb}>
                <Expando text={c.phrase} id={`${key}-phrase`} className={classes.cell} />
            </Grid>
            <Grid item xs={3}>
                <Expando text={c.source.title} id={`${key}-phrase`} className={classes.cell} />
            </Grid>
            <Grid item xs={5}>
                <Expando text={c.source.url} id={`${key}-phrase`} className={classes.cell} />
            </Grid>
            <Grid item xs={2} className={classes.date}>
                <Expando text={formatDates(c.when)} id={`${key}-phrase`} className={classes.cell} />
            </Grid>
        </Grid>
    )
}

const annotationStyles = makeStyles((theme) => ({
    note: {
        width: "100%"
    },
    unfolder: {
        cursor: 'pointer',
    },
    centering: {
        display: 'flex',
        alignItems: 'center',
    },
    centered: {
        display: 'table',
        margin: 'auto auto',
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
    const [showMore, setShowMore] = useState(false)
    const showerOpts = {
        className: classes.unfolder,
        onClick: () => setShowMore(!showMore)
    }
    return <div>
        <Collapse in={showMore}>
            <TextField
                label="Note on Citation"
                id="citation-note"
                placeholder="Notes on the citation above"
                className={classes.note}
                rowsMax={2}
                value={citationNote}
                onChange={citationNoteHandler}
            />
        </Collapse>
        <Grid container>
            <Grid item xs={11}>
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
            </Grid>
            <Grid item xs={1} className={classes.centering}>
                <div className={classes.centered}>
                    {showMore ? <UnfoldMore {...showerOpts} /> : <UnfoldLess {...showerOpts} />}
                </div>
            </Grid>
        </Grid>
        <Collapse in={showMore}>
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
        </Collapse>
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
        key: [0, 0], // "namespace" and primary key for the note; project indices map to names; e.g., "German"; project 0 is the default; 0 represents an unsaved note
        gist: "", // the most important notes about the phrase
        details: "", // less essential notes about the phrase
        tags: [], // tags used to categorize phrases
        citations: [], // instances this *particular* phrase, after normalization, has been found
        relations: {},
        unsavedContent: false,
        everSaved: false,
        unsavedCitation: false,
        citationIndex: 0,
    }
}

// add a new citation to an existing record
function mergeCitation(note: NoteRecord, citation: CitationRecord): number | undefined {
    let match: CitationRecord | null = null
    let index: number | undefined
    const { source, selection } = citation
    for (let i = 0; i < note.citations.length; i++) {
        const c = note.citations[i]
        if (citation.phrase === c.phrase &&
            citation.before === c.before &&
            citation.after === c.after &&
            source.title === c.source.title &&
            source.url === c.source.url &&
            selection.path === c.selection.path &&
            !anyDifference(selection.anchor, c.selection.anchor) &&
            !anyDifference(selection.focus, c.selection.focus)
        ) {
            index = i
            match = c
            break
        }
    }
    if (match) {
        match.when.unshift(citation.when[0])
    } else {
        note.citations.unshift(citation)
    }
    return index
}