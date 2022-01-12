import {
  Button,
  Collapse,
  Grid,
  IconButton,
  Link,
  makeStyles,
  Typography as T,
} from "@material-ui/core"
import {
  Add,
  ArrowForward,
  Done,
  Edit,
  Link as RelationLink,
  School,
  SentimentVeryDissatisfied,
  SentimentVerySatisfied,
} from "@material-ui/icons"
import { useState } from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { App, Section } from "./App"
import { deepClone } from "./modules/clone"
import { AboutLink, Details, TabLink, TT } from "./modules/components"
import { enkey } from "./modules/storage"
import { CardStack, NoteRecord, PhraseInContext } from "./modules/types"
import { canonicalCitation, notePhrase, pick, rando } from "./modules/util"
import { Phrase } from "./Note"
const confetti = require("canvas-confetti")

export type FlashCardState = {
  stack: CardStack | null // metadata about the current stack
  notes: NoteRecord[] // the note records in the stack
  index: number // -1 means there are no cards left to try
  showingGist: boolean // is the gist the thing being tested or is it the phrase?
  gistFirst: boolean // is the gist the first side shown of each card
  done: Set<string> // those cards in the stack that we are done with, either temporarily or permanently
  revealed: boolean // whether we've flipped the current card yet
  initialize: boolean // whether to init on render
  judgment: boolean | null // the result of the last self-assessment on the current flashcard
  total: number // the total number of cards to flip
  which: number // the index displayed
  conceal: boolean // whether the gist and phrase are momentarily concealed
  banner: string // celebratory phrase
  colors: string[] // confetti colors
}

export default function FlashCards({ app }: { app: App }) {
  const state = app.state.flashcards || {
    stack: null,
    notes: [],
    index: -1,
    showingGist: app.state.config.cards.first === "gist",
    gistFirst: app.state.config.cards.first === "gist",
    done: new Set(),
    revealed: false,
    initialize: true,
    judgment: null,
    total: 0,
    which: 0,
    conceal: false,
    banner: "",
    colors: [],
  }
  const setState = (s: FlashCardState) => {
    app.setState({ flashcards: s })
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
        <DetailsContent app={app} />
      </Details>
      {!!state.notes.length && (
        <CurrentCard app={app} state={state} setState={setState} />
      )}
      {!state.notes.length && <NoResults state={state} app={app} />}
      <canvas
        id="confetti"
        style={{
          position: "fixed",
          top: 0,
          pointerEvents: "none",
          width: "100%",
          height: "100%",
        }}
      />
    </>
  )
}

// do this once per stack
function prepareCelebration(
  state: FlashCardState,
  setState: (s: FlashCardState) => void,
  set: boolean = true
) {
  const banner = pick(successStrings, Math.random)
  const colors: string[] = []
  const theme = pick(confettiColors, Math.random)
  for (let i = 0, l = rando(20, Math.random); i < l; i++) {
    colors.push(pick(theme, Math.random))
  }
  const s: FlashCardState = set ? deepClone(state) : state
  s.banner = banner
  s.colors = colors
  if (set) {
    setState(s)
  }
}

let confettiCannon: any

const throwConfetti = (state: FlashCardState) => {
  const e = document.getElementById("confetti")
  confettiCannon = confetti.create(e, {
    resize: true,
    useWorker: true,
  })
  confettiCannon({ colors: state.colors })
}

