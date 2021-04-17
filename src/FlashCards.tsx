import { Button, Collapse, Grid, IconButton, Link, makeStyles, Typography as T } from "@material-ui/core";
import { ArrowForward, Done, School, SentimentVeryDissatisfied, SentimentVerySatisfied } from "@material-ui/icons";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { App, Section } from "./App";
import { deepClone } from "./modules/clone";
import { enkey } from "./modules/storage";
import { CardStack, NoteRecord, PhraseInContext } from "./modules/types";
import { Details, pick, rando } from "./modules/util";
import { Phrase } from "./Note";
const confetti = require('canvas-confetti')

export type FlashCardState = {
    stack: CardStack | null   // metadata about the current stack
    notes: NoteRecord[]       // the note records in the stack
    index: number             // -1 means there are no cards left to try
    showingGist: boolean      // is the gist the thing being tested or is it the phrase?
    done: Set<string>         // those cards in the stack that we are done with, either temporarily or permanently
    revealed: boolean         // whether we've flipped the current card yet
    initialize: boolean       // whether to init on render
    judgement: boolean | null // the result of the last self-assessment on the current flashcard
    total: number             // the total number of cards to flip
    which: number             // the index displayed
    conceal: boolean          // whether the gist and phrase are momentarily concealed
    banner: string            // celebratory phrase
    colors: string[]          // confetti colors
}

export default function FlashCards({ app }: { app: App }) {
    const state = app.state.flashcards || {
        stack: null,
        notes: [],
        index: -1,
        showingGist: true,
        done: new Set(),
        revealed: false,
        initialize: true,
        judgement: null,
        total: 0,
        which: 0,
        conceal: false,
        banner: '',
        colors: [],
    }
    const setState = (s: FlashCardState) => {
        app.setState({flashcards: s})
    }
    if (confettiColors.length && !state.banner) {
        prepareCelebration(state, setState)
    }
    if (state.initialize) {
        init(app, state, setState)
    }
    return (
        <>
            <Details header="Flashcards">
                <DetailsContent />
            </Details>
            {!!state.notes.length && <CurrentCard app={app} state={state} setState={setState} />}
            {!state.notes.length && <NoResults state={state} app={app} />}
            <canvas
                id="confetti"
                style={{
                    position: 'fixed',
                    top: 0,
                    pointerEvents: 'none',
                    width: '100%',
                    height: '100%',
                }}
                />
        </>
    )
}

// do this once per stack
function prepareCelebration(state: FlashCardState, setState: (s: FlashCardState) => void, set: boolean = true) {
    const banner = pick(successStrings)
    console.log('banner', banner)
    const colors: string[] = []
    for (let i = 0, l = rando(20); i < l; i++) {
        colors.push(pick(confettiColors))
    }
    console.log('colors', colors)
    const s : FlashCardState = set ? deepClone(state) : state
    s.banner = banner
    s.colors = colors
    if (set) {
        setState(s)
    }
}

let confettiCannon : any

const throwConfetti = (state : FlashCardState) => {
    if (!confettiCannon) {
        const e = document.getElementById('confetti')
        confettiCannon = confetti.create(e, {
            resize: true,
            useWorker: true
        });
    }
    confettiCannon({ colors: state.colors })
}

const confettiColors: string[] = []

const currentCardStyles = makeStyles((theme) => {
    confettiColors.push(theme.palette.primary.dark)
    confettiColors.push(theme.palette.primary.dark)
    confettiColors.push(theme.palette.primary.dark)
    confettiColors.push(theme.palette.secondary.dark)
    confettiColors.push(theme.palette.secondary.dark)
    confettiColors.push(theme.palette.secondary.dark)
    confettiColors.push(theme.palette.error.dark)
    confettiColors.push(theme.palette.success.dark)
    return {
        exhausted: {
            padding: theme.spacing(2),
        },
        name: {

        },
        description: {
            fontStyle: "italic",
        },
        stats: {
            fontWeight: 'bold',
            color: theme.palette.grey[500],
            marginBottom: theme.spacing(2),
        },
        icons: {
            marginTop: theme.spacing(2),
        },
        good: {
            color: theme.palette.success.dark,
        },
        bad: {
            color: theme.palette.error.dark,
        },
        next: {
            color: theme.palette.primary.main,
        },
        done: {
            color: theme.palette.secondary.dark,
        },
        success: {
            color: theme.palette.secondary.dark,
            fontWeight: 'bold',
            fontSize: 'larger',
        }
    }
})

