import React from 'react'
import { Details, TT } from './modules/util'
import { App } from './App'
import { Button, Card, CardActions, CardContent, makeStyles, Typography as T } from '@material-ui/core'
import { Clear, Edit, FileCopy } from '@material-ui/icons'

interface ProjectsProps {
    app: App,
}

const projectStyles = makeStyles((theme) => ({
    projects: {

    },
    card: {

    },
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
    }
}))

function Projects({ app }: ProjectsProps) {
    const classes = projectStyles()
    return (
        <div className={classes.projects}>
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
                        the same, all capitalization as the same, and ignores anything other than a letter or a number.
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
            {Object.entries(app.state.projects).map(([name, info]) => {
                return <Card className={classes.card} variant="outlined" key={info.pk}>
                    <CardContent style={{ paddingBottom: 0 }}>
                        <T className={classes.title} component="h2" gutterBottom>
                            {name || <i color="secondary">no name</i>}
                        </T>
                        <T variant="body2" className={classes.description} gutterBottom>
                            {info.description}
                        </T>
                        <span className={classes.header}>Normalizer</span>
                        <span style={{ marginLeft: '1rem' }}>{info.normalizer || <i>default</i>}</span>
                        <br />
                        <T className={classes.header}>Relations</T>
                        <ul className={classes.relations}>
                            {info.relations.map(([left, right]) => {
                                console.log({ left, right })
                                const n = left === right ? left :
                                    <span>{left}<span className={classes.separator}>/</span>{right}</span>;
                                return <li key={`${left}/${right}`}>{n}</li>
                            })}
                        </ul>
                    </CardContent>
                    <CardActions style={{ paddingTop: 0, flexDirection: "row-reverse" }}>
                        {
                            !name ? null :
                                <span>
                                    <Button size="small"><Edit /></Button>
                                    <Button size="small" color="primary"><Clear /></Button>
                                </span>
                        }
                        <Button size="small"><TT msg="clone this project"><FileCopy /></TT></Button>
                    </CardActions>
                </Card>
            })}
        </div>
    )
}

export default Projects