const confettiColors: string[][] = [
  // 1
  ["#2FF3E0", "#F8D210", "#F8D210", "#F8D210"],
  ["#3D550C", "#81B622", "#ECF87F", "#59981A"],
  ["#B7AC44", "#DF362D", "#FF8300", "#FF4500"],
  // 2
  ["#0A7029", "#FEDE00", "#C8DF52", "#DBE8D8"],
  ["#F9D030", "#F62AA0", "#B8EE30", "#26DFD0"],
  ["#26DFD0", "#43B0F1", "#057DCD", "#1E3D58"],
  // 3
  ["#FD7F20", "#FC2E20", "#FDB750", "#010100"],
  ["#FF8370", "#00B1B0", "#FEC84D", "#E42256"],
  ["#0D698B", "#F2F1E8", "#050533", "#E34234"],
  ["#BA0F30", "#2F2440", "#C6B79B", "#FF2511"],
  ["#54086B", "#FF0BAC", "#00BEC5", "#050833"],
  // 4
  ["#1A5653", "#107869", "#5CD85A", "#08313A"],
  ["#27231F", "#DE0001", "#C8651B", "#FEDA15"],
  ["#000000", "#F41F4E", "#FBFBFB", "#FFC2C7"],
  ["#AE388B", "#5DF15D", "#E983D8", "#F9B4F6"],
  // 5
  ["#F9B4F6", "#A072BE", "#BE81B6", "#E390C8"],
  // 6
  ["#01DEE6", "#FF66E9", "#FF5412", "#FBF608"],
  ["#F4F2EB", "#E4021B", "#FFDB15", "#3F5E98"],
  ["#00478F", "#FF5D00", "#2A231F", "#D8E1E7"],
  ["#FBDD00", "#E9A200", "#B32800", "#7F0000"],
  // 7
  ["#04F9F2", "#0091E7", "#005BEA", "#0000FF"],
  // 11
  ["#FD7924", "#57A5B8", "#E21B32", "#ECEF5B"],
  ["#FAD02C", "#E12A2A", "#469A49", "#192A29"],
]
let colorsInitialized = false

const currentCardStyles = makeStyles((theme) => {
  if (!colorsInitialized) {
    // stealing access to the theme
    const ownColors = [
      theme.palette.primary.dark,
      theme.palette.primary.dark,
      theme.palette.primary.dark,
      theme.palette.secondary.dark,
      theme.palette.secondary.dark,
      theme.palette.secondary.dark,
      theme.palette.error.dark,
      theme.palette.success.dark,
    ]
    // we get our own colors 50% of the time
    for (let i = 0, l = confettiColors.length; i < l; i++)
      confettiColors.push(ownColors)
    colorsInitialized = true
  }

  return {
    exhausted: {
      padding: theme.spacing(2),
    },
    name: {},
    description: {
      fontStyle: "italic",
    },
    stats: {
      fontWeight: "bold",
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
      fontWeight: "bold",
      fontSize: "larger",
    },
  }
})

function CurrentCard({
  app,
  state,
  setState,
}: {
  app: App
  state: FlashCardState
  setState: (s: FlashCardState) => void
}) {
  const classes = currentCardStyles()
  const s: FlashCardState = deepClone(state)
  const removeMe = () => {
    app.confirm({
      title: "Remove from all flashcard decks?",
      text: (
        <>
          Remove "{notePhrase(note)}" from all flashcard decks? You can add any
          removed card back to the decks by clicking the{" "}
          <Done className={classes.good} fontSize="small" />
          mark in search results.
        </>
      ),
      callback: () => {
        return new Promise((resolve, reject) => {
          note.done = true
          app.switchboard
            .index!.save(note)
            .then(() => {
              s.done.add(enkey(note.key))
              next(s, app, setState)
              resolve(`Removed "${notePhrase(note)}" from flashcard decks.`)
            })
            .catch((e) => reject(e))
        })
      },
    })
  }
  const good = () => {
    addTrial(true, note, app, s, setState)
    if (done(s)) {
      throwConfetti(s)
    }
  }
  const flip = () => {
    const e = document.getElementById("flipper")
    if (e) {
      e.classList.toggle("flipper")
      s.revealed = true
      setState(s)
      if (done(s)) {
        throwConfetti(s)
      }
    }
  }
  const keyCallback = (event: KeyboardEvent, handler: any) => {
    switch (handler.key) {
      case "g":
        if (s.revealed && !done(s)) good()
        break
      case "b":
        if (s.revealed && !done(s)) addTrial(false, note, app, s, setState)
        break
      case "f":
        flip()
        break
      case "n":
        next(s, app, setState)
        break
      case "d":
        removeMe()
        break
      default:
        console.error("unhandled keyboard event, check code", {
          event,
          handler,
        })
    }
  }
  useHotkeys("g,b,f,n,d", keyCallback, {}, [s])
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
    <CardWidget
      name={s.stack?.name}
      description={s.stack?.description}
      project={app.switchboard.index!.reverseProjectIndex.get(note.key[0])}
      banner={() => done(s) && <T className={classes.success}>{s.banner}!</T>}
      which={state.which}
      total={state.total}
      citationCount={note.citations.length}
      relationCount={(() => {
        let count = 0
        Object.values(note.relations).forEach((list) => (count += list.length))
        return count
      })()}
      gist={note.gist}
      showingGist={s.showingGist}
      phrase={canonicalCitation(note)}
      conceal={s.conceal}
      judgment={s.judgment}
      revealed={s.revealed}
      doFlip={flip}
      flipperId="flipper"
      doBad={() => addTrial(false, note, app, s, setState)}
      doDone={removeMe}
      doEdit={() => app.goto(note)}
      doNext={() => next(s, app, setState)}
      doGood={good}
      isDone={() => done(s)}
    />
  )
}

