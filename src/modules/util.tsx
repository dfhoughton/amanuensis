import { Accordion, AccordionDetails, AccordionSummary, makeStyles, Popover, Typography } from '@material-ui/core'
import Tooltip from '@material-ui/core/Tooltip'
import { Help, Star, StarBorder } from '@material-ui/icons'
import React, { ReactElement } from 'react'
import { EssentialNoteBits } from './types'

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
export function Mark({ starred, onClick, fontSize, style }: { starred: boolean, style?: any, fontSize?: any, onClick?: () => void }) {
    const classes = starStyles()
    const cz = onClick ? (starred ? classes.pointy : `${classes.unstarred} ${classes.pointy}`) : (starred ? '' : classes.unstarred)
    const opts = { onClick, fontSize, style, className: cz }
    return starred ? <Star color="secondary" {...opts} /> : <StarBorder {...opts} />
}

const expandoStyles = makeStyles((theme) => ({
    root: {
        display: 'flex',
    },
    wrapper: {
        padding: theme.spacing(1)
    },
    item: {
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        minWidth: 0,
        cursor: 'pointer',
    },
}))

export function Expando({ text, id, className }: { text: string | ReactElement | React.ReactElement[], id: string, className?: string }) {
    const classes = expandoStyles()
    const [anchorEl, setAnchorEl] = React.useState<null | Element>(null);
    const open = Boolean(anchorEl);
    const cz = className ? `${className} ${classes.root}` : classes.root
    return (
        <span className={cz}>
            <span className={classes.item} onClick={(event) => { setAnchorEl(event.currentTarget) }}>
                {text}
            </span>
            <Popover
                id={id}
                open={open}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
            >
                <div className={classes.wrapper}>
                    {text}
                </div>
            </Popover>

        </span>
    )
}

// a general way to format a sequence of timestamps
export function formatDates(dates: Date[]): string | React.ReactElement {
    let ar = uniq(dates.map((d) => ymd(d))).sort()
    const joined = ar.join(', ')
    if (ar.length > 3) {
        ar = [ar[0], '...', ar[ar.length - 1]]
        return <TT msg={joined}><span>{ar.join(' ')}</span></TT>
    }
    return joined
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
        let y = date.getFullYear()
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
export function uniq(ar: any[], by: (v: any) => string = (v) => v.toString()): any[] {
    if (ar.length < 2) return ar
    const seen = new Set<string>()
    return ar.filter((v) => {
        if (seen.size == 0) {
            seen.add(by(v))
            return true
        } else {
            const s = by(v)
            if (seen.has(s)) {
                return false
            } else {
                seen.add(s)
                return true
            }
        }
    })
}

// determine note identity by comparing keypairs
export function sameNote(n1: EssentialNoteBits, n2: EssentialNoteBits): boolean {
    return n1.key[0] === n2.key[0] && n1.key[1] === n2.key[1]
}