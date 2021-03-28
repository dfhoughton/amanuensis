import React from 'react'
import { Details, TT } from './modules/util'

import Button from '@material-ui/core/Button'
import ClearAllIcon from '@material-ui/icons/ClearAll'
import { App, projectName } from './App'
import { Box, LinearProgress, Typography } from '@material-ui/core'

interface ConfigProps {
    app: App
}

interface ConfigState {
    initialized: boolean
    amountMemoryUsed: number
    amountMemoryAvailable: number
}

class Config extends React.Component<ConfigProps, ConfigState> {
    app: App
    constructor(props: Readonly<ConfigProps>) {
        super(props)
        this.app = props.app
        this.state = {
            initialized: false,
            amountMemoryUsed: 0,
            amountMemoryAvailable: 100,
        }
        this.app.switchboard.index!.memfree()
            .then(([a, u]) => this.setState({ amountMemoryUsed: u, amountMemoryAvailable: a }))
            .catch(e => this.app.error(e))
    }

    componentDidMount() {
        this.app.switchboard.then(() => this.setState({ initialized: true }))
    }

    render() {
        return (
            <div className="config" style={{ minHeight: 400 }}>
                <Details header="Configuration">
                    <p>
                        This is a collection of controls that affect all your
                        notes and projects.
                    </p>
                </Details>
                {this.clearAllButtons()}
                {this.progress()}
            </div>
        )
    }

    // generates the clear all button portion of the config panel
    clearAllButtons() {
        if (!this.state.initialized) {
            return null
        }
        return (
            <>
                <Typography variant="h6" component="h2">
                    Delete everything
                </Typography>
                <Button
                    onClick={() => this.app.confirm({
                        title: 'Clear all stored notes?',
                        text: `Clear all non-configuration information from ${projectName}.
                        This means all notes, all tags, all relations, all projects, all
                        sorters, and all saved searches will be
                        irretrievably gone.`,
                        callback: () => new Promise((resolve, reject) => {
                            this.app.switchboard.index!.clear().then(() => {
                                this.app.setState({ defaultProject: 0 })
                                resolve("everything is gone")
                            }).catch(e => reject(e))
                        })
                    })}
                    variant="contained"
                    color="secondary"
                    startIcon={<ClearAllIcon />}
                >
                    Clear All
                </Button>
                <Typography variant="h6" component="h2">
                    Delete all saved searches
                </Typography>
                <Button
                    onClick={() => this.app.confirm({
                        title: 'Delete All Saved Searches?',
                        text: 'This action cannot be undone.',
                        callback: () => new Promise((resolve, reject) => {
                            this.app.switchboard.index!.clearStacks()
                                .then(() => {
                                    this.app.setState({ stack: undefined })
                                    resolve("all saved searches have been deleted")
                                })
                                .catch(e => reject(e))
                        })
                    })}
                    variant="contained"
                    color="secondary"
                    startIcon={<ClearAllIcon />}
                >
                    Clear All Saved Searches
                </Button>
            </>
        )
    }

    progress() {
        const { amountMemoryUsed: used, amountMemoryAvailable: available } = this.state;
        const value = 100 * Math.round(used / available)
        return (
            <div className="foo" style={{ marginTop: '1rem' }}>
                <Typography variant="h6" component="h2">
                    Percent available memory consumed
                </Typography>
                <TT msg={`${used} of ${available} bytes used`}>
                    <Box display="flex" alignItems="center">
                        <Box width="100%" mr={1}>
                            <LinearProgress variant="determinate" value={value} />
                        </Box>
                        <Box minWidth={35}>
                            <Typography variant="body2" color="textSecondary">{`${value}%`}</Typography>
                        </Box>
                    </Box>
                </TT>
            </div>
        )
    }
}

export default Config