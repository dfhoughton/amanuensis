import { App } from './App'
import { Details } from './modules/util'
import { NoteRecord, Query } from './modules/types'
import { Card, makeStyles, useIsFocusVisible } from '@material-ui/core'
import { enkey, Index } from './modules/storage'
import classes from '*.module.css'

interface SearchProps {
    app: App
}

const projectStyles = makeStyles((theme) => ({
    root: {

    },
    results: {

    }
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
                {app.state.searchResults.map(r => <Result match={r} index={app.switchboard.index} />)}
            </div>
        </div>
    )
}

export default Search

const formStyles = makeStyles((theme) => ({
    root: {

    }
}))

function Form({ app }: { app: App }) {
    const classes = formStyles()
    return (
        <div className={classes.root}>

        </div>
    )
}

function Result({ match, index }: { match: NoteRecord, index: Index | null }) {
    if (index === null) {
        return null
    }
    const phrase: string = match.citations[0].phrase
    return (
        <Card key={enkey(match.key)}>

        </Card>
    )
}