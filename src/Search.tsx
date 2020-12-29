import { App } from './App'
import { Details } from './modules/util'

interface SearchProps {
    app: App
}

function Search({ app }: SearchProps) {
    return (
        <div className="search">
            <Details header="Search">
                <p></p>
            </Details>
        </div>
    )
}

export default Search