function CurrentCard({ app, state, setState }: { app: App, state: FlashCardState, setState: (s: FlashCardState) => void }) {
    const classes = currentCardStyles()
    const s: FlashCardState = deepClone(state)
    const removeMe = () => {
        app.confirm({
            title: "Remove from all flashcard decks?",
            text: <>
                Remove "{note.citations[note.canonicalCitation || 0].phrase}"
                from all flashcard decks? You can add any removed card back
                to the decks by clicking the <Done className={classes.good} fontSize="small" />
                mark in search results.
                </>,
            callback: () => {
                return new Promise((resolve, reject) => {
                    note.done = true
                    app.switchboard.index!.save(note)
                        .then(() => {
                            s.done.add(enkey(note.key))
                            next(s, setState)
                            resolve(`
                                Removed
                                "${note.citations[note.canonicalCitation || 0].phrase}"
                                from flashcard decks.`)
                        })
                        .catch(e => reject(e))
                })
            }
        })
    }
    const good = () => {
        addTrial(true, note, app, s, setState)
        if (done(s)) {
            throwConfetti(s)
        }
    }
    const flip = () => {
        const e = document.getElementById('flipper')
        if (e) {
            e.classList.toggle('flipper')
            s.revealed = true
            setState(s)
            if (done(s)) {
                throwConfetti(s)
            }
        }
    }
    const keyCallback = (event: KeyboardEvent, handler: any) => {
        switch(handler.key) {
            case 'g':
                if (s.revealed && !done(s)) good()
                break
            case 'b':
                if (s.revealed && !done(s)) addTrial(false, note, app, s, setState)
                break
            case 'f':
                flip()
                break
            case 'n':
                next(s, setState)
                break
            case 'd':
                removeMe()
                break
            default:
                console.error('unhandled keyboard event, check code',{event, handler})
        }
    }
    useHotkeys('g,b,f,n,d', keyCallback, {}, [s])
    const note = s.notes[s.index]

    if (s.index === -1) {
        return (
            <Grid container spacing={2} className={classes.exhausted}>
                <Grid container justify="center" className={classes.exhausted}>
                    You're done with this stack.
                </Grid>
                <Grid container justify="center" className={classes.exhausted}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => {
                            prepareCelebration(s, setState, false)
                            init(app, s, setState)
                        }}
                    >
                        Restart?
                    </Button>
                </Grid>
            </Grid>
        )
    }

    return (
        <>
            {!!s.stack?.name && <Grid container justify="center" className={classes.name}>
                <T variant="h4">{s.stack?.name}</T>
            </Grid>}
            {!!s.stack?.description && <Grid container justify="center" className={classes.description}>
                <p>{s.stack.description}</p>
            </Grid>}
            <Grid container className={classes.stats} justify="space-between">
                <Grid item>
                    {app.switchboard.index!.reverseProjectIndex.get(note.key[0])}
                </Grid>
                <Grid item>
                    {done(s) && <T className={classes.success}>{s.banner}!</T>}
                </Grid>
                <Grid item>
                    {state.which} of {state.total}
                </Grid>
            </Grid>
            <FlashCard
                gist={note.gist}
                showingGist={s.showingGist}
                phrase={note.citations[note.canonicalCitation || 0]}
                conceal={s.conceal}
                judgment={s.judgement}
                onClick={flip}
                id="flipper"
            />
            <Grid
                container
                justify="space-evenly"
                className={classes.icons}
            >
                <Grid item>
                    <Collapse in={s.revealed && !done(s)}>
                        <IconButton
                            disabled={s.judgement === false}
                            onClick={() => addTrial(false, note, app, s, setState)}
                        >
                            <SentimentVeryDissatisfied fontSize="large" className={classes.bad} />
                        </IconButton>
                    </Collapse>
                </Grid>
                <Grid item>
                    <IconButton
                        onClick={removeMe}
                    >
                        <Done fontSize="large" className={classes.done} />
                    </IconButton>
                </Grid>
                <Grid item>
                    <IconButton
                        onClick={() => next(s, setState)}
                    >
                        <ArrowForward fontSize="large" className={classes.next} />
                    </IconButton>
                </Grid>
                <Grid item>
                    <Collapse in={s.revealed && !done(s)}>
                        <IconButton
                            disabled={s.judgement === true}
                            onClick={good}
                        >
                            <SentimentVerySatisfied fontSize="large" className={classes.good} />
                        </IconButton>
                    </Collapse>
                </Grid>
            </Grid>
        </>
    )
}