// factored out of above to facilitate writing the documentation
const CardWidget: React.FC<{
  name: string | undefined
  description: string | null | undefined
  project: string | undefined
  banner: () => React.ReactNode
  which: number
  total: number
  citationCount: number
  relationCount: number
  judgment: boolean | null
  gist: string
  showingGist: boolean
  phrase: PhraseInContext
  conceal: boolean
  revealed: boolean
  flipperId: string
  doEdit: () => void
  doDone: () => void
  doBad: () => void
  doGood: () => void
  doFlip: () => void
  doNext: () => void
  isDone: () => boolean
}> = ({
  name,
  description,
  project,
  banner,
  which,
  total,
  citationCount,
  relationCount,
  judgment,
  gist,
  showingGist,
  phrase,
  conceal,
  revealed,
  flipperId,
  doEdit,
  doDone,
  doBad,
  doGood,
  doFlip,
  doNext,
  isDone,
}) => {
  const classes = currentCardStyles()
  return (
    <>
      {!!name && (
        <Grid container justify="center" className={classes.name}>
          <T variant="h4">{name}</T>
        </Grid>
      )}
      {!!description && (
        <Grid container justify="center" className={classes.description}>
          <p>{description}</p>
        </Grid>
      )}
      <Grid container className={classes.stats} justify="space-between">
        <Grid item>{project}</Grid>
        <Grid item>{banner()}</Grid>
        <Grid item>
          {which} of {total}
        </Grid>
      </Grid>
      <FlashCard
        gist={gist}
        showingGist={showingGist}
        phrase={phrase}
        conceal={conceal}
        judgment={judgment}
        onClick={doFlip}
        id={flipperId}
      />
      <Grid container justify="space-evenly" className={classes.icons}>
        <Grid item>
          <Collapse in={revealed && !isDone()}>
            <IconButton disabled={judgment === false} onClick={doBad}>
              <SentimentVeryDissatisfied
                fontSize="large"
                className={classes.bad}
              />
            </IconButton>
          </Collapse>
        </Grid>
        <Grid item>
          <IconButton onClick={doDone}>
            <Done fontSize="large" className={classes.done} />
          </IconButton>
        </Grid>
        <Grid item>
          <EditWidget
            citationCount={citationCount}
            relationCount={relationCount}
            doEdit={doEdit}
          />
        </Grid>
        <Grid item>
          <IconButton onClick={doNext}>
            <ArrowForward fontSize="large" className={classes.next} />
          </IconButton>
        </Grid>
        <Grid item>
          <Collapse in={revealed && !isDone()}>
            <IconButton disabled={judgment === true} onClick={doGood}>
              <SentimentVerySatisfied
                fontSize="large"
                className={classes.good}
              />
            </IconButton>
          </Collapse>
        </Grid>
      </Grid>
    </>
  )
}

