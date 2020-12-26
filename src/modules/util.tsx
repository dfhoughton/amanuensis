import Tooltip from '@material-ui/core/Tooltip'
import { ReactElement } from 'react'

// decorate an element with a tooltip
export function tt(msg: string, obj: ReactElement): ReactElement {
    return (<Tooltip title={msg} arrow>{obj}</Tooltip>)
}
