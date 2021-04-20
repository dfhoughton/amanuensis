import React, { useState } from 'react'

import { App, Section } from './App'
import { flatten, sameNote, uniq, ymd, any, nws, seed } from './modules/util'
import { Details, TT, formatDates as fd, Expando } from './modules/components'
import { AdHocQuery, allPeriods, CardStack, CitationRecord, NoteRecord, RelativePeriod, SampleType, Sorter } from './modules/types'
import { enkey } from './modules/storage'
import { anyDifference, deepClone } from './modules/clone'

import {
    Box, Button, Card, CardContent, Chip, Collapse, FormControl,
    FormControlLabel, Grid, IconButton, makeStyles, MenuItem, Radio,
    RadioGroup, Switch, TextField, Typography as T
} from '@material-ui/core'
import { Autocomplete, Pagination } from '@material-ui/lab'
import { Search as SearchIcon, Visibility, Link, School, Save, Delete, Done, AllInclusive, CardGiftcard } from '@material-ui/icons'

interface SearchProps {
    app: App
}

const projectStyles = makeStyles((theme) => ({
    message: {
        display: "table",
        margin: "0 auto",
        fontStyle: "italic",
    },
    pagination: {
        display: "table",
        margin: "0 auto",
        marginTop: theme.spacing(2),
    }
}))

function Search({ app }: SearchProps) {
    const classes = projectStyles();
    const results = app.state.searchResults
    const paginate = results.length > 10
    const [page, setPage] = useState<number>(1)
    const [showSample, setShowSample] = useState<boolean>(false)
    const offset = (page - 1) * 10
    let end = offset + 10
    if (end > results.length) end = results.length
    const pagedResults = paginate ? results.slice(offset, end) : results
    return (
        <>
            <Details header="Search">
                <SearchDetails />
            </Details>
            <Form app={app} resetter={() => setPage(1)} />
            <Box marginTop={3}>
                {!!results.length && <ResultsInfo app={app} offset={offset} end={end} results={results} showSample={showSample} setShowSample={setShowSample} />}
                {!results.length && <div className={classes.message}>no notes found</div>}
                {pagedResults.map(r => <Result note={r} app={app} />)}
                {paginate && <div className={classes.pagination}>
                    <Pagination
                        count={Math.ceil(results.length / 10)}
                        size="small"
                        defaultPage={page}
                        siblingCount={0}
                        onChange={(_e, p) => setPage(p)}
                    />
                </div>}
            </Box>
        </>
    )
}

export default Search

type ResultsInfoProps = {
    app: App
    offset: number
    end: number
    results: NoteRecord[]
    showSample: boolean
    setShowSample: (v: boolean) => void
}
function ResultsInfo({ app, offset, end, results, showSample, setShowSample }: ResultsInfoProps) {
    const search = app.state.search as AdHocQuery
    const [sample, setSample] = useState<number>(1)
    const [sampleType, setSampleType] = useState<SampleType>('random')
    return (<>
        <Grid container justify="center" alignItems="center" spacing={2}>
            <Grid item>
                Notes {offset + 1} <>&ndash;</> {end} of {results.length}
            </Grid>
            {!!search.sample && <Grid item>
                <IconButton
                    size="small"
                    onClick={() => {
                        const s: AdHocQuery = deepClone(search)
                        delete s.sample
                        app.switchboard.index!.find(s)
                            .then((results) => {
                                let searchResults: NoteRecord[]
                                switch (results.type) {
                                    case 'ambiguous':
                                        searchResults = results.matches
                                        break
                                    case 'none':
                                        searchResults = []
                                        break
                                    case 'found':
                                        searchResults = [results.match]
                                        break
                                }
                                setShowSample(false)
                                app.setState({ search: s, searchResults })
                            })
                            .catch(e => app.error(e))
                    }}
                >
                    <TT msg="show all">
                        <AllInclusive color="primary" fontSize="small" />
                    </TT>
                </IconButton>
            </Grid>}
            {!search.sample && results.length > 10 && <Grid item>
                <IconButton
                    size="small"
                    onClick={() => setShowSample(!showSample)}
                >
                    <TT msg="choose a random sample">
                        <CardGiftcard color="primary" fontSize="small" />
                    </TT>
                </IconButton>
            </Grid>}
        </Grid>
        <Collapse in={showSample}>
            <Grid container justify="center" alignItems="center" spacing={2}>
                <Grid item xs={3}>
                    <TextField
                        label="Sample size"
                        type="number"
                        InputLabelProps={{ shrink: true }}
                        InputProps={{ inputProps: { min: 1, step: 1 } }}
                        value={sample}
                        onChange={(e) => {
                            const v = e.target.value ? Number.parseInt(e.target.value) : 0
                            if (v) {
                                setSample(v)
                            }
                        }} />
                </Grid>
                <Grid item xs={3}>
                    <TextField
                        label="Sample type"
                        select
                        value={sampleType}
                        style={{ width: '100%' }}
                        onChange={(e) => setSampleType(e.target.value as SampleType)}
                    >
                        {['random', 'hard', 'novel'].map((s) => <MenuItem key={s} value={s}>
                            {s}
                        </MenuItem>)}
                    </TextField>
                </Grid>
                <Grid item>
                    <Button
                        color="primary"
                        variant="outlined"
                        onClick={() => {
                            const s: AdHocQuery = deepClone(search)
                            s.sample = sample
                            s.sampleType = sampleType
                            s.seed = seed()
                            app.switchboard.index!.find(s)
                                .then((results) => {
                                    let searchResults: NoteRecord[]
                                    switch (results.type) {
                                        case 'ambiguous':
                                            searchResults = results.matches
                                            break
                                        case 'none':
                                            searchResults = []
                                            break
                                        case 'found':
                                            searchResults = [results.match]
                                            break
                                    }
                                    setShowSample(false)
                                    app.setState({ search: s, searchResults })
                                })
                                .catch(e => app.error(e))
                        }}
                    >
                        Sample
                    </Button>
                </Grid>
                <Grid item>
                    <Button
                        color="secondary"
                        variant="outlined"
                        onClick={() => setShowSample(false)}
                    >
                        Cancel
                    </Button>
                </Grid>
            </Grid>
        </Collapse>
    </>)
}

