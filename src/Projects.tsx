import React from 'react'
import { Details, Mark, TT } from './modules/util'
import { App, projectName } from './App'
import { Button, Card, CardActions, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Grid, makeStyles, TextField, Typography as T } from '@material-ui/core'
import { Clear, Edit, FileCopy } from '@material-ui/icons'
import { ProjectInfo } from './modules/types'
import { deepClone } from './modules/clone'
import { Autocomplete, createFilterOptions } from '@material-ui/lab'

interface ProjectsProps {
    app: App,
}

interface ProjectProps {
    app: App
}

interface ProjectState {
    cloning: ProjectInfo | null, // the project currently being cloned
    destroying: string | null,   // the project currently being destroyed
    editing: ProjectInfo | null, // the project currently being edited
    projects: { [name: string]: ProjectInfo }
}

class Projects extends React.Component<ProjectProps, ProjectState> {
    constructor(props: ProjectsProps) {
        super(props)
        this.state = { cloning: null, destroying: null, editing: null, projects: {} }
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
                <EditModal proj={this} />
                <CloneModal proj={this} />
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
        if (this.state.destroying) {
            this.props.app.switchboard.index?.removeProject(this.state.destroying)
                .then(() => {
                    const destroyed = this.state.destroying
                    const projects = deepClone(this.state.projects)
                    let pk
                    if (destroyed != null) {
                        pk = projects[destroyed].pk
                        delete projects[destroyed]
                        if (this.props.app.state.defaultProject === pk) {
                            this.props.app.setState({ defaultProject: 0 })
                        }
                    }
                    this.setState({ destroying: null, projects })
                    this.props.app.notify(`Removed project ${destroyed}`)
                })
                .catch((error) => this.props.app.error(`Could not remove project ${this.state.destroying}: ${error}`))
        } else {
            this.props.app.warn("No project to remove")
        }
    }

