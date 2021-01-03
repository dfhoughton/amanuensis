import { Accordion, AccordionDetails, AccordionSummary, makeStyles, Typography } from '@material-ui/core'
import Tooltip from '@material-ui/core/Tooltip'
import { Help, Star, StarBorder } from '@material-ui/icons'
import { ReactElement } from 'react'

interface TTProps {
    children: ReactElement,
    msg: string,
    wrap?: boolean,
    placement?: "top-start" | "top" | "top-end" | "right-start" | "right" | "right-end" | "bottom-start" | "bottom" | "bottom-end" | "left-start" | "left" | "left-end"
}

// decorate an element with a tooltip
export function TT({ children, msg, placement, wrap }: TTProps): ReactElement {
    const child = wrap ? <span>{children}</span> : children
    if (placement) {
        return (
            <Tooltip title={msg} placement={placement} arrow>{child}</Tooltip>
        )
    } else {
        return (
            <Tooltip title={msg} arrow>{child}</Tooltip>
        )
    }
}

const detailsStyles = makeStyles((theme) => ({
    root: {
        marginBottom: '1rem'
    },
    header: {
        fontSize: theme.typography.pxToRem(16),
        fontWeight: theme.typography.fontWeightBold
    },
    details: {
        fontSize: theme.typography.pxToRem(14),
    }
}))

// a widget that displays the contents of a tab, a help button, and some expandable help text
export function Details({ children, header, otherAccordions }: { children: ReactElement, header?: string, otherAccordions?: ReactElement[] }): ReactElement {
    const classes = detailsStyles()
    const headerElement = !header ? null :
        <Typography>
            <div className={classes.header}>{header}</div>
        </Typography>
    return (
        <div className={classes.root}>
            <Accordion>
                <AccordionSummary expandIcon={<Help />}>
                    {headerElement}
                </AccordionSummary>
                <AccordionDetails>
                    <Typography>
                        <div className={classes.details}>
                            {children}
                        </div>
                    </Typography>
                </AccordionDetails>
                {otherAccordions}
            </Accordion>
        </div>
    )
}

const starStyles = makeStyles((theme) => ({
    unstarred: {
        color: theme.palette.grey[500]
    },
    pointy: {
        cursor: 'pointer',
    }
}))

// for making a gold/grey-bordered star for bookmarks and such
export function Mark({ starred, onClick }: { starred: boolean, onClick?: () => void }) {
    const classes = starStyles()
    const cz = onClick ? (starred ? classes.pointy : `${classes.unstarred} ${classes.pointy}`) : (starred ? '' : classes.unstarred)
    return starred ? <Star color="secondary" onClick={onClick} className={cz} /> : <StarBorder className={cz} onClick={onClick} />
}

// create a debounced version of a function
//   debounce()(() => this.setState({ foo: 1 }))
export function debounce(interval: number = 200): (f: () => void) => () => void {
    let i: NodeJS.Timeout | undefined
    return function (f: () => void) {
        return function () {
            if (i) {
                clearInterval(i)
            }
            i = setTimeout(f, interval)
        }
    }
}
