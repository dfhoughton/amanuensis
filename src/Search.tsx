import { App } from './App'
import { Details, flatten, Mark, sameNote, TT, uniq, ymd, formatDates as fd, Expando } from './modules/util'
import { AdHocQuery, CitationRecord, NoteRecord, Sorter } from './modules/types'
import { Button, Card, CardContent, Chip, FormControl, FormControlLabel, Grid, makeStyles, MenuItem, Radio, RadioGroup, TextField } from '@material-ui/core'
import { enkey, normalizers } from './modules/storage'
import React from 'react'
import { deepClone } from './modules/clone'
import { Autocomplete } from '@material-ui/lab'
import { Search as SearchIcon, Visibility, Link } from '@material-ui/icons'

interface SearchProps {
    app: App
}

const projectStyles = makeStyles((theme) => ({
    root: {

    },
    results: {
        marginTop: theme.spacing(3),
    },
    noNotes: {
        display: "table",
        margin: "0 auto",
        fontStyle: "italic",
    },
}))


function Search({ app }: SearchProps) {
    const classes = projectStyles();
    return (
        <div className={classes.root}>
            <Details header="Search">
                <p></p>
            </Details>
            <Form app={app} />
            <div className={classes.results}>
                {app.state.searchResults.map(r => <Result note={r} app={app} />)}
                {!app.state.searchResults.length && <div className={classes.noNotes}>no notes found</div>}
            </div>
        </div>
    )
}

export default Search

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
    }
}))

function Form({ app }: { app: App }) {
    const index = app.switchboard.index!
    const classes = formStyles()
    let search: AdHocQuery
    switch (app.state.search.type) {
        case "lookup":
            // convert the lookup search into an ad hoc search
            search = { type: "ad hoc", phrase: app.state.search.phrase, strictness: 'exact' }
            if (app.state.search !== undefined) {
                search.project = [app.state.search.project || 0]
            }
            app.setState({ search })
            break
        default:
            search = app.state.search
            search.type = "ad hoc"
            break
    }
    const { phrase, after, before, tags: tagRequired, url } = search
    const strictness = search.strictness || "exact"
    const [showSorter, setShowSorter] = React.useState(phrase && strictness === 'similar' && app.switchboard.index!.sorters.size > 1)
    const project = search.project || []
    const projects = Array.from(index.reverseProjectIndex.keys())
    const tags = Array.from(index.tags).sort()
    return (
        <div className={classes.root}>
            <TextField
                id="phrase"
                label="Phrase"
                className={classes.item}
                value={phrase || ''}
                onChange={(event) => {
                    search = deepClone(search)
                    if (/\S/.test(event.target.value)) {
                        search.phrase = event.target.value
                    } else {
                        delete search.phrase
                    }
                    app.setState({ search })
                }}
            />
            <div className={classes.centered}>
                <Grid container justify="space-between">
                    <Grid item>
                        <FormControl component="fieldset">
                            <RadioGroup row value={strictness} onChange={(v) => {
                                switch (v.target.value) {
                                    case 'exact':
                                    case 'fuzzy':
                                    case 'substring':
                                        search = deepClone(search)
                                        search.strictness = v.target.value
                                        delete search.sorter
                                        app.setState({ search })
                                        break
                                    case 'similar':
                                        search = deepClone(search)
                                        search.strictness = v.target.value
                                        search.sorter = app.switchboard.index!.defaultSorter()
                                        app.setState({ search }, () => {
                                            if (app.switchboard.index!.sorters.size === 1) {
                                                setShowSorter(true)
                                            }
                                        })
                                        break
                                }
                            }}>
                                <FormControlLabel value="exact" disabled={!phrase} control={<Radio />} label="exact" />
                                <FormControlLabel value="fuzzy" disabled={!phrase} control={<Radio />} label="fuzzy" />
                                <FormControlLabel value="substring" disabled={!phrase} control={<Radio />} label="substring" />
                                <FormControlLabel value="similar" disabled={!phrase} control={<Radio />} label="similar" />
                            </RadioGroup>
                        </FormControl>
                    </Grid>
                    {showSorter && <TextField
                        select
                        onChange={(e) => {
                            search.sorter = app.switchboard.index!.sorters.get(Number.parseInt(e.target.value))
                            app.setState({search})
                        }}
                    >
                        {
                            Array.from(app.switchboard.index!.sorters.values())
                                .sort((a, b) => a.name < b.name ? -1 : 1)
                                .map((s) => <SorterOption app={app} search={search} sorter={s} />)
                        }
                    </TextField>}
                </Grid>
            </div>
            {(projects.length > 1 || '') && <Autocomplete
                id="project"
                className={classes.item}
                options={projects}
                value={project}
                multiple
                autoComplete
                getOptionLabel={(option) => index.reverseProjectIndex.get(option) || 'default'}
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
                            label={index.reverseProjectIndex.get(obj) || 'default'} {...getTagProps({ index: i })}
                        />
                    )
                    return chips
                }}
            />}
            {(tags.length || '') && <Autocomplete
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
            <Grid container justify="space-between" className={classes.item}>
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
            </Grid>
            <TextField
                id="url"
                label="URL"
                className={classes.item}
                value={url || ''}
                onChange={(event) => {
                    search = deepClone(search)
                    if (/\S/.test(event.target.value)) {
                        search.url = event.target.value
                    } else {
                        delete search.url
                    }
                    app.setState({ search })
                }}
            />
            <div className={classes.centered}>
                <Grid container justify="space-evenly" className={classes.item}>
                    <Button
                        color="primary"
                        className={classes.inCentered}
                        variant="contained"
                        endIcon={<SearchIcon />}
                        onClick={() => {
                            index.find(search)
                                .then((found) => {
                                    switch (found.type) {
                                        case "none":
                                            app.setState({ searchResults: [] })
                                            break
                                        case "ambiguous":
                                            app.setState({ searchResults: found.matches })
                                            break
                                        case "found":
                                            app.setState({ searchResults: [found.match] })
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
                        onClick={() => app.setState({ search: { type: 'ad hoc' } })}
                    >
                        Clear
                    </Button>
                </Grid>
            </div>
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
    const index = app.switchboard.index;
    const project = index!.projects.get(index!.reverseProjectIndex.get(note.key[0]) || '');
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
    const selected = search.sorter?.pk === sorter.pk || search.sorter == null && app.switchboard.index!.currentSorter === sorter.pk
    return (
        <MenuItem key={sorter.pk} selected={selected}>
            {sorter.name}
        </MenuItem>
    )
}