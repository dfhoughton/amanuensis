import { makeStyles } from "@material-ui/core";
import { useState } from "react";
import { App } from "./App";
import { deepClone } from "./modules/clone";
import { enkey } from "./modules/storage";
import { CardStack, NoteRecord, PhraseInContext } from "./modules/types";
import { Details } from "./modules/util";
import { Phrase } from "./Note";

export default function FlashCards({ app }: { app: App }) {
    const [stack, setStack] = useState<CardStack | null>(null)
    const [notes, setNotes] = useState<NoteRecord[]>([])
    const [index, setIndex] = useState<number>(-1) // -1 will mean there are no more cards to try
    const [showingGist, setShowingGist] = useState<boolean>(false)
    const [done, setDone] = useState<Set<string>>(new Set())
    const [revealed, setRevealed] = useState<boolean>(false)
    const next = nextNote(notes, index, done, setIndex, showingGist, setShowingGist)
    const initFlashCardStack = init({ app, setStack, setNotes, setShowingGist, setDone, next })
    initFlashCardStack(app.state.stack)
    return (
        <div>
            <Details header="Flashcards">
                <DetailsContent />
            </Details>
        </div>
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
            />
            <p>
                Below each flashcard are two 
            </p>
        </>
    )
}

const phraseStyles = makeStyles((theme) => ({
    root: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    flipCard: {
        width: '300px',
        height: '300px',
        perspective: '1000px',
        '&:hover .flip-card-inner': {
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
}))


function FlashCard({ showingGist, phrase: phraseInContext, gist }: { showingGist: boolean, phrase: PhraseInContext, gist: string }) {
    const classes = phraseStyles()
    const citation = <Phrase hasWord={true} phrase={phraseInContext} />
    const definition = <span>{gist}</span>
    return (
        <div className={classes.root}>
            <div className={classes.flipCard}>
                <div className={`${classes.flipCardInner} flip-card-inner`}>
                    <div className={`${showingGist ? classes.gist : classes.phrase} ${classes.flipCardCommon}`}>
                        {showingGist ? definition : citation}
                    </div>
                    <div className={`${showingGist ? classes.phrase : classes.gist} ${classes.flipCardBack} ${classes.flipCardCommon}`}>
                        {showingGist ? citation : definition}
                    </div>
                </div>
            </div>
        </div>
    )
}

interface initProps {
    app: App
    setStack: (stack: CardStack) => void
    setNotes: (notes: NoteRecord[]) => void
    setShowingGist: (showingGist: boolean) => void
    setDone: (done: Set<string>) => void
    next: () => void
}
function init({ app, setStack, setNotes, setShowingGist, setDone, next }: initProps): (name: string | undefined) => void {
    return (name) => {
        if (name !== undefined) {
            app.switchboard.index!.retrieveStack(name)
                .then(({ stack, notes }) => {
                    setStack(stack)
                    const done: Set<string> = new Set();
                    for (const n of notes) {
                        if (n.done) {
                            done.add(enkey(n.key))
                        }
                    }
                    setDone(done)
                    setShowingGist(false)
                    notes.sort(sortNotes(false, done))
                    setNotes(notes)
                    next()
                })
                .catch(e => app.error(e))
        }
    }
}

// function that figures out the next card to show
function nextNote(notes: NoteRecord[], index: number, done: Set<string>, setIndex: (i: number) => void, showingGist: boolean, setShowingGist: (b: boolean) => void): () => void {
    const f = () => {
        if (done.size === notes.length) {
            setIndex(-1)
        } else {
            let i = index + 1
            while (i < notes.length) {
                if (done.has(enkey(notes[i].key))) {
                    i++
                } else {
                    break
                }
            }
            if (i === notes.length) {
                setShowingGist(!showingGist)
                setIndex(-1)
                f()
            } else {
                setIndex(i)
            }
        }
    }
    return f
}

// try really hard to show first the stuff we've been having more trouble with
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
                                if (aRatio > bRatio) return -1 // we're worse at a
                                if (bRatio > aRatio) return 1 // we're worse at b
                                // maybe we failed more with one than the other?
                                if (aFailure > bFailure) return -1
                                if (bFailure > aFailure) return 1
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
                                if (aTimeTotal < bTimeTotal) return -1 // a's successes are on net older
                                if (bTimeTotal < aTimeTotal) return 1 // b's successes are on net older
                            } else {
                                // if we last failed with one but not the other, show the one we failed with first
                                return aThisShown[0].result ? 1 : -1
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
                            if (aRatio < bRatio) return -1 // we're worse at a
                            if (bRatio < aRatio) return 1 // we're worse at b
                            // maybe we failed more with one than the other?
                            if (aFailure > bFailure) return -1
                            if (bFailure > aFailure) return 1
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
                            if (aTimeTotal < bTimeTotal) return -1 // a's successes are on net older
                            if (bTimeTotal < aTimeTotal) return 1 // b's successes are on net older
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