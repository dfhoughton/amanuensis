import React from 'react'
import SwitchBoard from './modules/switchboard'

import Button from '@material-ui/core/Button'
import ClearAllIcon from '@material-ui/icons/ClearAll'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogContent from '@material-ui/core/DialogContent'
import DialogContentText from '@material-ui/core/DialogContentText'
import DialogTitle from '@material-ui/core/DialogTitle'

interface ProjectsProps {
    switchboard: SwitchBoard,
    notify: (message: string, level?: "error" | "warning" | "info" | "success") => void
}

function Projects(props: ProjectsProps) {
    const {switchboard, notify} = props
    return (
        <div className="projects">
            <p>
                Projects are collections of related notes. Notes always live
                in one and only one project.
            </p>
        </div>
    )
}

export default Projects