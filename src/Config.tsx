import React, { useState } from 'react'
import { Details, TT } from './modules/util'

import Button from '@material-ui/core/Button'
import ClearAllIcon from '@material-ui/icons/ClearAll'
import { App, projectName } from './App'
import { Box, LinearProgress, Typography as T } from '@material-ui/core'
import { GetApp, Publish } from '@material-ui/icons'

interface ConfigProps {
    app: App
}

type ConfigState = {
    initialized: boolean
    amountMemoryUsed: number
    amountMemoryAvailable: number
    initializedMemory: boolean
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
            initializedMemory: false,
        }
        this.app.switchboard.index!.memfree()
            .then(([a, u]) => this.setState({ amountMemoryUsed: u, amountMemoryAvailable: a, initializedMemory: true }))
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
                <Clear config={this} />
                <Progress config={this} />
                <DownloadUpload config={this} />
            </div>
        )
    }
}

export default Config

function DownloadUpload({ config }: { config: Config }) {
    const [showDropzone, setShowDropzone] = useState<boolean>(false)
    if (!config.state.initialized) return null

    const downloadHandler = () => {
        config.app.switchboard.then(() => {
            config.app.switchboard.index!.dump()
                .then((json) => {
                    const text = JSON.stringify(json)
                    const e = document.createElement('a');
                    e.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(text));
                    e.setAttribute('download', 'amanuensis.json');
                    e.style.display = 'none';
                    document.body.appendChild(e);
                    e.click();
                    document.body.removeChild(e);
                })
                .catch(e => config.app.error(`could not obtain JSON: ${e}`))
        })
    }
    const uploadHandler = (e: any) => {
        const element = document.getElementById('uploaded-state')! as HTMLInputElement
        if (element.files?.length) {
            const f = element.files[0]
            if (f.type === 'application/json') {
                const reader = new FileReader()
                reader.readAsText(f)
                reader.onload = (e) => {
                    const text = e.target?.result
                    if (text) {
                        try {
                            const data = JSON.parse(text.toString())
                            config.app.confirm({
                                title: `Replace current state with that saved in ${f.name}?`,
                                text: <>
                                    <p>
                                        This action will destroy any notes, projects, saved searches,
                                        or anything else you have done in Amanuensis in this browser.
                                        If this is your intention, continue.
                                    </p>
                                    <p>
                                        You may want to download the current state first into a different
                                        file as a backup in case there is a problem with {f.name} and the restoration
                                        from file does not go smoothly.
                                    </p>
                                </>,
                                callback: () => new Promise((resolve, reject) => {
                                    config.app.switchboard.index!.load(data)
                                        .then(() => {
                                            config.app.switchboard.rebootIndex()
                                                .then(() => {
                                                    config.app.clear()
                                                    resolve("")
                                                })
                                        })
                                        .catch(e => reject(`could not store state in ${f.name} on disk: ${e}`))
                                })
                            })
                        } catch (e) {
                            config.app.error(`the text in ${f.name} is not parsable as JSON: ${e.message}`)
                        }
                    }
                }
            } else {
                config.app.error(`the uploaded file, ${f.name}, is not JSON`)
            }
        }
    }

    return (<>
        <T variant="h6" component="h2">
            Download/Upload {projectName} State
            </T>
        <p>
            Downloading {projectName} state will give you a JSON file containing
                everything {projectName} has stored locally. This is is useful if you wish to
                back {projectName} up or transfer your notes to a different browser or
                machine.
            </p>
        <p>
            <strong>Note:</strong> restoring {projectName} from a downloaded JSON file will
                obliterate its current state. Any notes, projects, or anything else you may have
                created will be replaced with whatever was in the JSON file.
            </p>
        <Button
            endIcon={<GetApp />}
            onClick={downloadHandler}
            variant="contained"
        >
            Download {projectName} state
        </Button>
        <Box mt={1}>
            <Button
                endIcon={<Publish />}
                variant="contained"
                component="label"
            >
                Upload {projectName} state
                <input
                    id="uploaded-state"
                    type="file"
                    onChange={uploadHandler}
                    hidden
                />
            </Button>
        </Box>
    </>)
}

function Progress({ config }: { config: Config }) {
    if (!config.state.initializedMemory) return null

    const { amountMemoryUsed: used, amountMemoryAvailable: available } = config.state;
    const value = 100 * Math.round(used / available)
    return (
        <Box mt={1}>
            <T variant="h6" component="h2">
                Percent available memory consumed
            </T>
            <TT msg={`${used} of ${available} bytes used`}>
                <Box display="flex" alignItems="center">
                    <Box width="100%" mr={1}>
                        <LinearProgress variant="determinate" value={value} />
                    </Box>
                    <Box minWidth={35}>
                        <T variant="body2" color="textSecondary">{`${value}%`}</T>
                    </Box>
                </Box>
            </TT>
        </Box>
    )
}

// generates the clear all button portion of the config panel
function Clear({ config }: { config: Config }) {
    if (!config.state.initialized) {
        return null
    }
    return (
        <>
            <T variant="h6" component="h2">
                Delete everything
            </T>
            <Button
                onClick={() => config.app.confirm({
                    title: 'Clear all stored notes?',
                    text: `Clear all non-configuration information from ${projectName}.
                    This means all notes, all tags, all relations, all projects, all
                    sorters, and all saved searches will be
                    irretrievably gone.`,
                    callback: () => new Promise((resolve, reject) => {
                        config.app.switchboard.index!.clear().then(() => {
                            config.app.setState({ defaultProject: 0 })
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
            <T variant="h6" component="h2">
                Delete all saved searches
            </T>
            <Button
                onClick={() => config.app.confirm({
                    title: 'Delete All Saved Searches?',
                    text: 'This action cannot be undone.',
                    callback: () => new Promise((resolve, reject) => {
                        config.app.switchboard.index!.clearStacks()
                            .then(() => {
                                config.app.setState({ stack: undefined })
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