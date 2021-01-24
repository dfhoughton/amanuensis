import { App } from './App'
import { Details, flatten, Mark, uniq, ymd } from './modules/util'
import { AdHocQuery, CitationRecord, NoteRecord } from './modules/types'
import { Button, Card, Chip, FormControl, FormControlLabel, Grid, makeStyles, Radio, RadioGroup, TextField } from '@material-ui/core'
import { enkey, normalizers } from './modules/storage'
import React from 'react'
import { deepClone } from './modules/clone'
import { Autocomplete } from '@material-ui/lab'
import { Search as SearchIcon } from '@material-ui/icons'

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
    const { index } = app.switchboard
    if (index === null) {
        return null
    }
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
    const { phrase, starred, after, before, tags: tagRequired, url } = search
    const strictness = search.strictness || "exact"
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
                <FormControl component="fieldset">
                    <RadioGroup row value={strictness} onChange={(v) => {
                        switch (v.target.value) {
                            case 'exact':
                            case 'fuzzy':
                            case 'substring':
                                search = deepClone(search)
                                search.strictness = v.target.value
                                app.setState({ search })
                                break
                        }
                    }}>
                        <FormControlLabel value="exact" disabled={!phrase} control={<Radio />} label="exact" />
                        <FormControlLabel value="fuzzy" disabled={!phrase} control={<Radio />} label="fuzzy" />
                        <FormControlLabel value="substring" disabled={!phrase} control={<Radio />} label="substring" />
                    </RadioGroup>
                </FormControl>
            </div>
            {projects.length > 1 && <Autocomplete
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
            <div className={classes.centered}>
                <FormControl component="fieldset">
                    <RadioGroup row value={starred === undefined ? "either" : starred ? "starred" : "unstarred"} onChange={(v) => {
                        let value
                        switch (v.target.value) {
                            case "starred":
                                value = true
                                break
                            case "unstarred":
                                value = false
                                break
                        }
                        search = deepClone(search)
                        if (value === undefined) {
                            delete search.starred
                        } else {
                            search.starred = value
                        }
                        app.setState({ search })
                    }}>
                        <FormControlLabel value="starred" control={<Radio />} label="starred" />
                        <FormControlLabel value="unstarred" control={<Radio />} label="unstarred" />
                        <FormControlLabel value="either" control={<Radio />} label="either" />
                    </RadioGroup>
                </FormControl>
            </div>
            {tags.length && <Autocomplete
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
                        variant="outlined"
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
                            variant="outlined"
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

    },

}))

interface CardProps { note: NoteRecord, app: App }

function Result({ note, app }: CardProps) {
    if (app.switchboard.index === null) {
        return null
    }
    const classes = resultStyles()
    const phrase: string = note.citations[0].phrase
    const {starred, url} = app.state.search as AdHocQuery
    return (
        <Card key={enkey(note.key)} className={classes.root}>
            <Grid justify="space-between">
                <Phrase app={app} note={note}/>
                <Url app={app} note={note}/>
                <Mark starred={note.starred}/>
            </Grid>
        </Card>
    )
}

function Phrase({note, app}: CardProps) {
    const phrases : string[] = uniq(note.citations.map((c: CitationRecord) => c.phrase ))
    const phrase = phrases.shift()
    if (!phrase) return null // should be a no-op
    return (
        <span>{phrase}</span>
    )
}

function Url({note, app}: CardProps) {
    if (!(app.state.search as AdHocQuery).url) return null
    const urls: string[] = uniq(note.citations.map((c: CitationRecord) => c.source.url))
    const url = urls.shift()
    if (!url) return null
    return (
        <span>{url}</span>
    )
}