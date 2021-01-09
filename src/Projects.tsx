import React from 'react'
import { Details, Mark, TT } from './modules/util'
import { App } from './App'
import {
    Button, Card, CardActions, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    FormControl, Grid, InputLabel, makeStyles, MenuItem, Select, TextField, Typography as T
} from '@material-ui/core'
import { Clear, Edit, FileCopy } from '@material-ui/icons'
import { ProjectInfo } from './modules/types'
import { deepClone } from './modules/clone'
import { Autocomplete, createFilterOptions } from '@material-ui/lab'
import { normalizers } from './modules/storage'

interface ProjectsProps {
    app: App,
}

interface ProjectProps {
    app: App
}

interface ProjectState {
    action: 'cloning' | 'editing' | 'destroying' | null,
    modifying: ProjectInfo | null, // the project currently being modified
    projects: { [name: string]: ProjectInfo }
}

class Projects extends React.Component<ProjectProps, ProjectState> {
    constructor(props: ProjectsProps) {
        super(props)
        this.state = { action: null, modifying: null, projects: {} }
    }
    componentDidMount() {
        this.props.app.switchboard.then(() => this.initProjects())
    }
    render(): React.ReactNode {
        return (
            <div className="projects" style={{ minHeight: 400 }}>
                <ProjectDetails />
                <Grid container spacing={2}>
                    {Object.entries(this.state.projects).map(([name, info]) => <ProjectCard proj={this} name={name} info={info} />)}
                </Grid>
                <ChangeModal proj={this} />
                <DestroyModal proj={this} />
            </div>
        )
    }

    initProjects() {
        const p: { [name: string]: ProjectInfo } = {}
        this.props.app.switchboard.index!.projects.forEach((info, name, _map) => { p[name] = info })
        this.setState({ projects: p })
    }

    // destroy the project marked for destruction
    destroy() {
        if (this.state.action === 'destroying') {
            const name = this.state.modifying!.name
            const changeToDefault = this.state.modifying!.pk = this.props.app.switchboard.index!.currentProject
            this.props.app.switchboard.index!.removeProject(this.state.modifying!.pk)
                .then(() => {
                    this.initProjects()
                    this.setState({ action: null, modifying: null })
                    if (changeToDefault) {
                        this.props.app.setState({defaultProject: 0})
                    }
                    this.props.app.success(`Removed project ${name}`)
                })
                .catch((error) => this.props.app.error(`Could not remove project ${name}: ${error}`))
        } else {
            this.props.app.warn("No project to remove")
        }
    }

    // turn state.cloning into a new project
    alterProject() {
        const action = this.state.action
        if (action === 'cloning' || action === 'editing') {
            const proj = deepClone(this.state.modifying) || {}
            delete proj.pk
            this.props.app.switchboard.index!.saveProject(proj)
                .then((pk) => {
                    this.initProjects()
                    this.setState({ action: null, modifying: null })
                    const verb = action === 'cloning' ? 'Created' : 'Edited'
                    this.props.app.success(`${verb} project ${proj.name} (primary key: ${pk})`)
                })
                .catch((error) => this.props.app.error(`Could not ${action === 'cloning' ? 'create new' : 'edit'} project ${proj.name}: ${error}`))
        } else {
            // should be unreachable
            this.props.app.error("makeProject called when none is staged")
        }
    }
}

export default Projects

const projectStyles = makeStyles((theme) => ({
    title: {
        fontSize: 14,
    },
    description: {
        margin: theme.spacing(1),
    },
    relations: {
        margin: 0,
        listStyleType: "none",
    },
    header: {
        fontSize: 14,
        fontWeight: "bold",
    },
}))

