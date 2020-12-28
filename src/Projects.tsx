import React from 'react'
import SwitchBoard from './modules/switchboard'
import { Details } from './modules/util'

interface ProjectsProps {
    switchboard: SwitchBoard,
    notify: (message: string, level?: "error" | "warning" | "info" | "success") => void
}

function Projects({ switchboard, notify }: ProjectsProps) {
    return (
        <div className="projects">
            <Details header="Projects">
                <p>
                    Projects are collections of related notes. Notes always live
                    in one and only one project.
                </p>
            </Details>
        </div>
    )
}

export default Projects