const formStyles = makeStyles((theme) => ({
    root: {

    },
    item: {
        width: '100%',
        marginTop: theme.spacing(1),
        '&:first-child': {
            marginTop: 0,
        }
    },
    centered: {
        marginTop: theme.spacing(1),
        display: 'table',
        margin: '0 auto',
    },
    inCentered: {
        marginLeft: theme.spacing(2),
        '&:first-child': {
            marginLeft: 0,
        }
    },
    sorter: {
        minWidth: '5rem',
    },
    time: {
        marginTop: theme.spacing(1),
    },
    saveSearchForm: {
        margin: theme.spacing(3),
        marginTop: theme.spacing(0),
        marginBottom: theme.spacing(2),
    },
    discard: {
        color: theme.palette.error.dark,
    }
}))

function Form({ app, resetter }: { app: App, resetter: () => void }) {
    const classes = formStyles()
    let search: AdHocQuery
    switch (app.state.search.type) {
        case "lookup":
            // convert the lookup search into an ad hoc search
            search = { type: "ad hoc", phrase: app.state.search.phrase }
            app.setState({ search })
            break
        default:
            search = deepClone(app.state.search)
            break
    }
    const findSearch = () => Array.from(app.switchboard.index!.stacks.values()).find((s) => !anyDifference(s.query, search))
    const [savedSearch, setSavedSearch] = useState<CardStack | undefined>(findSearch())
    const {
        phrase,
        after,
        before,
        url,
        tags: tagRequired,
        project = [],
        relativeTime = true,
        relativeInterpretation = "since",
        relativePeriod = "ever",
        strictness = "exact"
    } = search
    const showSorter = !!(phrase && strictness === 'similar' && app.switchboard.index!.sorters.size > 1)
    const projects = Array.from(app.switchboard.index!.reverseProjectIndex.keys())
    const tags = Array.from(app.switchboard.index!.tags).sort()
    const [showSaveSearchForm, setShowSaveSearchForm] = useState<boolean>(false)
    const [searchName, setSearchName] = useState<string | undefined>(savedSearch?.name)
    const [searchDescription, setSearchDescription] = useState<string | null>(savedSearch?.description || null)
    const reset = (s: AdHocQuery, ss?: CardStack | undefined) => {
        setSavedSearch(ss || findSearch())
        search = s
        resetter()
        setShowSaveSearchForm(false)
        setSearchName((ss || savedSearch)?.name)
        setSearchDescription((ss || savedSearch)?.description || null)
    }
    const anyResults = !!app.state.searchResults.length
    const clear = () => {
        search = { type: 'ad hoc' }
        setShowSaveSearchForm(false)
        setSearchName(undefined)
        setSearchDescription(null)
        app.setState({ search, searchResults: [] }, () => {
            const found = findSearch()
            console.log('found', found)
            setSavedSearch(found)
            setSearchName(found?.name)
        })
    }
    let searchNameError
    if (nws(searchName || '')) {
        if (!savedSearch && any(Array.from(app.switchboard.index!.stacks.values()), (s: CardStack) => s.name === searchName)) {
            searchNameError = "this is already the name of a different search"
        }
    } else {
        searchNameError = "saved searches must be named"
    }
    const savedSearchNames = Array.from(app.switchboard.index!.stacks.keys()).sort()
    return (
        <div className={classes.root}>
            {!!app.switchboard.index!.stacks.size && <TextField
                label="Saved Searches"
                select
                className={classes.item}
                value={savedSearch?.name}
                onChange={(e) => {
                    const stack = app.switchboard.index!.stacks.get(e.target.value)!
                    app.switchboard.index!.find(stack.query)
                        .then((results) => {
                            let searchResults: NoteRecord[]
                            switch (results.type) {
                                case 'none':
                                    searchResults = []
                                    break
                                case 'found':
                                    searchResults = [results.match]
                                    break
                                case 'ambiguous':
                                    searchResults = results.matches
                                    break
                            }
                            const newState = { searchResults, stack: e.target.value, search: stack.query }
                            app.setState(newState, () => reset(stack.query, stack))
                        })
                        .catch(e => app.error(e))
                }}
            >
                {savedSearchNames.map(n => <MenuItem
                    key={n}
                    value={n}
                >
                    {n}
                </MenuItem>)}
            </TextField>}
            <TextField
                id="phrase"
                label="Phrase"
                className={classes.item}
                value={phrase || ''}
                onChange={(event) => {
                    if (nws(event.target.value)) {
                        search.phrase = event.target.value
                    } else {
                        delete search.phrase
                    }
                    app.setState({ search })
                }}
            />
            { phrase && nws(phrase) && <div className={classes.centered}>
                <Grid container justify="space-between">
                    <Grid item>
                        <FormControl component="fieldset">
                            <RadioGroup row value={strictness} onChange={(v) => {
                                switch (v.target.value) {
                                    case 'exact':
                                    case 'fuzzy':
                                    case 'substring':
                                        search.strictness = v.target.value
                                        delete search.sorter
                                        app.setState({ search })
                                        break
                                    case 'similar':
                                        search.strictness = v.target.value
                                        search.sorter = app.switchboard.index!.currentSorter
                                        app.setState({ search })
                                        break
                                }
                            }}>
                                <FormControlLabel value="exact" disabled={!phrase} control={<Radio />} label="exact" />
                                <FormControlLabel value="fuzzy" disabled={!phrase} control={<Radio />} label="fuzzy" />
                                <FormControlLabel value="substring" disabled={!phrase} control={<Radio />} label="substring" />
                                <FormControlLabel
                                    label={`similar (${app.switchboard.index!.sorters.get(search.sorter || app.switchboard.index!.currentSorter)!.name})`}
                                    value="similar"
                                    disabled={!phrase}
                                    control={<Radio />}
                                />
                            </RadioGroup>
                        </FormControl>
                        {showSorter && <TextField
                            label="Sorter"
                            select
                            className={classes.sorter}
                            size="small"
                        >
                            {
                                Array.from(app.switchboard.index!.sorters.values())
                                    .sort((a, b) => a.name < b.name ? -1 : 1)
                                    .map((s) => <SorterOption app={app} search={search} sorter={s} />)
                            }
                        </TextField>}
                    </Grid>
                </Grid>
            </div>}
            {projects.length > 1 && <Autocomplete
                id="project"
                className={classes.item}
                options={projects}
                value={project}
                multiple
                autoComplete
                getOptionLabel={(option) => app.switchboard.index!.reverseProjectIndex.get(option) || 'default'}
                renderInput={(params) => <TextField {...params} label="Projects" placeholder="project name" />}
                onChange={(_event, project) => {
                    search = deepClone(search)
                    search.project = project as number[]
                    app.setState({ search })
                }}
                renderTags={(value, getTagProps) => {
                    // not sure why this needs flattening; maybe some day I will be wiser...
                    const chips = value.map(
                        (obj, i) => <Chip
                            variant="outlined"
                            size="small"
                            label={app.switchboard.index!.reverseProjectIndex.get(obj) || 'default'} {...getTagProps({ index: i })}
                        />
                    )
                    return chips
                }}
            />}
            {!!tags.length && <Autocomplete
                id="tags-required"
                className={classes.item}
                options={tags}
                value={tagRequired || []}
                multiple
                autoComplete
                renderInput={(params) => <TextField {...params} label="Tags" placeholder="tag" />}
                onChange={(_event, newTags) => {
                    search = deepClone(search)
                    if (newTags.length) {
                        search.tags = newTags
                    } else {
                        delete search.tags
                    }
                    app.setState({ search })
                }}
                renderTags={(value, getTagProps) => value.map(
                    (obj, i) => <Chip variant="outlined" size="small" label={obj} {...getTagProps({ index: i })} />
                )}
            />}
            <Grid container justify="center" className={classes.time}>
                <Grid item>
                    <Grid component="label" container alignItems="center" spacing={1}>
                        <Grid item>Relative Time</Grid>
                        <Grid item>
                            <Switch checked={!relativeTime} onChange={() => {
                                search.relativeTime = !relativeTime
                                app.setState({ search })
                            }} />
                        </Grid>
                        <Grid item>Absolute Time</Grid>
                    </Grid>
                </Grid>
            </Grid>
            {relativeTime && <Grid container alignItems="center" justify="space-evenly" className={classes.item}>
                <Grid item>
                    <Grid component="label" container alignItems="center" spacing={1}>
                        <Grid item>Since</Grid>
                        <Grid item>
                            <Switch
                                checked={relativeInterpretation === "on"}
                                disabled={relativeInterpretation === "since" && relativePeriod === "ever"}
                                onChange={() => {
                                    search.relativeInterpretation = relativeInterpretation === "on" ? "since" : "on"
                                    app.setState({ search })
                                }}
                            />
                        </Grid>
                        <Grid item>On</Grid>
                    </Grid>
                </Grid>
                <Grid item>
                    <TextField
                        onChange={(event) => {
                            search.relativePeriod = event.target.value as RelativePeriod
                            app.setState({ search })
                        }}
                        value={relativePeriod}
                        select
                    >
                        {allPeriods.map((p) => (
                            <MenuItem
                                key={p}
                                value={p}
                                disabled={p === "ever" && relativeInterpretation === "on"}
                            >
                                {p}
                            </MenuItem>
                        ))}
                    </TextField>
                </Grid>
            </Grid>}
            {!relativeTime && <Grid container justify="space-between" className={classes.item}>
                <TextField
                    id="after"
                    label="After"
                    type="date"
                    value={ymd(after)}
                    onChange={(e) => {
                        search = deepClone(search)
                        if (e.target.value) {
                            search.after = new Date(e.target.value)
                        } else {
                            delete search.after
                        }
                        app.setState({ search })
                    }}
                    InputLabelProps={{
                        shrink: true,
                    }}
                />
                <TextField
                    id="before"
                    label="Before"
                    type="date"
                    value={ymd(before)}
                    onChange={(e) => {
                        search = deepClone(search)
                        if (e.target.value) {
                            search.before = new Date(e.target.value)
                        } else {
                            delete search.before
                        }
                        app.setState({ search })
                    }}
                    InputLabelProps={{
                        shrink: true,
                    }}
                />
            </Grid>}
            <TextField
                id="url"
                label="URL"
                className={classes.item}
                value={url || ''}
                onChange={(event) => {
                    search = deepClone(search)
                    if (nws(event.target.value)) {
                        search.url = event.target.value
                    } else {
                        delete search.url
                    }
                    app.setState({ search })
                }}
            />
            <div className={classes.centered}>
                <Grid container justify="space-evenly" className={classes.item}>
                    {anyResults && !search.sample && <IconButton
                        hidden={!anyResults || !!search.sample}
                        className={classes.inCentered}
                        onClick={() => setShowSaveSearchForm(!showSaveSearchForm)}
                    >
                        <TT msg="save search">
                            <Save color={showSaveSearchForm ? 'secondary' : 'primary'} />
                        </TT>
                    </IconButton>}
                    <Button
                        color="primary"
                        className={classes.inCentered}
                        variant="contained"
                        endIcon={<SearchIcon />}
                        onClick={() => {
                            app.switchboard.index!.find(search)
                                .then((found) => {
                                    switch (found.type) {
                                        case "none":
                                            app.setState({ searchResults: [] }, () => reset(search))
                                            break
                                        case "ambiguous":
                                            app.setState({ searchResults: found.matches }, () => reset(search))
                                            break
                                        case "found":
                                            app.setState({ searchResults: [found.match] }, () => reset(search))
                                    }
                                })
                                .catch((e) => app.error(e))
                        }}
                    >
                        Search
                    </Button>
                    <Button
                        color="secondary"
                        className={classes.inCentered}
                        variant="contained"
                        onClick={clear}
                    >
                        Clear
                    </Button>
                    {anyResults && <IconButton
                        className={classes.inCentered}
                        onClick={() => {
                            if (savedSearch && !anyDifference(savedSearch.query, search)) {
                                app.setState({ tab: Section.cards, stack: savedSearch.name })
                            } else {
                                // install a new ad hoc flashcard stack
                                const adHoc: CardStack = {
                                    name: '',
                                    description: '',
                                    lastAccess: new Date(),
                                    query: search
                                }
                                app.switchboard.index!.stacks.set('', adHoc)
                                app.setState({ tab: Section.cards, stack: '', flashcards: undefined })
                            }
                        }}
                    >
                        <TT msg="make search results into flash card stack">
                            <School color='primary' />
                        </TT>
                    </IconButton>}
                </Grid>
            </div>
            <Collapse in={showSaveSearchForm} className={classes.saveSearchForm}>
                <div className={classes.centered}>
                    <h3>Save This Search</h3>
                </div>
                <TextField
                    label="Name"
                    value={searchName}
                    InputLabelProps={{ shrink: nws(searchName || '') }}
                    className={classes.item}
                    error={!!searchNameError}
                    helperText={searchNameError}
                    onChange={(e) => setSearchName(e.target.value)}
                />
                <TextField
                    label="Description"
                    value={searchDescription}
                    InputLabelProps={{ shrink: nws(searchDescription || '') }}
                    className={classes.item}
                    onChange={(e) => setSearchDescription(e.target.value)}
                />
                <div className={classes.centered}>
                    <Button
                        color="primary"
                        variant="contained"
                        className={classes.inCentered}
                        disabled={!!searchNameError}
                        onClick={() => {
                            const name = searchName!.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ')
                            app.switchboard.index!.saveStack({
                                name,
                                description: searchDescription,
                                lastAccess: new Date(),
                                query: search
                            })
                                .then(() => {
                                    setSearchName(name)
                                    app.setState({ stack: name }, () => {
                                        app.success(`saved search "${name}"`)
                                        setShowSaveSearchForm(false)
                                    })
                                })
                                .catch(e => app.error(e))
                        }}
                    >
                        Save
                    </Button>
                    <Button
                        color="secondary"
                        variant="contained"
                        className={classes.inCentered}
                        onClick={() => setShowSaveSearchForm(false)}
                    >
                        Cancel
                    </Button>
                    {!!savedSearch && <TT msg="remove this from the saved searches">
                        <IconButton
                            className={`${classes.inCentered} ${classes.discard}`}
                            onClick={() => {
                                app.switchboard.index!.deleteStack(savedSearch!.name)
                                    .then(() => {
                                        if (app.state.stack === savedSearch!.name) {
                                            app.setState({ stack: undefined })
                                        }
                                        app.success(`discarded saved search "${savedSearch!.name}"`)
                                        setShowSaveSearchForm(false)
                                    })
                                    .catch(e => app.error(e))
                            }}
                        >
                            <Delete />
                        </IconButton>
                    </TT>}
                </div>
            </Collapse>
        </div>
    )
}

