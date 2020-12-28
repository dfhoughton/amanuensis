import SwitchBoard from './modules/switchboard'
import { Details } from './modules/util'

interface SearchProps {
    switchboard: SwitchBoard,
    notify: (message: string, level?: "error" | "warning" | "info" | "success") => void
}

function Search({ switchboard, notify }: SearchProps) {
    return (
        <div className="search">
            <Details header="Search">
                <p></p>
            </Details>
        </div>
    )
}

export default Search