const successStrings = [
    "Success",
    "Good job",
    "Excellent",
    "Well done",
    "Congratulations",
    "Far out",
    "Tubular",
    "Boss",
    "Rad",
    "Awesome",
    "Cool",
    "Ausgezeichnet",
    "Out of sight",
    "A+",
    "Outstanding",
    "Llongyfarchiadau",
    "Bien fait",
    "Kiitos",
    "Excelente",
    "Отлично",
    "ยอดเยี่ยม",
    "出色的",
    "優れた",
    "Bora",
]

const noResultStyles = makeStyles((theme) => ({
    root: {
        padding: theme.spacing(2)
    },
    link: {
        margin: '0 1ch',
    },
}))

function NoResults({ state, app }: { state: FlashCardState, app: App }) {
    const classes = noResultStyles()
    return (
        <Grid container justify="center" className={classes.root}>
            There is nothing to show. To obtain some flashcards
            <Link onClick={() => app.setState({ tab: Section.search })} className={classes.link}>
                search
            </Link>
            for some notes and then click the
            <School color="primary" fontSize="small" className={classes.link} />
            button that appears when you find some.
        </Grid>
    )
}

// explanation of how flashcard stacks work
function DetailsContent() {
    return (
        <>
            <p>
                With flashcards you can transform a search into a quiz to test your knowledge.
                Each note found by the query is transformed into a flashcard with the gist on
                one side and the canonical citation on the other. If you move your mouse over
                the flash card it will flip, revealing the other side.
            </p>
            <FlashCard
                showingGist={true}
                phrase={{ before: 'Behold the fuzzy ', phrase: 'cat', after: '.' }}
                gist="a small, carnivorous mammal that likes laser pointers"
                id="demo-flipper"
                onClick={() => {
                    const e = document.getElementById('demo-flipper')
                    if (e) {
                        e.classList.toggle('flipper')
                    }
                }}
            />
            <p>
                Below each flashcard are two
            </p>
        </>
    )
}

const cardStyles = makeStyles((theme) => ({
    root: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    flipCard: {
        width: '300px',
        height: '300px',
        perspective: '1000px',
        // '&:hover .flip-card-inner': {
        //     transform: 'rotateY(180deg)'
        // },
        '&.flipper .flip-card-inner': {
            transform: 'rotateY(180deg)'
        },
    },
    flipCardInner: {
        position: 'relative',
        width: '100%',
        height: '100%',
        textAlign: 'center',
        transition: 'transform 0.8s',
        transformStyle: 'preserve-3d',
    },
    flipCardCommon: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid black',
        backfaceVisibility: 'hidden',
        backgroundColor: theme.palette.background.paper,
        boxSizing: 'border-box',
        borderRadius: '6px',
    },
    flipCardBack: {
        transform: 'rotateY(180deg)',
    },
    gist: {
        borderColor: theme.palette.secondary.dark,
        fontSize: 'larger',
        padding: theme.spacing(3),
    },
    phrase: {
        borderColor: theme.palette.primary.dark,
        padding: theme.spacing(1),
    },
    good: {
        borderColor: theme.palette.secondary.dark,
        boxShadow: `0 0 ${theme.spacing(2)}px ${theme.palette.secondary.dark}`,
        transition: 'box-shadow 0.5s'
    },
    bad: {
        borderColor: theme.palette.error.dark,
        boxShadow: `0 0 ${theme.spacing(2)}px ${theme.palette.error.dark}`,
        transition: 'box-shadow 0.5s',
    },
}))

type FlashCardProps = {
    showingGist: boolean
    phrase: PhraseInContext
    gist: string
    onClick?: () => void
    judgment?: boolean | null
    id?: string
    conceal?: boolean
}
function FlashCard({ showingGist, phrase: phraseInContext, gist, onClick = () => { }, judgment, id, conceal }: FlashCardProps) {
    const classes = cardStyles()
    const citation = <Phrase hasWord={true} phrase={phraseInContext} trim={80} />
    const definition = <span>{gist}</span>
    const glow = judgment == null ? '' : judgment ? classes.good : classes.bad
    const cz1 = `${showingGist ? classes.gist : classes.phrase} ${classes.flipCardCommon} ${glow}`
    const cz2 = `${showingGist ? classes.phrase : classes.gist} ${classes.flipCardBack} ${classes.flipCardCommon} ${glow}`
    return (
        <div className={classes.root} onClick={onClick}>
            <div className={classes.flipCard} id={id}>
                <div className={`${classes.flipCardInner} flip-card-inner`}>
                    <div className={`in-flipper ${cz1}`}>
                        {!conceal && <>{showingGist ? definition : citation}</>}
                        
                    </div>
                    <div className={`in-flipper ${cz2}`}>
                        {!conceal && <>{showingGist ? citation : definition}</>}
                    </div>
                </div>
            </div>
        </div>
    )
}

