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
                </div>
            </Details>
        </div>
    )
}

export default Projects