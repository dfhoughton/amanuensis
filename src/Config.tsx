import React from 'react'
import { Details } from './modules/util'

import Button from '@material-ui/core/Button'
import ClearAllIcon from '@material-ui/icons/ClearAll'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogContent from '@material-ui/core/DialogContent'
import DialogContentText from '@material-ui/core/DialogContentText'
import DialogTitle from '@material-ui/core/DialogTitle'
import { App, projectName } from './App'
import { Box, LinearProgress, Typography } from '@material-ui/core'

interface ConfigProps {
    app: App
}

interface ConfigState {
    initialized: boolean
    clearAllConfirmOpen: boolean
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
            clearAllConfirmOpen: false,
            amountMemoryUsed: 0,
            amountMemoryAvailable: 100,
        }
        this.app.switchboard.index?.memfree().
            then(([available, used]) => {
                this.setState({ amountMemoryUsed: used, amountMemoryAvailable: available })
            }).
            catch(e => this.app.error(e))
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
                {this.clearAllButton()}
                {this.progress()}
            </div>
        )
    }

    // generates the clear all button portion of the config panel
    // TODO make this use the app's confirm method instead
    clearAllButton() {
        if (!this.state.initialized) {
            return null
        }
        const clearHandler = () => {
            this.app.switchboard.index!.clear().then(() => {
                this.app.setState({ defaultProject: 0 })
                this.setState({ clearAllConfirmOpen: false })
            }).catch((message) => {
                console.error(message)
            })
        }
        return (
            <>
                <Typography variant="h6" component="h2">
                    Delete everything
                </Typography>
                <Button
                    onClick={() => this.setState({ clearAllConfirmOpen: true })}
                    variant="contained"
                    color="secondary"
                    startIcon={<ClearAllIcon />}
                >
                    Clear All
                </Button>
                <Dialog
                    open={this.state.clearAllConfirmOpen}
                    aria-labelledby="alert-dialog-title"
                    aria-describedby="alert-dialog-description"
                >
                    <DialogTitle id="alert-dialog-title">{"Clear all stored notes?"}</DialogTitle>
                    <DialogContent>
                        <DialogContentText id="alert-dialog-description">
                            Clear all non-configuration information from {projectName}.
                        This means all notes, all tags, all relations, and all projects will be
                        irretrievably gone.
                    </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => this.setState({ clearAllConfirmOpen: false })} >
                            Cancel
                    </Button>
                        <Button onClick={clearHandler} color="primary" autoFocus>
                            OK
                    </Button>
                    </DialogActions>
                </Dialog>
            </>
        )
    }

    progress() {
        const value = 100 * Math.round(this.state.amountMemoryUsed / this.state.amountMemoryAvailable)
        return (
            <div className="foo" style={{ marginTop: '1rem' }}>
                <Typography variant="h6" component="h2">
                    Percent available memory consumed
                </Typography>
                <Box display="flex" alignItems="center">
                    <Box width="100%" mr={1}>
                        <LinearProgress variant="determinate" value={value} />
                    </Box>
                    <Box minWidth={35}>
                        <Typography variant="body2" color="textSecondary">{`${value}%`}</Typography>
                    </Box>
                </Box>
            </div>
        )
    }
}

export default Config