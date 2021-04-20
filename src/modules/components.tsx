import { Accordion, AccordionDetails, AccordionSummary, makeStyles, Popover, Typography } from '@material-ui/core'
import Tooltip from '@material-ui/core/Tooltip'
import { Help, Star, StarBorder } from '@material-ui/icons'
import React, { ReactElement } from 'react'
import { uniq, ymd } from './util'

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
    let ar = uniq(dates.map((d) => ymd(d) || '')).sort()
    const joined = ar.join(', ')
    if (ar.length > 3) {
        ar = [ar[0], '...', ar[ar.length - 1]]
        return <TT msg={joined}><span>{ar.join(' ')}</span></TT>
    }
    return joined
}