const resultStyles = makeStyles((theme) => ({
    root: {
        marginTop: theme.spacing(2),
        '&:first-child': {
            marginTop: 0,
        }
    },
    phrase: {
        fontWeight: 'bold',
    },
    navlinker: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    project: {
        textAlign: 'right',
        fontWeight: 'bold',
        color: theme.palette.grey[500],
    },
    star: {
        textAlign: 'right',
        lineHeight: '1rem',
    },
    dates: {
        fontSize: 'smaller',
        color: theme.palette.grey[500],
        marginLeft: '1rem',
    },
    tags: {
        display: 'flex',
        flexDirection: 'row-reverse',
        fontSize: 'smaller',
    },
    urls: {

    },
}))

export function Result({ note, app }: { note: NoteRecord, app: App }) {
    const classes = resultStyles()
    const project = app.switchboard.index!.projects.get(app.switchboard.index!.reverseProjectIndex.get(note.key[0]) || '');
    const key = enkey(note.key)
    return (
        <Card className={classes.root} key={key}>
            <CardContent>
                <Grid container spacing={1}>
                    <Grid item xs={5} className={classes.phrase}>
                        {note.citations[0].phrase}
                    </Grid>
                    <Grid item xs={3} className={classes.navlinker}>
                        <NavLinker note={note} app={app} />
                    </Grid>
                    <Grid item xs={4} className={classes.project}>
                        {project!.name}
                    </Grid>
                    <Grid item xs={5} className={classes.dates}>
                        {formatDates(note)}
                    </Grid>
                    <Grid item xs={6} className={classes.tags}>
                        {formatTags(note)}
                    </Grid>
                    <Grid item xs={12}>
                        <Expando id={`${key}-gist`} text={note.gist} />
                    </Grid>
                    <Grid item xs={12} className={classes.urls}>{formatUrls(note, key)}</Grid>
                </Grid>
            </CardContent>
        </Card>
    )
}

