import { App } from './App'
import { Details } from './modules/util'
import { makeStyles } from '@material-ui/core'
import React from 'react'

interface SortingProps {
    app: App
}

const sortingStyles = makeStyles((theme) => ({
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


function Sorting({ app }: SortingProps) {
    const classes = sortingStyles();
    return (
        <div className={classes.root}>
            <Details header="Sorting">
                <p></p>
            </Details>
            More to follow
        </div>
    )
}

export default Sorting
