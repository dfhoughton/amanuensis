import { App } from './App'
import { any, Details, Mark, nws, squish, TT } from './modules/util'
import { Button, Card, CardActions, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, makeStyles, TextField, Typography as T } from '@material-ui/core'
import React, { useState } from 'react'
import { Sorter } from './modules/types'
import { AddBoxRounded, Clear, Edit } from '@material-ui/icons'
import { Autocomplete } from '@material-ui/lab'
import { deepClone } from './modules/clone'

interface SortingProps {
    app: App
}

const sortingStyles = makeStyles((theme) => ({
    root: {

    },
    results: {
        marginTop: theme.spacing(3),
    },
    text: {
        width: '100%',
    },
    adfixes: {
        marginTop: theme.spacing(1),
    },
    noNotes: {
        display: "table",
        margin: "0 auto",
        fontStyle: "italic",
    },
}))

const nullSorter: Sorter = {
    pk: -1,
    name: '',
    description: '',
    metric: (a, b) => 0
}

function Sorting({ app }: SortingProps) {
    const classes = sortingStyles();
    const knownSorters = deepClone(Array.from(app.switchboard.index!.sorters.values()), 'metric')
        .sort((a: Sorter, b: Sorter) => a.pk - b.pk)
    const [sorts, setSorts] = useState<Sorter[]>(knownSorters)
    const [editedSort, setEditedSort] = useState<Sorter | null>(null)
    const [df, setDf] = useState(app.switchboard.index!.currentSorter)

    const nameError: string = (function () {
        if (editedSort === null) return ''
        if (!nws(editedSort.name)) return "required"
        const n = squish(editedSort.name)
        if (any(sorts, (s: Sorter) => s.pk !== editedSort.pk && s.name === n)) return "not unique"
        return ''
    })()
    return (
        <div className={classes.root}>
            <Details header="Sorting">
                <p></p>
            </Details>
            {sorts.map((s) =>
                <SorterCard
                    app={app}
                    sorter={s}
                    defaultSorter={df}
                    setDefaultSorter={setDf}
                    sorts={sorts}
                    setSorts={setSorts}
                    setEditedSorter={setEditedSort}
                />
            )}
            <T align="right">
                <IconButton color="primary" onClick={() => setEditedSort(deepClone(nullSorter, 'metric'))} >
                    <TT msg="create a new sorter">
                        <AddBoxRounded fontSize="large" />
                    </TT>
                </IconButton>
            </T>
            <Dialog open={!!editedSort}>
                <DialogTitle>
                    {editedSort === null ? '' : editedSort.pk === -1 ? 'Create a new sorter' : `Edit sorter ${editedSort.name}`}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        label="Name"
                        placeholder="A unique identifier"
                        className={classes.text}
                        value={editedSort?.name || undefined}
                        error={!!nameError}
                        helperText={nameError}
                        onChange={(e) => {
                            const es: Sorter = deepClone(editedSort, 'metric')
                            es.name = e.target.value
                            setEditedSort(es)
                        }}
                    />
                    <TextField
                        label="Description"
                        placeholder="What is this for?"
                        className={classes.text}
                        value={editedSort?.description || undefined}
                        onChange={(e) => {
                            const es: Sorter = deepClone(editedSort, 'metric')
                            es.description = e.target.value
                            setEditedSort(es)
                        }}
                    />
                    <Grid container spacing={2} className={classes.adfixes}>
                        <Grid container item xs>
                            <TextField
                                label="Prefix"
                                type="number"
                                InputLabelProps={{ shrink: true }}
                                InputProps={{ inputProps: { min: 0, step: 1 } }}
                                value={editedSort?.prefix || 0}
                                onChange={(e) => {
                                    const es: Sorter = deepClone(editedSort, 'metric')
                                    const prefix = e.target.value ? Number.parseInt(e.target.value) : 0
                                    es.prefix = prefix
                                    setEditedSort(es)
                                }} />
                        </Grid>
                        <Grid container item xs>
                            <TextField
                                label="Suffix"
                                type="number"
                                InputLabelProps={{ shrink: true }}
                                InputProps={{ inputProps: { min: 0, step: 1 } }}
                                value={editedSort?.suffix || 0}
                                onChange={(e) => {
                                    const es: Sorter = deepClone(editedSort, 'metric')
                                    const suffix = e.target.value ? Number.parseInt(e.target.value) : 0
                                    es.suffix = suffix
                                    setEditedSort(es)
                                }} />
                        </Grid>
                    </Grid>
                    <TextField
                        label="Insertables"
                        className={classes.text}
                        value={editedSort?.insertables || ''}
                        onChange={(e) => {
                            const es: Sorter = deepClone(editedSort, 'metric')
                            es.insertables = e.target.value
                            setEditedSort(es)
                        }}
                    />
                    <Autocomplete
                        value={editedSort?.similars || []}
                        options={editedSort?.similars || []}
                        onChange={(_event, choices) => {
                            const es: Sorter = deepClone(editedSort, 'metric')
                            es.similars = choices
                            setEditedSort(es)
                        }}
                        multiple
                        freeSolo
                        autoComplete
                        renderInput={(params) => <TextField {...params} label="Convertibles" placeholder="letters that change into each other" />}
                        renderTags={(value, getTagProps) => value.map((obj, index) => <Chip variant="outlined" size="small" label={obj} {...getTagProps({ index })} />)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditedSort(null)} >
                        Cancel
                    </Button>
                    <Button
                        color="primary"
                        autoFocus
                        disabled={!!nameError}
                        onClick={() => {
                            if (editedSort!.pk === -1) {
                                app.switchboard.index!.saveSorter(editedSort!)
                                    .then((pk) => {
                                        editedSort!.pk = pk
                                        const newSorts: Sorter[] = deepClone(sorts, 'metric')
                                        newSorts.push(editedSort!)
                                        setSorts(newSorts)
                                        app.success(`Created sorter ${editedSort!.name}`)
                                        setEditedSort(null)
                                    })
                                    .catch(e => app.error(e))
                            } else {
                                app.switchboard.index!.saveSorter(editedSort!)
                                    .then((pk) => {
                                        const newSorts: Sorter[] = deepClone(sorts, 'metric')
                                        const i = newSorts.findIndex((s: Sorter) => s.pk === pk)
                                        newSorts[i] = editedSort!
                                        setSorts(newSorts)
                                        app.success(`Edited sorter ${editedSort!.name}`)
                                        setEditedSort(null)
                                    })
                                    .catch(e => app.error(e))
                            }
                        }}
                    >
                        Save
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    )
}