    // turn state.cloning into a new project
    makeProject() {
        if (this.state.cloning) {
            const proj = deepClone(this.state.cloning) || {}
            delete proj.pk
            this.props.app.switchboard.index!.saveProject(proj)
                .then((pk) => {
                    this.setState({ cloning: null })
                    this.initProjects()
                    this.props.app.notify(`Created project ${proj.name} (primary key: ${pk})`, 'success')
                })
                .catch((error) => this.props.app.error(`Could not create new project ${proj.name}: ${error}`))
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
    separator: {
        display: 'inline-block',
        margin: '0 2px',
        transform: 'scale(0.8)'
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
        proj.setState({ editing: deepClone(info) })
    }
    const startCloning = function () {
        proj.setState({ cloning: deepClone(info) })
    }
    const startDestroying = function () {
        if (defaultProject) return
        proj.setState({ destroying: name })
    }
    const makeDefaultProject = appDefault ? undefined : function () { proj.props.app.setState({ defaultProject: info.pk }) }
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
                            const n = left === right ? left :
                                <span>{left}<span className={classes.separator}>/</span>{right}</span>;
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

function EditModal({ proj }: { proj: Projects }) {
    if (proj.state.editing == null) {
        return null
    }
    const name = proj.state.editing?.pk ? proj.props.app.switchboard.index?.reverseProjectIndex.get(proj.state.editing?.pk) : null
    const editHandler = () => {

    }
    return (
        <Dialog
            open={proj.state.editing != null}
            aria-labelledby="edit-dialog-title"
            aria-describedby="edit-dialog-description"
        >
            <DialogTitle id="edit-dialog-title">Edit project {name}</DialogTitle>
            <DialogContent>
                <DialogContentText id="edit-dialog-description">
                    Clear all non-configuration information from {projectName}.
                    This means all notes, all tags, all relations, and all projects will be
                    irretrievably gone.
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => proj.setState({ editing: null })} >
                    Cancel
                </Button>
                <Button onClick={editHandler} color="primary" autoFocus>
                    Clone
                </Button>
            </DialogActions>
        </Dialog>
    )
}
const cloneStyles = makeStyles((theme) => ({
    text: {
        width: '100%',
        marginTop: theme.spacing(1),
        '&:first-child': {
            marginTop: 0,
        }
    }
}))

const relationFilterOptions = createFilterOptions({
    stringify: (option: [string, string]) => {
        const [left, right] = option
        return left === right ? left : `${left}/${right}`
    },
})

function CloneModal({ proj }: { proj: Projects }) {
    if (proj.state.cloning == null) {
        return null
    }
    const classes = cloneStyles()
    // the name will change but the primary key will not
    const name = proj.props.app.switchboard.index!.reverseProjectIndex.get(proj.state.cloning!.pk)
    let allRelations: [string, string][] = []
    for (const p of Object.values(proj.state.projects)) {
        allRelations = allRelations.concat(p.relations)
    }
    allRelations = Array.from(new Set(allRelations))
    let nameError: string | undefined
    if (!/\S/.test(proj.state.cloning?.name || '')) {
        nameError = "required"
    } else if (proj.state.projects[proj.state.cloning!.name]) {
        nameError = "not unique"
    }
    let relationError: string | undefined
    for (const [left, right] of proj.state.cloning!.relations) {
        if (relationError) {
            break
        }
        if ((left === 'see also') !== (right === 'see also')) {
            relationError = '"see also" can only be symmetric'
        } else if (right.indexOf('/') >= 0) {
            relationError = 'the character "/" can only be used to separate non-symmetric relations'
        }
    }
    return (
        <Dialog
            open={proj.state.cloning != null}
            aria-labelledby="clone-dialog-title"
            aria-describedby="clone-dialog-description"
        >
            <DialogTitle id="clone-dialog-title">
                Duplicating {name || 'the default project'}
            </DialogTitle>
            <DialogContent>
                <DialogContentText>
                    <T>
                        Currently all projects must use the default normalizer.
                    </T>
                    <form>
                        <TextField
                            id="clone-form-name"
                            label="Name"
                            className={classes.text}
                            onChange={(e) => {
                                const newCloning = deepClone(proj.state.cloning)
                                newCloning.name = e.target.value
                                proj.setState({ cloning: newCloning })
                            }}
                            error={!!nameError}
                            helperText={nameError}
                            spellCheck={false}
                            defaultValue={proj.state.cloning?.name}
                        />
                        <TextField
                            id="clone-form-descriptiomn"
                            label="Description"
                            className={classes.text}
                            onChange={(e) => {
                                const newCloning = deepClone(proj.state.cloning)
                                newCloning.description = e.target.value
                                proj.setState({ cloning: newCloning })
                            }}
                            multiline
                            error={false}
                            defaultValue={proj.state.cloning?.description}
                            placeholder="Describe what this project is for"
                        />
                        <Autocomplete
                            id="clone-form-relations"
                            className={classes.text}
                            options={allRelations}
                            multiple
                            freeSolo
                            autoComplete
                            limitTags={3}
                            size="small"
                            defaultValue={proj.state.cloning!.relations}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Relations"
                                    variant="outlined"
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
                                        (obj, index) =>
                                            {
                                                let left, right
                                                if (Array.isArray(obj)) {
                                                    [ left, right ] = obj
                                                } else {
                                                    left = right = obj
                                                }
                                                return <Chip
                                                    variant="outlined"
                                                    label={left === right ? left : `${left} / ${right}`}
                                                    {...getTagProps({index})}
                                                />
                                            }
                                        )
                            }
                            renderOption={([left, right]) => left === right ? left : `${left} / ${right}`}
                            filterOptions={relationFilterOptions}
                            onChange={(_event, value, _reason) => {
                                const relations = []
                                for (const r of value) {
                                    if (Array.isArray(r)) {
                                        relations.push(r)
                                    } else {
                                        const [left, ...right] = r.split('/').map((s) => s.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' '))
                                        const other = right.join('/')
                                        relations.push([left, other ? other : left])
                                    }
                                }
                                const cloning = deepClone(proj.state.cloning)
                                cloning.relations = relations
                                proj.setState({ cloning })
                            }}
                        />
                    </form>
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => proj.setState({ cloning: null })} >
                    Cancel
                </Button>
                <Button onClick={() => proj.makeProject()} color="primary" autoFocus disabled={!!(nameError || relationError)}>
                    Clone
                </Button>
            </DialogActions>
        </Dialog>
    )
}

function DestroyModal({ proj }: { proj: Projects }) {
    if (proj.state.destroying == null) {
        return null
    }
    return (
        <Dialog
            open={!!proj.state.destroying}
            aria-labelledby="destroy-dialog-title"
            aria-describedby="destroy-dialog-description"
        >
            <DialogTitle id="destroy-dialog-title">
                Clear all notes in the {proj.state.destroying} project?
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="destroy-dialog-description">
                    This will remove all records of the {proj.state.destroying}
                    project.
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => proj.setState({ destroying: null })} >
                    Cancel
                </Button>
                <Button onClick={() => proj.destroy()} color="primary" autoFocus>
                    Continue
                </Button>
            </DialogActions>
        </Dialog>
    )
}

function ProjectDetails() {
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