function ProjectCard({ proj, name, info }: { proj: Projects, name: string, info: ProjectInfo }) {
    const classes = projectStyles()
    const defaultProject = info.pk === 0
    const appDefault = info.pk === proj.props.app.state.defaultProject
    const startEditing = function () {
        if (defaultProject) return
        proj.setState({ action: 'editing', modifying: deepClone(info) })
    }
    const startCloning = function () {
        proj.setState({ action: 'cloning', modifying: deepClone(info) })
    }
    const startDestroying = function () {
        if (defaultProject) return
        proj.setState({ action: 'destroying', modifying: deepClone(info) })
    }
    const makeDefaultProject = appDefault ? undefined : function () {
        proj.props.app.switchboard.index?.setCurrentProject(info.pk)
            .then(() => proj.props.app.setState({ defaultProject: info.pk }))
            .catch((error) => proj.props.app.error(`Could not change default project: ${error}`))
    }
    return (
        <Grid item xs={12} key={info.pk}>
            <Card variant="outlined">
                <CardContent style={{ paddingBottom: 0 }}>
                    <Grid container spacing={1}>
                        <Grid container item xs>
                            <T className={classes?.title} component="h2">
                                {name || <i color="secondary">no name</i>}
                            </T>
                        </Grid>
                        <Grid container item xs>
                            <T align="right" style={{ width: '100%' }}>
                                <TT wrap msg="default project">
                                    <Mark starred={appDefault} onClick={makeDefaultProject} />
                                </TT>
                            </T>
                        </Grid>
                    </Grid>
                    <T variant="body2" className={classes.description} gutterBottom>
                        {info.description}
                    </T>
                    <span className={classes.header}>Normalizer</span>
                    <span style={{ marginLeft: '1rem' }}>{info.normalizer || <i>default</i>}</span>
                    <br />
                    <T className={classes.header}>Relations</T>
                    <ul className={classes.relations}>
                        {info.relations.map(([left, right]) => {
                            const n = left === right ? left : <PairedRelation left={left} right={right} />
                            return <li key={`${left}/${right}`}>{n}</li>
                        })}
                    </ul>
                </CardContent>
                <CardActions style={{ paddingTop: 0, flexDirection: "row-reverse" }}>
                    {
                        defaultProject ? null :
                            <span>
                                <Button size="small" onClick={startEditing}><Edit /></Button>
                                <Button size="small" color="primary" onClick={startDestroying}><Clear /></Button>
                            </span>
                    }
                    <Button size="small" onClick={startCloning}><TT msg="clone this project"><FileCopy /></TT></Button>
                </CardActions>
            </Card>
        </Grid>
    )
}

const changeStyles = makeStyles((theme) => ({
    text: {
        width: '100%',
        marginTop: theme.spacing(1),
        '&:first-child': {
            marginTop: 0,
        }
    },
}))

const relationFilterOptions = createFilterOptions({
    stringify: (option: [string, string]) => {
        const [left, right] = option
        return left === right ? left : `${left}/${right}`
    },
})

