import React from 'react'
import { Details } from './modules/util'
import { App } from './App'

interface ProjectsProps {
    app: App,
}

function Projects({ app }: ProjectsProps) {
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