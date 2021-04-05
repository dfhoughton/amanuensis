import { Accordion, AccordionDetails, AccordionSummary, makeStyles, Popover, Typography } from '@material-ui/core'
import Tooltip from '@material-ui/core/Tooltip'
import { Help, Star, StarBorder } from '@material-ui/icons'
import React, { ReactElement } from 'react'
import { EditDistanceProperties, EssentialNoteBits } from './types'

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
export function Details({ children, header }: { children: ReactElement | ReactElement[], header?: string }): ReactElement {
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
    const cz = onClick ? (starred ? undefined : `${classes.unstarred} ${classes.pointy}`) : (starred ? undefined : classes.unstarred)
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
    closer: {
        float: 'right',
        cursor: 'pointer',
        fontWeight: 'bold',
        marginLeft: theme.spacing(1),
    }
}))

type ExpandoOpts = {
    text: string | ReactElement | React.ReactElement[],
    id: string,
    className?: string,
}

export function Expando({ text, id, className }: ExpandoOpts) {
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
                    <span className={classes.closer} onClick={() => setAnchorEl(null)}>
                        &times;
                    </span>
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
    let i: unknown
    return function (f: () => void) {
        return function () {
            if (i) {
                clearInterval(i as number)
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

// does this potential string contain some non-whitespace?
export const nws = (s: string | null | undefined) => /\S/.test(s || '')

export function squish(s: string): string {
    return s.replace(/^\s+|\s+$/g, '').replace(/\s+/, ' ')
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

// how many things in ar past the test?
export function count(ar: any[], test: (v: any) => boolean): number {
    let n = 0;
    for (let i = 0, l = ar.length; i < l; i++) {
        if (test(ar[i])) n++
    }
    return n
}

// determine note identity by comparing keypairs
export function sameNote(n1: EssentialNoteBits, n2: EssentialNoteBits): boolean {
    return n1.key[0] === n2.key[0] && n1.key[1] === n2.key[1]
}

// generate a modified Levenshtein distance calculator that optionally discounts modifications to the edges of words and
// substitutions of particular characters, e.g., a vowel for a vowel, so the distance between "woman" and "women" is less than
// that between "woman" and "wodan"
export function buildEditDistanceMetric({ prefix = 0, suffix = 0, insertables = '', similars = [] }: EditDistanceProperties): (w1: string, w2: string) => number {
    const cheapos = new Map<string, Set<string>>()
    for (const group of similars) {
        for (let i = 0, l = group.length; i < l; i++) {
            const c = group.charAt(i)
            let set = cheapos.get(c)
            if (!set) {
                set = new Set()
                cheapos.set(c, set)
            }
            for (let j = 0; j < l; j++) {
                const c2 = group.charAt(j)
                if (c2 !== c) {
                    set.add(c2)
                }
            }
        }
    }
    const intruders = new Set<String>()
    for (let i = 0, l = insertables.length; i < l; i++) {
        intruders.add(insertables.charAt(i))
    }
    function max(v1: number, v2: number): number {
        return v1 < v2 ? v2 : v1
    }
    function min(v1: number, v2: number, v3: number): number {
        return v1 < v2 ? (v1 < v3 ? v1 : v3) : (v2 < v3 ? v2 : v3)
    }
    // at this point are we in a suffix or prefix?
    function marginal(i1: number, i2: number, w1: string, w2: string): boolean {
        return max(i1, i2) < prefix || max(w1.length - i1, w2.length - i2) <= suffix
    }
    // the cost of adding or subtracting a character at this position
    function insertionCost(i1: number, i2: number, w1: string, w2: string): number {
        let w = 1
        if (intruders.size && Math.abs(i1 - i2) === 1) {
            const c = i1 < i2 ? w2[i2] : w1[i1]
            w = intruders.has(c) ? 0.5 : 1
        }
        return w * (marginal(i1, i2, w1, w2) ? 0.5 : 1)
    }
    // the cost of substituting one character for another at this position
    function substitutionCost(i1: number, i2: number, w1: string, w2: string): number {
        const c1 = w1.charAt(i1), c2 = w2.charAt(i2)
        if (c1 === c2) return 0
        let weight = marginal(i1, i2, w1, w2) ? 0.5 : 1
        if (cheapos.size && cheapos.get(c1)?.has(c2)) weight *= 0.5
        return weight
    }
    return function (w1: string, w2: string): number {
        const matrix: number[][] = []
        for (let i1 = 0, l = w1.length; i1 <= l; i1++) {
            const row: number[] = []
            matrix.push(row)
            for (let i2 = 0, l2 = w2.length; i2 <= l2; i2++) {
                let other
                if (!(i1 && i2)) { // we are in either the first row or the first column
                    if (!(i1 || i2)) { // we are in cell [0, 0]
                        row.push(0)
                    } else {
                        // the cost of pure deletion or insertion in the first column or row
                        other = i1 ? matrix[i1 - 1][0] : row[i2 - 1]
                        row.push(other + insertionCost(i1 - 1, i2 - 1, w1, w2))
                    }
                } else {
                    other = min(
                        matrix[i1][i2 - 1] + insertionCost(i1 - 1, i2 - 1, w1, w2),
                        matrix[i1 - 1][i2 - 1] + substitutionCost(i1 - 1, i2 - 1, w1, w2),
                        matrix[i1 - 1][i2] + insertionCost(i1 - 1, i2 - 1, w1, w2)
                    )
                    row.push(other)
                }
            }
        }
        return matrix[w1.length][w2.length]
    }
}

// for memoizing expensive similarity metrics used in sorting
export function cachedSorter(metric: (w1: string, w2: string) => number): (w1: string, w2: string) => number {
    const wordCache: Map<string, number> = new Map()
    const metricCache: Map<string, number> = new Map()
    function id(w: string): number {
        let i = wordCache.get(w)
        if (i === undefined) {
            i = wordCache.size
            wordCache.set(w, i)
        }
        return i
    }
    return function (w1: string, w2: string): number {
        let i1 = id(w1), i2 = id(w2)
        if (i2 < i1) {
            const i3 = i1
            i2 = i1
            i1 = i3
        }
        const i = `${i1}:${i2}`
        let m = metricCache.get(i)
        if (m === undefined) {
            m = metric(w1, w2)
            metricCache.set(i, m)
        }
        return m
    }
}