const editWidgetStyles = makeStyles((theme) => ({
  root: {
    position: "relative",
  },
  citations: {
    position: "absolute",
    top: "-1rem",
    left: "-1rem",
  },
  relations: {
    position: "absolute",
    top: "-1rem",
    right: "-1rem",
  },
}))

const EditWidget: React.FC<{
  citationCount: number
  relationCount: number
  doEdit: () => void
}> = ({ citationCount, relationCount, doEdit }) => {
  const classes = editWidgetStyles()
  return (
    <span className={classes.root}>
      <Collapse in={citationCount > 1} className={classes.citations}>
        <TT msg={`${citationCount} citations`} placement="left">
          <Add fontSize="small" />
        </TT>
      </Collapse>
      <IconButton onClick={doEdit}>
        <Edit fontSize="large" />
      </IconButton>
      <Collapse in={relationCount > 0} className={classes.relations}>
        <TT
          msg={`${relationCount} ${
            relationCount === 1 ? "relation" : "relations"
          }`}
          placement="right"
        >
          <RelationLink fontSize="small" />
        </TT>
      </Collapse>
    </span>
  )
}

const successStrings = [
  "Success",
  "Good job",
  "Excellent",
  "Well done",
  "Congratulations",
  "Far out",
  "Awesome",
  "Cool",
  "Ausgezeichnet",
  "Out of sight",
  "A+",
  "Outstanding",
  "Llongyfarchiadau",
  "Bien fait",
  "Onnea",
  "Excelente",
  "Отлично",
  "ยอดเยี่ยม",
  "出色的",
  "優れた",
  "Bora",
]

const noResultStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(2),
  },
  link: {
    margin: "0 1ch",
  },
}))

function NoResults({ state, app }: { state: FlashCardState; app: App }) {
  const classes = noResultStyles()
  return (
    <Grid container justify="center" className={classes.root}>
      There is nothing to show. To obtain some flashcards
      <Link
        onClick={() => app.setState({ tab: Section.search })}
        className={classes.link}
      >
        search
      </Link>
      for some notes and then click the
      <School color="primary" fontSize="small" className={classes.link} />
      button that appears when you find some.
    </Grid>
  )
}

function DemoCard({ app }: { app: App }) {
  const showingGistStart = app.state.config.cards.first === "gist"
  const [showingGist, setShowingGist] = useState(showingGistStart)
  const [judgment, setJudgment] = useState<null | boolean>(null)
  const [revealed, setRevealed] = useState(false)
  const [conceal, setConceal] = useState(false)
  const hideIn = 3000
  return (
    <CardWidget
      name="mammal stack"
      description={"a stack about mammals"}
      project="Animalia"
      banner={() => null}
      which={5}
      total={15}
      citationCount={3}
      relationCount={1}
      gist="a small, carnivorous mammal that likes laser pointers"
      showingGist={showingGist}
      phrase={{ before: "Behold the fuzzy ", phrase: "cat", after: "." }}
      conceal={conceal}
      judgment={judgment}
      revealed={revealed}
      doFlip={() => {
        const e = document.getElementById("demo-flipper")
        if (e) {
          e.classList.toggle("flipper")
        }
        setRevealed(true)
      }}
      flipperId="demo-flipper"
      doBad={() => {
        setJudgment(false)
        app.error(
          "If this were a real stack you would have marked this trial a failure!",
          hideIn
        )
      }}
      doDone={() => {
        app.warn(
          "If this were a real stack you would have removed this card from this stack and all future stacks!",
          hideIn
        )
      }}
      doEdit={() => {
        app.success(
          "If this were a real stack you would now be looking at the note this card is based on.",
          hideIn
        )
      }}
      doNext={() => {
        const e = document.getElementById("demo-flipper")
        if (e && e.classList.contains("flipper")) {
          setConceal(true)
          setTimeout(() => {
            setConceal(false)
          }, 250)
          e.classList.remove("flipper")
        }
        setShowingGist(showingGistStart)
        setRevealed(false)
        setJudgment(null)
        app.success(
          "If this were a real stack you would now be looking at the next card.",
          hideIn
        )
      }}
      doGood={() => {
        setJudgment(true)
        app.success(
          "If this were a real stack you would have marked this trial a success!",
          hideIn
        )
      }}
      isDone={() => false}
    />
  )
}