function init(app: App, state: FlashCardState, setState: (s: FlashCardState) => void): void {
    const name = app.state.stack
    if (name !== undefined) {
        const s: FlashCardState = deepClone(state)
        app.switchboard.index!.retrieveStack(name)
            .then(({ stack, notes }) => {
                s.stack = stack
                stack.lastAccess = new Date()
                app.switchboard.index!.saveStack(stack)
                    .catch(e => app.error(`could not save last stack access time: ${e}`))
                const done: Set<string> = new Set();
                for (const n of notes) {
                    if (n.done) {
                        done.add(enkey(n.key))
                    }
                }
                s.total = notes.length - done.size
                s.index = -1
                s.revealed = false
                s.done = done
                s.showingGist = false
                notes.sort(sortNotes(false, done))
                s.notes = notes
                s.initialize = false
                s.which = 0
                next(s, setState)
            })
            .catch(e => app.error(e))
    }
}

// show the next card
function next(s: FlashCardState, setState: (s: FlashCardState) => void): void {
    const { done, notes } = s
    s.revealed = false
    s.judgement = null
    if (done.size === notes.length) {
        s.index = -1
        setState(s)
    } else {
        let i = s.index + 1
        while (i < notes.length) {
            if (done.has(enkey(notes[i].key))) {
                i++
            } else {
                break
            }
        }
        if (i === notes.length) {
            s.showingGist = !s.showingGist
            s.index = -1
            s.which = 0
            if (!s.showingGist) {
                // we've done both sides of the stack, recalculate total
                s.total = remaining(s)
            }
            next(s, setState)
        } else {
            s.index = i
            s.which += 1
            const e = document.getElementById('flipper')
            if (e) {
                // if we've been using the keyboard flipper, we need to hide the text before
                // unflipping it
                s.conceal = true
                const newState : FlashCardState = deepClone(s)
                setTimeout(() => { newState.conceal = false; setState(newState) }, 250)
                e.classList.remove('flipper')
            }
            setState(s)
        }
    }
}

function addTrial(judgement: boolean, note: NoteRecord, app: App, state: FlashCardState, setState: (s: FlashCardState) => void) {
    if (!note.trials) note.trials = []
    if (state.judgement !== null) {
        note.trials.pop()
    }
    state.judgement = judgement
    note.trials.unshift({
        result: judgement,
        when: new Date(),
        type: state.showingGist ? "gist" : "phrase"
    })
    // success with both sides?
    if (state.showingGist) {
        const prev = note.trials.find((t) => t.type === "phrase")
        if (prev?.result) {
            const key = enkey(note.key)
            if (judgement) {
                state.done.add(key)
            } else {
                state.done.delete(key)
            }
        }
    }
    setState(state)
    app.switchboard.index!.save(note)
        .catch(e => app.error(`could not save result of trial: ${e}`))
}

const remaining = (state: FlashCardState) => state.notes.length - state.done.size

const done = (state: FlashCardState) => remaining(state) === 0