const linkerStyles = makeStyles((theme) => ({
    link: {
        marginLeft: theme.spacing(1),
        cursor: 'pointer',
    },
    goto: {
        cursor: 'pointer',
    },
    done: {
        cursor: 'pointer',
        color: theme.palette.success.dark,
    }
}))

function NavLinker({ note, app }: { note: NoteRecord, app: App }): React.ReactElement {
    const classes = linkerStyles()
    const cn = app.currentNote()
    let link
    if (cn && cn.citations.length && !sameNote(cn, note)) {
        const message = `link "${note.citations[0].phrase}" to "${cn.citations[0].phrase}"`
        link = (
            <TT msg={message}>
                <Link color="primary" fontSize="small" className={classes.link} onClick={() => app.notify('not yet implemented')} />
            </TT>
        )
    }
    return (
        <div>
            <TT msg={`go to "${note.citations[0].phrase}"`}>
                <Visibility color="secondary" fontSize="small" className={classes.goto} onClick={() => app.goto(note)} />
            </TT>
            {link}
            {!!note.done && <TT msg="Note has been removed from flashcards stacks. Click to restore.">
                <Done
                    className={classes.done}
                    onClick={() => {
                        const r: NoteRecord[] = deepClone(app.state.searchResults)
                        const n = r.find((n) => sameNote(n, note))!
                        delete n.done
                        app.switchboard.index!.save(n)
                            .then(() => {
                                app.setState({ searchResults: r })
                            })
                            .catch(e => app.error(e))
                    }}
                />
            </TT>}
        </div>
    )
}