function ChangeModal({ proj }: { proj: Projects }) {
    const action = proj.state.action
    if (!(action === 'cloning' || action === 'editing')) {
        return null
    }
    const classes = changeStyles()
    // the name may change but the primary key will not
    const name = proj.props.app.switchboard.index!.reverseProjectIndex.get(proj.state.modifying!.pk)
    const modifyingName = proj.state.modifying!.name
    let allRelations: [string, string][] = []
    for (const p of Object.values(proj.state.projects)) {
        allRelations = allRelations.concat(p.relations)
    }
    allRelations = Array.from(new Set(allRelations.map((r) => JSON.stringify(r)))).map((r) => JSON.parse(r))
    let nameError: string | undefined
    if (!/\S/.test(proj.state.modifying!.name)) {
        nameError = "required"
    } else if (proj.state.projects[modifyingName] && (action !== 'editing' || name !== modifyingName)) {
        nameError = 'already in use'
    }
    let relationError: string | undefined
    for (const [left, right] of proj.state.modifying!.relations) {
        if (relationError) {
            break
        }
        if ((left === 'see also') !== (right === 'see also')) {
            relationError = '"see also" can only be symmetric'
        } else if (right.indexOf('/') >= 0) {
            relationError = 'the character "/" can only be used to separate non-symmetric relations'
        } else if (!(/\S/.test(left) && /\S/.test(right))) {
            relationError = 'relation names must not be blank'
        }
    }
    return (
        <Dialog
            open
            aria-labelledby="clone-dialog-title"
            aria-describedby="clone-dialog-description"
        >
            <DialogTitle id="clone-dialog-title">
                {action === 'editing' ? 'Editing' : 'Duplicationg'} {name || 'the default project'}
            </DialogTitle>
            <DialogContent>
                <DialogContentText>
                    <form>
                        <TextField
                            id="clone-form-name"
                            label="Name"
                            className={classes.text}
                            onChange={(e) => {
                                const modifying = deepClone(proj.state.modifying)
                                modifying.name = e.target.value
                                proj.setState({ modifying })
                            }}
                            error={!!nameError}
                            helperText={nameError}
                            spellCheck={false}
                            defaultValue={proj.state.modifying!.name}
                        />
                        <TextField
                            id="clone-form-descriptiomn"
                            label="Description"
                            className={classes.text}
                            onChange={(e) => {
                                const modifying = deepClone(proj.state.modifying)
                                modifying.description = e.target.value
                                proj.setState({ modifying })
                            }}
                            multiline
                            error={false}
                            defaultValue={proj.state.modifying!.description}
                            placeholder="Describe what this project is for"
                        />
                        <FormControl className={classes.text}>
                            <InputLabel id="change-form-normalizer-label">Normalizer</InputLabel>
                            <Select
                                labelId="change-form-normalizer-label"
                                id="change-form-normalizer"
                                value={proj.state.modifying!.normalizer}
                                onChange={(event) => {
                                    const modifying = deepClone(proj.state.modifying)
                                    modifying.normalizer = event.target.value
                                    proj.setState({ modifying })
                                }}
                            >
                                {Object.entries(normalizers).map(([name, n], i) => <MenuItem value={name}>{n.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <Autocomplete
                            id="clone-form-relations"
                            className={classes.text}
                            options={allRelations}
                            multiple
                            freeSolo
                            autoComplete
                            limitTags={3}
                            size="small"
                            defaultValue={proj.state.modifying!.relations}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Relations"
                                    error={!!relationError}
                                    helperText={
                                        relationError || <T>
                                            separate left and right relations with a /; e.g., <i>whole/part</i>
                                        </T>
                                    }
                                />
                            )}
                            renderTags={
                                (value, getTagProps) =>
                                    value.map(
                                        (obj, index) => {
                                            const [left, right] = Array.isArray(obj) ? obj : stringToRelation(obj)
                                            return <Chip
                                                variant="outlined"
                                                label={left === right ? left : <PairedRelation left={left} right={right} />}
                                                {...getTagProps({ index })}
                                            />
                                        }
                                    )
                            }
                            renderOption={([left, right]) => left === right ? left : <PairedRelation left={left} right={right} />}
                            filterOptions={relationFilterOptions}
                            onChange={(_event, value, _reason) => {
                                const relations = []
                                for (const r of value) {
                                    if (Array.isArray(r)) {
                                        relations.push(r)
                                    } else {
                                        relations.push(stringToRelation(r))
                                    }
                                }
                                const modifying = deepClone(proj.state.modifying)
                                modifying.relations = Array.from(new Set(relations.map((r) => JSON.stringify(r)))).map((r) => JSON.parse(r))
                                proj.setState({ modifying })
                            }}
                        />
                    </form>
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => proj.setState({ action: null, modifying: null })} >
                    Cancel
                </Button>
                <Button onClick={() => proj.alterProject()} color="primary" autoFocus disabled={!!(nameError || relationError)}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    )
}

function stringToRelation(r: string) {
    const [left, ...right] = r.split('/').map((s) => s.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' '))
    const other = right.join('/')
    return [left, other ? other : left]
}