export default Sorting

const sorterStyles = makeStyles((theme) => ({
    root: {
        marginTop: theme.spacing(1),
        '&:first-child': {
            marginTop: 0,
        }
    },
    title: {
        fontSize: 14,
    },
    description: {
        margin: theme.spacing(1),
    },
    actions: {
        marginTop: theme.spacing(1),
        flexDirection: 'row-reverse',
    },
    insertables: {
        width: '100%'
    },
}))

type SorterCardProps = {
    app: App
    sorter: Sorter
    defaultSorter: number
    setDefaultSorter: (pk: number) => void
    sorts: Sorter[]
    setSorts: (props: Sorter[]) => void
    setEditedSorter: (s: Sorter) => void
}
function SorterCard({ app, sorter, defaultSorter, setDefaultSorter, sorts, setSorts, setEditedSorter }: SorterCardProps) {
    const classes = sorterStyles()
    const isDefaultSorter = sorter.pk === 0
    const handleStarClick = () => {
        if (sorter.pk !== defaultSorter) {
            app.switchboard.index!.setDefaultSorter(sorter.pk)
                .then(() => setDefaultSorter(sorter.pk))
        }
    }
    return (
        <Grid item xs={12} key={sorter.pk} className={classes.root}>
            <Card variant="outlined">
                <CardContent style={{ paddingBottom: 0 }}>
                    <Grid container spacing={1}>
                        <Grid container item xs>
                            <T className={classes?.title} component="h2">
                                {sorter.name}
                            </T>
                        </Grid>
                        <Grid container item xs>
                            <T align="right" style={{ width: '100%' }}>
                                <TT wrap msg={sorter.pk === defaultSorter ? "default sorter" : "make default sorter"}>
                                    <Mark starred={sorter.pk === defaultSorter} onClick={handleStarClick} />
                                </TT>
                            </T>
                        </Grid>
                    </Grid>
                    <T variant="body2" className={classes.description} gutterBottom>
                        {sorter.description}
                    </T>
                    <Grid container spacing={2}>
                        <Grid container item xs={3}>
                            <TextField
                                label="Prefix"
                                type="number"
                                disabled
                                InputLabelProps={{ shrink: true }}
                                value={sorter.prefix || 0}
                            />
                        </Grid>
                        <Grid container item xs={3}>
                            <TextField
                                label="Suffix"
                                type="number"
                                disabled
                                InputLabelProps={{ shrink: true }}
                                value={sorter.suffix || 0}
                            />
                        </Grid>
                        <Grid container item xs={6}>
                            <TextField
                                label="Insertables"
                                className={classes.insertables}
                                InputLabelProps={{ shrink: !!sorter.insertables }}
                                disabled
                                value={sorter.insertables}
                            />
                        </Grid>
                    </Grid>
                    <Autocomplete
                        value={sorter.similars || []}
                        options={sorter.similars || []}
                        onChange={(_event, choices) => { }}
                        disabled
                        multiple
                        freeSolo
                        autoComplete
                        renderInput={(params) => <TextField {...params} label="Convertibles" placeholder="letters that change into each other" />}
                        renderTags={
                            (value, getTagProps) =>
                                value.map((obj, index) => <Chip variant="outlined" size="small" label={obj} {...getTagProps({ index })} />)
                        }
                    />
                </CardContent>
                <CardActions className={classes.actions}>
                    {
                        !isDefaultSorter && <>
                            <Button size="small" onClick={() => {
                                app.confirm({
                                    title: `Delete Sorter ${sorter.name}`,
                                    ok: 'Delete',
                                    text: `Are you sure you wish to delete the ${sorter.name} sorter? This cannot be undone.`,
                                    callback: () => {
                                        return new Promise((resolve, reject) => {
                                            app.switchboard.index!.deleteSorter(sorter)
                                                .then(() => {
                                                    const newSorters: Sorter[] = deepClone(sorts, 'metric')
                                                    const i = newSorters.findIndex((s: Sorter) => s.pk === sorter.pk)
                                                    newSorters.splice(i, 1)
                                                    setSorts(newSorters)
                                                    if (app.state.search.type === 'ad hoc' && app.state.search.sorter === sorter.pk) {
                                                        // fix saved search or we'll get explosions
                                                        const search = deepClone(app.state.search)
                                                        search.sorter = app.switchboard.index!.currentSorter
                                                        app.setState({ search })
                                                    }
                                                    if (sorter.pk === defaultSorter) {
                                                        setDefaultSorter(app.switchboard.index!.currentSorter)
                                                    }
                                                    resolve(`Sorter ${sorter.name} deleted`)
                                                })
                                                .catch(e => reject(e))
                                        })
                                    }
                                })
                            }}>
                                <Clear />
                            </Button>
                            <Button size="small" onClick={() => setEditedSorter(deepClone(sorter, 'metric'))}>
                                <Edit />
                            </Button>
                        </>
                    }
                </CardActions>
            </Card>
        </Grid>
    )
}