const detailsStyles = makeStyles((theme) => ({
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
}))

// explanation of how flashcard stacks work
function DetailsContent({ app }: { app: App }) {
  const classes = detailsStyles()
  return (
    <>
      <p>
        With flashcards you can transform a{" "}
        <TabLink app={app} tab="search">
          search
        </TabLink>{" "}
        into a quiz to test your knowledge. Each{" "}
        <TabLink app={app} tab="note">
          note
        </TabLink>{" "}
        found by the query is transformed into a flashcard with the gist on one
        side and the canonical citation on the other. Above the flashcard there
        is some information about the stack. If the stack was built from a named
        search the search name and description, if any, will be provided. For
        all stacks the stack size and your current location in the stack will be
        provided.
      </p>
      <T variant="h6">Example</T>
      <DemoCard app={app} />
      <p>
        To use a flashcard, look at the side shown and try to remember what the
        other side will show. Once you've made your guess, you can click the
        card or press &ldquo;f&rdquo; to flip it. Now two additional icon
        buttons will appear below the card, a{" "}
        <SentimentVerySatisfied fontSize="small" className={classes.good} /> and
        a <SentimentVeryDissatisfied fontSize="small" className={classes.bad} />
        . You can click these, or type &ldquo;g&rdquo; (good) or &ldquo;b&rdquo;
        (bad), to grade your guess. If you wish to skip the card for the moment,
        or you have made your guess and graded it, you can click{" "}
        <ArrowForward fontSize="small" className={classes.next} />, or type
        &ldquo;n&rdquo; (next), to go to the next card.
      </p>
      <p>
        Once you've had a go at the one side of every card in the stack,
        Amanuensis flips it and tests you on the other side. Any cards that you
        guess successfully on both sides will be removed from the stack. You
        continue this way, shrinking the stack with each pass. When you have had
        success with all cards Amanuensis congratulates you.
      </p>
      <p>
        The <Done fontSize="small" className={classes.done} /> icon, or pressing
        &ldquo;d&rdquo;, allows you to mark a card as &ldquo;done&rdquo;. Mark
        cards as done if they have nothing left to teach you or they are
        inappropriate for a flashcard stack. Card which are done will be marked
        with this icon in{" "}
        <TabLink app={app} tab="search">
          search results
        </TabLink>
        . You can click this icon there to remove the mark.
      </p>
      <p>
        Finally, if you wish to see the note on which a card is based, you can
        click the <Edit fontSize="small" /> icon or press &ldquo;e&rdquo;
        (edit). This icon may have two small satellites,{" "}
        <Add fontSize="small" /> and <RelationLink fontSize="small" />. These
        appear if the note in question has additional citations or relations to
        other notes, respectively. Basically, they indicate whether the note has
        other information you may with to review.
      </p>
      <AboutLink app={app} />
    </>
  )
}

const cardStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  flipCard: {
    width: "300px",
    height: "300px",
    perspective: "1000px",
    // '&:hover .flip-card-inner': {
    //     transform: 'rotateY(180deg)'
    // },
    "&.flipper .flip-card-inner": {
      transform: "rotateY(180deg)",
    },
  },
  flipCardInner: {
    position: "relative",
    width: "100%",
    height: "100%",
    textAlign: "center",
    transition: "transform 0.8s",
    transformStyle: "preserve-3d",
  },
  flipCardCommon: {
    position: "absolute",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px solid black",
    backfaceVisibility: "hidden",
    backgroundColor: theme.palette.background.paper,
    boxSizing: "border-box",
    borderRadius: "6px",
  },
  flipCardBack: {
    transform: "rotateY(180deg)",
  },
  gist: {
    borderColor: theme.palette.secondary.dark,
    fontSize: "larger",
    padding: theme.spacing(3),
  },
  phrase: {
    borderColor: theme.palette.primary.dark,
    padding: theme.spacing(1),
  },
  good: {
    borderColor: theme.palette.secondary.dark,
    boxShadow: `0 0 ${theme.spacing(2)}px ${theme.palette.secondary.dark}`,
    transition: "box-shadow 0.5s",
  },
  bad: {
    borderColor: theme.palette.error.dark,
    boxShadow: `0 0 ${theme.spacing(2)}px ${theme.palette.error.dark}`,
    transition: "box-shadow 0.5s",
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
function FlashCard({
  showingGist,
  phrase: phraseInContext,
  gist,
  onClick = () => {},
  judgment,
  id,
  conceal,
}: FlashCardProps) {
  const classes = cardStyles()
  const citation = <Phrase hasWord={true} phrase={phraseInContext} trim={80} />
  const definition = <span>{gist}</span>
  const glow = judgment == null ? "" : judgment ? classes.good : classes.bad
  const cz1 = `${showingGist ? classes.gist : classes.phrase} ${
    classes.flipCardCommon
  } ${glow}`
  const cz2 = `${showingGist ? classes.phrase : classes.gist} ${
    classes.flipCardBack
  } ${classes.flipCardCommon} ${glow}`
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

function init(
  app: App,
  state: FlashCardState,
  setState: (s: FlashCardState) => void
): void {
  const name = app.state.stack
  if (name !== undefined) {
    const s: FlashCardState = deepClone(state)
    app.switchboard
      .index!.retrieveStack(name)
      .then(({ stack, notes }) => {
        s.stack = stack
        stack.lastAccess = new Date()
        app.switchboard
          .index!.saveStack(stack)
          .catch((e) =>
            app.error(`could not save last stack access time: ${e}`)
          )
        const done: Set<string> = new Set()
        for (const n of notes) {
          if (n.done) {
            done.add(enkey(n.key))
          }
        }
        s.total = notes.length - done.size
        s.index = -1
        s.revealed = false
        s.done = done
        s.showingGist = app.state.config.cards.first === "gist"
        s.gistFirst = app.state.config.cards.first === "gist"
        notes.sort(sortNotes(false, done))
        s.notes = notes
        s.initialize = false
        s.which = 0
        next(s, app, setState)
      })
      .catch((e) => app.error(e))
  }
}

// show the next card
function next(
  s: FlashCardState,
  app: App,
  setState: (s: FlashCardState) => void
): void {
  const { done, notes } = s
  s.revealed = false
  s.judgment = null
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
      if (s.showingGist === s.gistFirst) {
        // we've done both sides of the stack, recalculate total
        s.total = remaining(s)
      }
      next(s, app, setState)
    } else {
      s.index = i
      s.which += 1
      const continuation = () => {
        const e = document.getElementById("flipper")
        if (e) {
          // if we've been using the keyboard flipper, we need to hide the text before
          // unflipping it
          s.conceal = true
          const newState: FlashCardState = deepClone(s)
          setTimeout(() => {
            newState.conceal = false
            setState(newState)
          }, 250)
          e.classList.remove("flipper")
        }
        setState(s)
      }
      // in case the note has changed since the flashcard query was run, reload it
      app.switchboard.index
        ?.fetch(s.notes[i].key)
        .then((note) => {
          s.notes[i] = note
          continuation()
        })
        .catch((e) => {
          // well, that didn't work; continue with unreloaded note
          console.error(e)
          continuation()
        })
    }
  }
}