const separatorStyle = makeStyles((theme) => ({
    sep: {
        marginLeft: theme.spacing(1),
        marginRight: theme.spacing(1),
        color: theme.palette.grey[500],
        fontWeight: 'bold',
    }
}))

function PairedRelation({ left, right }: { left: string, right: string }) {
    const classes = separatorStyle()
    return <span>{left}<span className={classes.sep}>/</span>{right}</span>
}

function DestroyModal({ proj }: { proj: Projects }) {
    if (proj.state.action !== 'destroying') {
        return null
    }
    const name = proj.state.modifying!.name
    return (
        <Dialog
            open
            aria-labelledby="destroy-dialog-title"
            aria-describedby="destroy-dialog-description"
        >
            <DialogTitle id="destroy-dialog-title">
                Clear all notes in the {name} project?
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="destroy-dialog-description">
                    This will remove all records of the {name} project, both the notes and the records
                    of the project itself. Any note in another project related via the "see also" relation
                    to a note in this project will lose that relation.
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => proj.setState({ action: null, modifying: null })} >
                    Cancel
                </Button>
                <Button onClick={() => proj.destroy()} color="primary" autoFocus>
                    Continue
                </Button>
            </DialogActions>
        </Dialog>
    )
}

const detailsStyle = makeStyles((theme) => ({
    name: {
        verticalAlign: 'top',
        fontWeight: 'bold',
    }
}))

function ProjectDetails() {
    const classes = detailsStyle()
    return (
        <Details header="Projects">
            <div>
                <p>
                    Projects are collections of related notes. Notes always live
                    in one and only one project.
                </p>
                <p>
                    One project can differ from another in
                </p>
                <ul>
                    <li>name</li>
                    <li>description</li>
                    <li>normalizer</li>
                    <li>relations</li>
                </ul>
                <p>
                    A project's name must be a unique identifier. The other properties can optionally differ as well.
                </p>
                <p>
                    To start a new project you must clone an existing one. This will create a new project with the same description,
                    normalizer, and relations. You will be required to provide a new name. The cloned project will begin with no
                    notes.
                </p>
                <h3>Normalizer</h3>
                <p>
                    The normalizer is a way of recognizing two different strings, like <i>cat</i> and <i>Cat</i>, and
                    maybe even <i>cats</i>, as the same. If you seek to create a note on a phrase and you've already
                    created a note on the "same" phrase according to the project's normalizer, you will instead be provided
                    the original note and the new phrase will be added as a citation.
                </p>
                <p>
                    The original motivation for normalizers was to facilitate working on projects in different languages.
                    In English, Thai, and Chinese, this doesn't do that much for you. In Finnish, on the other hand, you
                    might want the normalizer to say <i>haluaisitteko</i> and <i>haluamme</i> are the same. That being said,
                    there isn't currently a way to define new normalizers. The default normalizer treats all whitespace as
                    the same, all capitalization as the same, disregards all diacrictics (so <i>coöperate</i> and <i>cooperate</i> are
                    treated as equivalent), and ignores anything other than a letter or a number.
                </p>
                <p>The normalizers currently defined:</p>
                <table>
                    <thead>
                        <tr><th>Name</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                        {Object.values(normalizers).map((n) => <tr><td className={classes.name}>{n.name}</td><td>{n.description}</td></tr>)}
                    </tbody>
                </table>
                <h3>Relations</h3>
                <p>
                    Relations are a way to tie one note to another. The default relation every project has is "see also".
                    Other relations might be "antonym", "synonym", "subspecies", or simply "related". Every relation is double-ended:
                    if note A is related to note B, note B will necessarily be related to note A. For this reason both ends of a
                    relation need a name, though if the relation is symmetric, it may be the same name. This is the case with "see also".
                    For a "part of" relation, though, you might want "part of" and "contains" as the two ends.
                </p>
                <p>
                    Aside from the "see also" relation every relation concerns only notes in the same project.
                </p>
            </div>
        </Details>
    )
}
