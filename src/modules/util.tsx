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

// does predicate apply to any?
export function any(things: any[], predicate: (arg: any) => boolean): boolean {
    for (const o of things) {
        if (predicate(o)) {
            return true
        }
    }
    return false
}

// does predicate apply to all?
export function all(things: any[], predicate: (arg: any) => boolean): boolean {
    for (const o of things) {
        if (!predicate(o)) {
            return false
        }
    }
    return true
}

// does predicate apply to none?
export function none(things: any[], predicate: (arg: any) => boolean): boolean {
    for (const o of things) {
        if (predicate(o)) {
            return false
        }
    }
    return true
}

// like ruby's flatten but can take any object as its parameter
export function flatten(val: any, ar: any[] = []): any[] {
    if (val.forEach) {
        val.forEach((v: any) => flatten(v, ar))
    } else {
        ar.push(val)
    }
    return ar
}

// find the least and greatest member of a list or set after flattening
export function minmax(val: any, comparator?: (a: any, b: any) => number): [min: any, max: any] {
    const ar = flatten(val)
    if (ar.length > 1) {
        ar.sort(comparator)
    }
    return [ar[0], ar[ar.length - 1]]
}

// convert a date into the format that date inputs expect -- there must be a better way
export function ymd(date: Date | null | undefined): string | undefined {
    if (date) {
        let y = date.getFullYear().toString()
        while (y.length < 4) {
            y = "0" + y
        }
        let m = (date.getMonth() + 1).toString()
        while (m.length < 2) {
            m = "0" + m
        }
        let d = (date.getDate() + 1).toString()
        while (d.length < 2) {
            d = "0" + d
        }
        return `${y}-${m}-${d}`
    }
}

// filters to the set of things which are unique according to the toString values of the members of the array
export function uniq(ar: any[]) : any[] {
    if (ar.length < 2) return ar
    const seen = new Set<string>()
    return ar.filter((v) => {
        if (seen.size == 0) {
            seen.add(v.toString())
            return true
        } else {
            const s = v.toString()
            if (seen.has(v)) {
                return false
            } else {
                seen.add(v)
                return true
            }
        }
    })
}