function addTrial(
  judgment: boolean,
  note: NoteRecord,
  app: App,
  state: FlashCardState,
  setState: (s: FlashCardState) => void
) {
  if (!note.trials) note.trials = []
  if (state.judgment !== null) {
    note.trials.pop()
  }
  state.judgment = judgment
  note.trials.unshift({
    result: judgment,
    when: new Date(),
    type: state.showingGist ? "g" : "p",
  })
  // success with both sides?
  const shownFirst = app.state.config.cards.first === "phrase" ? "p" : "g"
  const flipped = state.showingGist === (shownFirst === "g" ? false : true)
  if (flipped) {
    const prev = note.trials.find((t) => t.type === shownFirst)
    if (prev?.result) {
      const key = enkey(note.key)
      if (judgment) {
        state.done.add(key)
      } else {
        state.done.delete(key)
      }
    }
  }
  setState(state)
  app.switchboard
    .index!.save(note)
    .catch((e) => app.error(`could not save result of trial: ${e}`))
}

const remaining = (state: FlashCardState) =>
  state.notes.length - state.done.size

const done = (state: FlashCardState) => remaining(state) === 0

// try really hard to show the easy stuff first
function sortNotes(
  showingGist: boolean,
  done: Set<string>
): (a: NoteRecord, b: NoteRecord) => number {
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
        const aThisShown = a.trials.filter(
          (t) => t.type === (showingGist ? "g" : "p")
        )
        const bThisShown = b.trials.filter(
          (t) => t.type === (showingGist ? "g" : "p")
        )
        if (aThisShown.length || bThisShown.length) {
          if (aThisShown.length && bThisShown.length) {
            if (aThisShown[0].result || bThisShown[0].result) {
              if (aThisShown[0].result && bThisShown[0].result) {
                // see if we're worse with one than the other
                let aSuccess = 0,
                  aFailure = 0,
                  bSuccess = 0,
                  bFailure = 0
                for (const t of aThisShown) {
                  if (t.result) {
                    aSuccess++
                  } else {
                    aFailure++
                  }
                }
                for (const t of bThisShown) {
                  if (t.result) {
                    bSuccess++
                  } else {
                    bFailure++
                  }
                }
                // we know we have at least one success at each
                const aRatio = aFailure / aSuccess
                const bRatio = bFailure / bSuccess
                if (aRatio > bRatio) return 1 // we're worse at a
                if (bRatio > aRatio) return -1 // we're worse at b
                // maybe we failed more with one than the other?
                if (aFailure > bFailure) return 1
                if (bFailure > aFailure) return -1
                let aTimeTotal = 0,
                  bTimeTotal = 0
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
              let aSuccess = 0,
                aFailure = 0,
                bSuccess = 0,
                bFailure = 0
              for (const t of aThisShown) {
                if (t.result) {
                  aSuccess++
                } else {
                  aFailure++
                }
              }
              for (const t of bThisShown) {
                if (t.result) {
                  bSuccess++
                } else {
                  bFailure++
                }
              }
              // we know we have at least one success at each
              const aRatio = aSuccess / aFailure
              const bRatio = bSuccess / bFailure
              if (aRatio < bRatio) return 1 // we're worse at a
              if (bRatio < aRatio) return -1 // we're worse at b
              // maybe we failed more with one than the other?
              if (aFailure > bFailure) return 1
              if (bFailure > aFailure) return -1
              let aTimeTotal = 0,
                bTimeTotal = 0
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
    const aCitation = canonicalCitation(a)
    const bCitation = canonicalCitation(b)
    if (aCitation.phrase < bCitation.phrase) return -1
    if (bCitation.phrase < aCitation.phrase) return 1
    // this is highly unlikely, but if all else fails, show the one with the older most recent citation
    return aCitation.when[0] < bCitation.when[0] ? -1 : 1
  }
}