// try really hard to show the easy stuff first
function sortNotes(showingGist: boolean, done: Set<string>): (a: NoteRecord, b: NoteRecord) => number {
    return (a, b) => {
        // check to see if we've marked one or the other as done
        const aHas = done.has(enkey(a.key))
        const bHas = done.has(enkey(b.key))
        if (aHas || bHas) {
            if (aHas && bHas) return 0
            return aHas ? 1 : -1
        }
        if (a.trials || b.trials) {
            if (a.trials && b.trials) {
                const aThisShown = a.trials.filter((t) => t.type === (showingGist ? "gist" : "phrase"))
                const bThisShown = b.trials.filter((t) => t.type === (showingGist ? "gist" : "phrase"))
                if (aThisShown.length || bThisShown.length) {
                    if (aThisShown.length && bThisShown.length) {
                        if (aThisShown[0].result || bThisShown[0].result) {
                            if (aThisShown[0].result && bThisShown[0].result) {
                                // see if we're worse with one than the other
                                let aSuccess = 0, aFailure = 0, bSuccess = 0, bFailure = 0
                                for (const t of aThisShown) {
                                    if (t.result) { aSuccess++ } else { aFailure++ }
                                }
                                for (const t of bThisShown) {
                                    if (t.result) { bSuccess++ } else { bFailure++ }
                                }
                                // we know we have at least one success at each
                                const aRatio = aFailure / aSuccess
                                const bRatio = bFailure / bSuccess
                                if (aRatio > bRatio) return 1 // we're worse at a
                                if (bRatio > aRatio) return -1 // we're worse at b
                                // maybe we failed more with one than the other?
                                if (aFailure > bFailure) return 1
                                if (bFailure > aFailure) return -1
                                let aTimeTotal = 0, bTimeTotal = 0
                                if (aFailure) {
                                    // maybe the failures with one were more recent than the failures with the other
                                    for (const t of aThisShown) {
                                        if (!t.result) aTimeTotal += t.when.getTime()
                                    }
                                    for (const t of bThisShown) {
                                        if (!t.result) bTimeTotal += t.when.getTime()
                                    }
                                    if (aTimeTotal < bTimeTotal) return 1 // a's failures are on net older
                                    if (bTimeTotal < aTimeTotal) return -1 // b's failures are on net older
                                }
                                aTimeTotal = 0
                                bTimeTotal = 0
                                // maybe the successes with one were more recent than the successes with the other
                                for (const t of aThisShown) {
                                    if (t.result) aTimeTotal += t.when.getTime()
                                }
                                for (const t of bThisShown) {
                                    if (t.result) bTimeTotal += t.when.getTime()
                                }
                                if (aTimeTotal < bTimeTotal) return 1 // a's successes are on net older
                                if (bTimeTotal < aTimeTotal) return -1 // b's successes are on net older
                            } else {
                                // if we last failed with one but not the other, show the one we failed with last
                                return aThisShown[0].result ? -1 : 1
                            }
                        } else {
                            // see if we're better at one than the other -- the most recent result for each was failure
                            // (there's much repetition here with code above; perhaps a refactor?)

                            // see if we're worse with one than the other
                            let aSuccess = 0, aFailure = 0, bSuccess = 0, bFailure = 0
                            for (const t of aThisShown) {
                                if (t.result) { aSuccess++ } else { aFailure++ }
                            }
                            for (const t of bThisShown) {
                                if (t.result) { bSuccess++ } else { bFailure++ }
                            }
                            // we know we have at least one success at each
                            const aRatio = aSuccess / aFailure
                            const bRatio = bSuccess / bFailure
                            if (aRatio < bRatio) return 1 // we're worse at a
                            if (bRatio < aRatio) return -1 // we're worse at b
                            // maybe we failed more with one than the other?
                            if (aFailure > bFailure) return 1
                            if (bFailure > aFailure) return -1
                            let aTimeTotal = 0, bTimeTotal = 0
                            if (aFailure) {
                                // maybe the failures with one were more recent than the failures with the other
                                for (const t of aThisShown) {
                                    if (!t.result) aTimeTotal += t.when.getTime()
                                }
                                for (const t of bThisShown) {
                                    if (!t.result) bTimeTotal += t.when.getTime()
                                }
                                if (aTimeTotal < bTimeTotal) return -1 // a's failures are on net older
                                if (bTimeTotal < aTimeTotal) return 1 // b's failures are on net older
                            }
                            aTimeTotal = 0
                            bTimeTotal = 0
                            // maybe the successes with one were more recent than the successes with the other
                            for (const t of aThisShown) {
                                if (t.result) aTimeTotal += t.when.getTime()
                            }
                            for (const t of bThisShown) {
                                if (t.result) bTimeTotal += t.when.getTime()
                            }
                            if (aTimeTotal < bTimeTotal) return 1 // a's successes are on net older
                            if (bTimeTotal < aTimeTotal) return -1 // b's successes are on net older
                        }
                    } else {
                        // if we haven't tried one of them with this face showing, show that one
                        return aThisShown.length ? 1 : -1
                    }
                }
            } else {
                // if we haven't tried one of them, do that one first
                return a.trials ? 1 : -1
            }
        }
        // for lack of any other determinants up to this point, use alphabetical order
        const aCitation = a.citations[a.canonicalCitation || 0]
        const bCitation = b.citations[b.canonicalCitation || 0]
        if (aCitation.phrase < bCitation.phrase) return -1
        if (bCitation.phrase < aCitation.phrase) return 1
        // this is highly unlikely, but if all else fails, show the one with the older most recent citation
        return aCitation.when[0] < bCitation.when[0] ? -1 : 1
    }
}