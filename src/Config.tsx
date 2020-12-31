import React from 'react'
import { Details } from './modules/util'

import Button from '@material-ui/core/Button'
import ClearAllIcon from '@material-ui/icons/ClearAll'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogContent from '@material-ui/core/DialogContent'
import DialogContentText from '@material-ui/core/DialogContentText'
import DialogTitle from '@material-ui/core/DialogTitle'
import { App } from './App'

interface ConfigProps {
    classes: any,
    app: App
}

interface ConfigState {
    clearAllConfirmOpen: boolean,
}

class Config extends React.Component<ConfigProps, ConfigState> {
    classes: any;
    app: App
    constructor(props: Readonly<ConfigProps>) {
        super(props)
        this.classes = props.classes
        this.app = props.app
        this.state = {
            clearAllConfirmOpen: false,
        }
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
            </div>
        )
    }

    // generates the clear all button portion of the config panel
    clearAllButton() {
        const clearHandler = () => {
            this.app.switchboard.index?.clear().then(() => {
                this.setState({ clearAllConfirmOpen: false })
            }).catch((message) => {
                console.error(message)
            })
        }
        return <div>
            <Button
                onClick={() => this.setState({ clearAllConfirmOpen: true })}
                variant="contained"
                color="secondary"
                className={this.classes.button}
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
                        Clear all non-configuration information from Amanuensis.
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
        </div>
    }
}

export default Config