function formatDates(note: NoteRecord): string | React.ReactElement {
    let ar: Date[] = flatten(note.citations.map((c) => c.when))
    return fd(ar)
}

function formatTags(note: NoteRecord): string {
    return note.tags.sort().join(', ')
}

function formatUrls(note: NoteRecord, key: string): React.ReactElement[] {
    return uniq(note.citations, (c: CitationRecord) => c.source.url).
        sort((a, b) => a.source.url < b.source.url ? -1 : 1).
        map((c: CitationRecord, i) => <Url c={c} i={i} key={key} />)
}

const urlStyles = makeStyles((theme) => ({
    root: {
        fontSize: 'smaller',
        marginTop: theme.spacing(0.2),
        marginLeft: theme.spacing(1),
    },
    url: {
        color: theme.palette.grey[500],
    }
}))

function Url({ c, i, key }: { c: CitationRecord, i: number, key: string }) {
    const classes = urlStyles()
    return (
        <Grid container key={i} spacing={1} className={classes.root}>
            <Grid item xs={6}><Expando text={c.source.title} id={`${key}:${i}-title`} /></Grid>
            <Grid item xs={6} className={classes.url}><Expando text={c.source.url} id={`${key}:${i}-url`} /></Grid>
        </Grid>
    )
}

function SorterOption({ app, sorter, search }: { app: App, sorter: Sorter, search: AdHocQuery }) {
    const selected = search.sorter === sorter.pk || search.sorter == null && app.switchboard.index!.currentSorter === sorter.pk
    return (
        <MenuItem
            key={sorter.pk}
            selected={selected}
            onClick={() => {
                search.sorter = sorter.pk
                app.setState({ search })
            }}
        >
            {sorter.name}
        </MenuItem>
    )
}

function SearchDetails() {
    return (<>
        More to come.
    </>)
}