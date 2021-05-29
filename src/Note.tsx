import React, { ChangeEvent, useState } from "react"

import Autocomplete from "@material-ui/lab/Autocomplete"
import Chip from "@material-ui/core/Chip"
import TextField from "@material-ui/core/TextField"
import { makeStyles } from "@material-ui/core/styles"
import {
  Box,
  Collapse,
  Fade,
  Grid,
  Menu,
  MenuItem,
  Popover,
  Typography as T,
} from "@material-ui/core"
import {
  Cancel,
  Clear,
  Delete,
  ExpandMore,
  FilterCenterFocus,
  FilterList,
  Navigation,
  Save,
  Search,
  UnfoldLess,
  UnfoldMore,
} from "@material-ui/icons"

import { deepClone, anyDifference } from "./modules/clone"
import {
  NoteRecord,
  ContentSelection,
  SourceRecord,
  CitationRecord,
  KeyPair,
  Query,
  PhraseInContext,
  AdHocQuery,
} from "./modules/types"
import { debounce, notePhrase, nws, sameNote } from "./modules/util"
import {
  AboutLink,
  Details,
  Expando,
  formatDates,
  InfoSpinner,
  LinkDown,
  LinkUp,
  Mark,
  TabLink,
  TT,
} from "./modules/components"
import { App, Section, Visit } from "./App"
import { enkey } from "./modules/storage"
import { useHotkeys } from "react-hotkeys-hook"

interface NoteProps {
  app: App
}

export interface NoteState extends NoteRecord {
  unsavedContent: boolean
  everSaved: boolean
  unsavedCitation: boolean
  citationIndex: number
  similars?: string[]
}

class Note extends React.Component<NoteProps, NoteState> {
  savedState: NoteState
  app: App
  debouncedCheckSavedState: () => void
  focusing: CitationRecord | null
  constructor(props: Readonly<NoteProps>) {
    super(props)
    this.focusing = null
    this.app = props.app
    const visit = this.app.recentHistory()
    if (visit) {
      const { current, saved }: Visit = deepClone(visit)
      if (current.canonicalCitation) {
        current.citationIndex = current.canonicalCitation
      }
      this.state = current
      this.savedState = saved
      this.checkForDeletions()
    } else {
      this.state = nullState()
      this.savedState = nullState() // used as basis of comparison to see whether the record is dirty
    }
    this.app.switchboard.addActions("note", {
      selection: (msg) => {
        this.showSelection(msg)
      },
      reloaded: (msg) => {
        this.focused(msg.url)
      },
      noSelection: (msg) => {
        this.app.urlSearch()
      },
    })
    // make a debounced function that checks to see whether the note is dirty and needs a save
    this.debouncedCheckSavedState = debounce()(() => this.checkSavedState())
  }

  render() {
    return <Editor note={this} />
  }

  // bring a citation into focus
  focus() {
    this.focusing = this.currentCitation()
    this.app.switchboard.send({ action: "goto", citation: this.focusing })
  }

  componentDidMount() {
    if (!this.state.everSaved) {
      this.app.switchboard.then(() => {
        const key = deepClone(this.state.key)
        key[0] = this.app.switchboard.index!.currentProject
        this.setState({ key })
      })
    }
  }

  componentWillUnmount() {
    this.app.makeHistory(this.state, this.savedState)
    this.app.switchboard.removeActions("note", [
      "selection",
      "focused",
      "reloaded",
      "noSelection",
    ])
  }

  checkSavedState() {
    this.setState({
      unsavedContent: anyDifference(
        this.state,
        this.savedState,
        "unsavedContent",
        "citationIndex",
        "everSaved",
        "unsavedCitation"
      ),
    })
  }

  // check to see whether any information relevant to the display of this note has changed
  // since it was last displayed
  checkForDeletions() {
    if (this.state.everSaved) {
      this.app.switchboard.index
        ?.find({
          type: "lookup",
          phrase: this.currentCitation().phrase,
          project: this.state.key[0],
        })
        .then((response) => {
          switch (response.type) {
            case "ambiguous":
              // this should be unreachable since we have a project at this point
              this.app.warn("unexpected state found in checkForDeletions") // TODO we probably don't want this in the wild
              break
            case "found":
              // check to see whether any of the citations are missing
              // TODO make sure this works
              const keys = new Set(
                Object.values(this.state.relations).reduce(
                  (acc: string[], pairs) =>
                    acc.concat(pairs.map((p) => enkey(p))),
                  []
                )
              )
              this.app.switchboard.index
                ?.missing(keys)
                .then((missing) => {
                  if (missing.size) {
                    this.savedState = {
                      unsavedContent: false,
                      unsavedCitation: false,
                      everSaved: true,
                      citationIndex: 0,
                      ...response.match,
                    }
                    const relations = deepClone(this.state.relations)
                    for (let [k, v] of Object.entries(relations)) {
                      let ar = v as KeyPair[]
                      ar = ar.filter((p) => !missing.has(enkey(p)))
                      if (ar.length) {
                        relations[k] = ar
                      } else {
                        delete relations[k]
                      }
                    }
                    this.setState({ relations }, () => this.checkSavedState())
                    this.app.notify("some relations have been deleted")
                  }
                })
                .catch((error) =>
                  this.app.error(
                    `Error when looking for missing relations: ${error}`
                  )
                )
              break
            case "none":
              this.savedState = nullState()
              const newState = {
                key: deepClone(this.state.key),
                unsavedContent: true,
                relations: {},
                citations: deepClone(this.state.citations.slice(0, 1)),
              }
              if (
                !this.app.switchboard.index?.reverseProjectIndex.has(
                  this.state.key[0]
                )
              ) {
                newState.key[0] = 0 // set to the default project
              }
              this.setState(newState)
              this.app.notify("this note is no longer saved")
              break
          }
        })
        .catch((error) => this.app.error(error))
    }
  }

  currentCitation(): CitationRecord {
    return this.state.citations[this.state.citationIndex]
  }

  hasWord(): boolean {
    return !!(
      this.currentCitation()?.phrase && nws(this.currentCitation().phrase)
    )
  }

  focused(url: string) {
    const citation = this.currentCitation()
    if (citation?.source.url === url) {
      this.focusing = null
      this.app.switchboard.send({ action: "select", selection: citation })
    }
  }

  showSelection({
    selection,
    source,
  }: {
    selection: ContentSelection
    source: SourceRecord
  }) {
    const citation: CitationRecord = {
      source,
      note: "",
      ...selection,
      when: [new Date()],
    }
    const query: Query = {
      type: "lookup",
      phrase: selection.phrase,
      project: this.state.key[0],
    }
    this.app.switchboard
      .index!.find(query)
      .then((found) => {
        switch (found.type) {
          case "found":
            const foundState: NoteState = {
              unsavedContent: true,
              everSaved: true,
              unsavedCitation: true,
              citationIndex: found.match.canonicalCitation || 0,
              ...found.match,
            }
            const index = mergeCitation(foundState, citation)
            if (index === undefined) {
              foundState.citationIndex = foundState.citations.length - 1
            } else {
              foundState.citationIndex = index
              foundState.unsavedCitation = false
            }
            this.app.setState({ search: query, searchResults: [found.match] })
            this.setState(foundState)
            break
          case "none":
            this.app.setState({ search: query, searchResults: [] })
            const newState = nullState()
            newState.unsavedCitation = true
            newState.key[0] = this.app.state.defaultProject
            newState.unsavedContent = true
            newState.citations.push(citation)
            this.setState(newState)
            break
          case "ambiguous":
            this.app.setState({
              tab: Section.search,
              search: query,
              searchResults: found.matches,
            })
            break
        }
      })
      .catch((error) => this.app.error(error))
  }

  save() {
    if (!this.state.unsavedContent) {
      return
    }
    const data = deepClone(this.state, "unsavedContent", "project")
    this.app.switchboard.index
      ?.add({
        phrase: this.currentCitation().phrase,
        project: this.state.key[0],
        data: data,
      })
      .then((pk) => {
        this.savedState = deepClone(this.state)
        const key = deepClone(this.state.key)
        key[1] = pk
        this.savedState.key = key
        this.setState({
          key,
          unsavedContent: false,
          everSaved: true,
          unsavedCitation: false,
        })
      })
  }

  // obtain all the tags ever used
  allTags() {
    return Array.from(this.app.switchboard.index?.tags || []).sort()
  }
}

export default Note

function Editor({ note }: { note: Note }) {
  const keyCallback = (event: KeyboardEvent, handler: any) => {
    switch (handler.key) {
      case "ctrl+shift+s": // pop open similars popup
        document.getElementById("similar-target")?.click()
        break
      case "ctrl+s": // save the note
        note.save()
        break
      default:
        console.error("unhandled keyboard event, check code", {
          event,
          handler,
        })
    }
  }
  // overriding the filter option so we can save while in textareas and such
  useHotkeys(
    "ctrl+s,ctrl+shift+s",
    keyCallback,
    { enableOnTags: ["INPUT", "TEXTAREA", "SELECT"] },
    [note.state]
  )
  const [showDetails, setShowDetails] = useState<boolean>(false)
  const hasWord = note.hasWord()
  return (
    <>
      <Collapse in={showDetails}>
        <NoteDetails
          showDetails={showDetails}
          setShowDetails={setShowDetails}
          app={note.app}
        />
      </Collapse>
      <Collapse in={!showDetails}>
        <Header
          note={note}
          show={hasWord}
          showDetails={showDetails}
          setShowDetails={setShowDetails}
        />
        {hasWord && <Widgets app={note.props.app} n={note} />}
        <Phrase phrase={note.currentCitation()} hasWord={hasWord} />
        {hasWord && (
          <Annotations
            gist={note.state.gist}
            details={note.state.details}
            citationNote={note.currentCitation()?.note || ""}
            citationNoteHandler={(e) => {
              const citations = deepClone(note.state.citations)
              citations[note.state.citationIndex].note = e.target.value
              note.setState({ citations }, note.debouncedCheckSavedState)
            }}
            gistHandler={(e) =>
              note.setState(
                { gist: e.target.value },
                note.debouncedCheckSavedState
              )
            }
            notesHandler={(e) =>
              note.setState(
                { details: e.target.value },
                note.debouncedCheckSavedState
              )
            }
          />
        )}
        <Tags note={note} />
        <Relations note={note} hasWord={hasWord} />
        <Citations note={note} />
      </Collapse>
    </>
  )
}

const headerStyles = makeStyles((theme) => ({
  project: {
    fontSize: "smaller",
    fontWeight: "bold",
    color: theme.palette.grey[500],
    cursor: "pointer",
  },
  date: {
    fontSize: "smaller",
    width: "100%",
    color: theme.palette.grey[500],
  },
  projectPicker: {
    fontSize: "12pt",
  },
  menuItem: {
    fontSize: "small",
    minHeight: "unset !important",
  },
  defaultProject: {
    fontStyle: "italic",
    color: theme.palette.grey[500],
  },
}))

function Header({
  note,
  show,
  showDetails,
  setShowDetails,
}: {
  note: Note
  show: boolean
  showDetails: boolean
  setShowDetails: (b: boolean) => void
}) {
  const time = note.currentCitation()?.when
  const realm = note.state.key[0]
  const classes = headerStyles()
  // const [showDetails, setShowDetails] = useState<boolean>(false)
  let t = time ? time[0] : null
  const project = note.app.switchboard.index?.reverseProjectIndex.get(realm)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  let changer
  if (note.hasWord() && note.app.switchboard.index!.projects.size > 1) {
    const open = Boolean(anchorEl)
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget)
    }
    const closer = (i: number) => {
      return () => {
        setAnchorEl(null)
        if (note.state.unsavedCitation) {
          const key = deepClone(note.state.key)
          key[0] = i
          note.app.setState({ defaultProject: i }, () => {
            note.app.switchboard
              .index!.setCurrentProject(i)
              .then(() => note.setState({ key }))
          })
        } else {
          const beforeState: NoteState = deepClone(note.state)
          note.app
            .switchProjects(note.state, i)
            .then((ns) => {
              note.setState({
                ...beforeState,
                ...ns,
                everSaved: true,
                unsavedCitation: false,
                unsavedContent: false,
              })
            })
            .catch((e) => note.app.error(e))
        }
      }
    }
    changer = (
      <>
        <span
          id="project-changer"
          onClick={handleClick}
          className={classes.projectPicker}
        >
          <ExpandMore fontSize="inherit" />
        </span>
        <Menu
          anchorEl={anchorEl}
          keepMounted
          open={open}
          onClose={() => setAnchorEl(null)}
          TransitionComponent={Fade}
        >
          {Array.from(note.app.switchboard.index!.projects.values()).map(
            (pi) => (
              <MenuItem
                key={pi.pk}
                onClick={closer(pi.pk)}
                selected={pi.pk === note.state.key[0]}
                className={classes.menuItem}
              >
                {pi.name ? (
                  pi.name
                ) : (
                  <span className={classes.defaultProject}>default</span>
                )}
              </MenuItem>
            )
          )}
        </Menu>
      </>
    )
  }
  // NOTE keep in sync with NoteHeaderExample below
  return (
    <Grid container spacing={1}>
      {show && (
        <Grid container item xs>
          <T
            className={classes.project}
            onClick={() => document.getElementById("project-changer")?.click()}
          >
            {project}
          </T>
          {changer}
        </Grid>
      )}
      <Grid container item xs>
        <T align="right" className={classes.date}>
          {t?.toLocaleDateString()} {/* TODO make this a list of dates */}
          <InfoSpinner
            flipped={showDetails}
            setFlipped={setShowDetails}
            fontSize="tiny"
          />
        </T>
      </Grid>
    </Grid>
  )
}

// for use in NoteDetails
// NOTE keep in sync with return value immediately above
function NoteHeaderExample() {
  const classes = headerStyles()
  return (
    <Grid container spacing={1}>
      <Grid container item xs>
        <T className={classes.project}>Example Project</T>
      </Grid>
      <Grid container item xs>
        <T align="right" className={classes.date}>
          {new Date().toLocaleDateString()}
          <InfoSpinner fontSize="tiny" />
        </T>
      </Grid>
    </Grid>
  )
}

const noteDetailsStyles = makeStyles((theme) => ({
  tocLink: {
    display: "block",
  },
  save: {
    color: theme.palette.warning.dark,
  },
  delete: {
    color: theme.palette.error.dark,
  },
}))

function NoteDetails({
  showDetails,
  setShowDetails,
  app,
}: {
  showDetails: boolean
  setShowDetails: (b: boolean) => void
  app: App
}) {
  const classes = noteDetailsStyles()
  const annotationClasses = annotationStyles()
  const tagClasses = tagStyles()
  return (
    <>
      <Details
        header="Notes"
        expanded={showDetails}
        onChange={(_e, expanded) => setShowDetails(expanded)}
      >
        <T variant="h6" id="toc">
          Table of Contents
        </T>
        <Box m={2} ml={4}>
          <LinkDown to="citation" className={classes.tocLink}>
            Citation
          </LinkDown>
          <LinkDown to="header" className={classes.tocLink}>
            Header
          </LinkDown>
          <LinkDown to="gist" className={classes.tocLink}>
            Gist
          </LinkDown>
          <Box ml={2}>
            <LinkDown to="citation-note" className={classes.tocLink}>
              Citation Note
            </LinkDown>
            <LinkDown to="elaboration" className={classes.tocLink}>
              Elaboration
            </LinkDown>
            <LinkDown to="hotkey" className={classes.tocLink}>
              Ctrl-S
            </LinkDown>
            <LinkDown to="hotkey2" className={classes.tocLink}>
              Ctrl-Shift-S
            </LinkDown>
          </Box>
          <LinkDown to="widgets" className={classes.tocLink}>
            Widgets
          </LinkDown>
          <Box ml={2}>
            <LinkDown to="save" className={classes.tocLink}>
              <Save fontSize="small" className={classes.save} /> Save
            </LinkDown>
            <LinkDown to="delete" className={classes.tocLink}>
              <Delete fontSize="small" className={classes.delete} /> Delete
            </LinkDown>
            <LinkDown to="navigate" className={classes.tocLink}>
              <Navigation fontSize="small" color="primary" /> Navigate
            </LinkDown>
            <LinkDown to="similar" className={classes.tocLink}>
              <FilterList fontSize="small" color="primary" /> Similar Phrases
            </LinkDown>
          </Box>
          <LinkDown to="tags" className={classes.tocLink}>
            Tags
          </LinkDown>
          <LinkDown to="relations" className={classes.tocLink}>
            Relations
          </LinkDown>
          <LinkDown to="citation-list" className={classes.tocLink}>
            Citation List
          </LinkDown>
          <LinkDown to="internals" className={classes.tocLink}>
            Internals
          </LinkDown>
        </Box>
      </Details>
      <p>
        The purpose of Amanuensis is to allow you to take notes on a web page.
        You are now looking at Amanuensis's note tab. The parts of this tab,
        aside from this help section, are described below.
      </p>
      <T id="citation" variant="h6">
        Citation <LinkUp />
      </T>
      <p>
        The purpose of Amanuensis is to allow you to take notes on web pages
        based around citations from those pages. You highlight a section of the
        page and press Alt+a and Amanuensis opens up with an unsaved note based
        on your selection looking somewhat like this.
      </p>
      <Box m={2}>
        <Phrase
          phrase={{
            before: "Perhaps some context, then ",
            phrase: "your selection",
            after: ", and then maybe a bit more context.",
          }}
        />
      </Box>
      <p>
        The context surrounding your selection is based on the structure of the
        page. It is selected automatically. Sometimes there maybe be a little
        more context than you wish. There is more on this{" "}
        <LinkDown to="internals">below</LinkDown>.
      </p>
      <T id="header" variant="h6">
        Header <LinkUp />
      </T>
      <Box m={2}>
        <NoteHeaderExample />
      </Box>
      <p>
        Things are a bit out of order here. The node header appears{" "}
        <i>before</i> the citation. The citation is the important bit, though.
        The header shows the{" "}
        <TabLink tab="projects" app={app}>
          project
        </TabLink>{" "}
        the citation belongs to on the left and the date(s) the note was made on
        the right. The ⓘ on the far right, of course, sends you to this help
        information.
      </p>
      <p>
        When you first create a note Amanuensis will assign the unsaved note to
        whatever is the current project. If you haven't made any projects, this
        will be the default project. If you have, it will be whichever project
        you last assigned a note to, or whichever project you selected as the
        default project in the{" "}
        <TabLink tab="projects" app={app}>
          projects tab
        </TabLink>
        . Once you have assigned a note to a project you cannot currently change
        this assignment. This is because different projects may have different
        normalizers. I may relax this restriction in the future.
      </p>
      <T id="gist" variant="h6">
        Gist <LinkUp />
      </T>
      <Box m={2}>
        <Grid container>
          <Grid item xs={11}>
            <TextField
              label="Gist"
              multiline
              placeholder="Essential information about this topic"
              className={annotationClasses.note}
              rowsMax={2}
              value={"essential stuff"}
            />
          </Grid>
          <Grid item xs={1} className={annotationClasses.centering}>
            <div className={annotationClasses.centered}>
              <UnfoldMore className={annotationClasses.unfolder} />
            </div>
          </Grid>
        </Grid>
      </Box>
      <p>
        The gist is a short, pithy phrase summing up the significance of the
        citation. If Amanuensis is being used for language acquisition, this is
        generally a gloss of the citation. Otherwise, it is a short version of
        the citation's significance. In general, the gist should be something
        that fits comfortably on one side of a{" "}
        <TabLink tab="cards" app={app}>
          flashcard
        </TabLink>
        . It should summarize the citation outside of any particular contect. If
        you have information you wish to preserve about the paricular citation
        there is a <LinkDown to="citation-note">citation note</LinkDown>. If you
        have information that is general but lengthier than fits on a flashcard,
        there is an <LinkDown to="elaboration">elaboration</LinkDown>. These two
        expansions on the gist are available via the{" "}
        <UnfoldMore fontSize="small" /> icon that appears to the right of the
        gist. If either a citation note or an elaboration has been provided,
        this icon will appear like this:{" "}
        <UnfoldMore fontSize="small" color="secondary" />.
      </p>
      <strong id="citation-note">
        Citation Note <LinkUp />
      </strong>
      <Box m={2}>
        <TextField
          label="Note on Citation"
          placeholder="Notes on the citation above"
          className={annotationClasses.note}
          rowsMax={2}
          value={"the font on this page is particularly lovely"}
        />
      </Box>
      <p>
        A citation note is a bit of information about a particular citation of
        the phrase the note concerns. A note may cover multiple{" "}
        <LinkDown to="citation-list">citations</LinkDown>. Each may have its own
        citation note, but they will have a common{" "}
        <LinkDown to="gist">gist</LinkDown>, <LinkDown to="tags">tags</LinkDown>
        , <LinkDown to="relations">relations</LinkDown>, and, optionally,{" "}
        <LinkDown to="elaboration">elaboration</LinkDown>.
      </p>
      <p>
        By default the citation note of the current citation is not shown. You
        must click on the <UnfoldMore fontSize="small" /> expander icon beside
        the <LinkDown to="gist">gist</LinkDown> to see it.
      </p>
      <strong id="elaboration">
        Elaboration <LinkUp />
      </strong>
      <Box m={2}>
        <TextField
          label="Elaboration"
          multiline
          placeholder="Further observations about this topic"
          className={annotationClasses.note}
          rowsMax={6}
          value={
            "There's no end to what I could say about this, but here's a start..."
          }
        />
      </Box>
      <p>
        An elaboration is any longer text about the phrase of the citation which
        is not particular to the citation. It is general information which won't
        fit in a gist. By default a note's elaboration is not shown. You must
        click on the <UnfoldMore fontSize="small" /> expander icon beside the{" "}
        <LinkDown to="gist">gist</LinkDown> to see it.
      </p>
      <strong id="hotkey">
        Ctrl-S <LinkUp />
      </strong>
      <p>
        You may use the <LinkDown to="save">save</LinkDown> widget to save
        changes to a note, but for convenience there is also a keyboard hotkey:
        ctrl-s. That is, if you hold down the control key and click the s key
        this will also save the note.
      </p>
      <strong id="hotkey2">
        Ctrl-Shift-S <LinkUp />
      </strong>
      <p>
        You may use the <LinkDown to="similar">similar phrases</LinkDown> widget
        to save changes to a note, but for convenience there is also a keyboard
        hotkey: ctrl-shift-s. That is, if you hold down the control key and the
        shift key and click the s key this will also show similar phrases. This
        is similar to the save hotkey combination because I find I generally
        want to do them in sequence: save and then check for similar phrases.
        The similar key combinations make this easy.
      </p>
      <T id="widgets" variant="h6">
        Widgets <LinkUp />
      </T>
      <p>
        The widgets are a collection of icon controls in the top right of the
        note tab. They come and go depending on what it is possible for you to
        do with the note at the moment.
      </p>
      <strong id="save">
        <Save fontSize="small" className={classes.save} /> Save <LinkUp />
      </strong>
      <p>
        The save widget appears only if there are unsaved changes &mdash; a new
        citation, a new timestamp associated with an existing citation, a new
        gist, etc. The save widget is the only one with a backup{" "}
        <LinkDown to="hotkey">keyboard command</LinkDown>.
      </p>
      <strong id="delete">
        <Delete fontSize="small" className={classes.delete} /> Delete <LinkUp />
      </strong>
      <p>
        The delete widget appears only if the note has been saved. If you click
        it the note will be removed from storage, and any{" "}
        <LinkDown to="relations">relation</LinkDown> between the note and others
        will be deleted altogether, but the note will not be removed from the
        screen. If you save the note again everything but the relations will
        once again be stored. If you leave Amanuensis after deleting the note
        and then come back there will be no trace of the deleted note.
      </p>
      <strong id="navigate">
        <Navigation fontSize="small" color="primary" /> Navigate <LinkUp />
      </strong>
      <Box m={2}>
        <Grid
          container
          spacing={1}
          direction="row"
          justify="flex-start"
          alignItems="center"
        >
          <Grid item>
            <DemoNav />
          </Grid>
          <Grid item>
            <span style={{ fontSize: "smaller", fontStyle: "italic" }}>
              (click me)
            </span>
          </Grid>
        </Grid>
      </Box>
      <p>
        The navigational widget appears if you aren't currently looking at a
        note generated or retrieved with Alt-A, or if you've already navigated
        about. It allows you to return to citations you have written notes
        about. If you click on the navigational widget you get a list containing
        your phrase of the current note, highlighted, and the phrases of any
        other notes you've looked at in this Amanuensis session. If you click on
        one of the non-highlighted phrases that note will be shown. If you click
        click the <FilterCenterFocus color="primary" fontSize="small" /> at the
        top of the list Amanuensis will load the page the current note was made
        on and attempt to show the selection on the page. Navigating to a new
        page may cause Amanuensis to close. Click Alt-A again to bring
        Amanuensis back up. It will show a list of notes taken on the current
        page. If the structure of the page has changed greatly since the note
        was taken the original selection may no longer be there, or Amanuensis
        may fail to find it. See <LinkDown to="internals">internals</LinkDown>.
      </p>
      <strong id="similar">
        <FilterList fontSize="small" color="primary" /> Similar Phrases{" "}
        <LinkUp />
      </strong>
      <Box m={2}>
        <Grid
          container
          spacing={1}
          direction="row"
          justify="flex-start"
          alignItems="center"
        >
          <Grid item>
            <DemoSimilar />
          </Grid>
          <Grid item>
            <span style={{ fontSize: "smaller", fontStyle: "italic" }}>
              (click me)
            </span>
          </Grid>
        </Grid>
      </Box>
      <p>
        The similar phrases widget shows a list of the top few phrases among
        your notes that are most similar to the current note's phrase. If you
        click click the <Search color="primary" fontSize="small" /> at the top
        of the list Amanuensis will send you to the search tab and run a search
        sorting all the notes by their similarity to this phrase.
      </p>
      <p>
        When you first start taking notes you are unlikely to find this widget
        useful. After you've taken many notes you may find you have a note on
        both "cat" and "cats", say. The similar phrases widget will allow you to
        find the other note and perhaps create a{" "}
        <LinkDown to="relations">relation</LinkDown> between them.
      </p>
      <T id="tags" variant="h6">
        Tags <LinkUp />
      </T>
      <Box m={2}>
        <Autocomplete
          className={tagClasses.text}
          options={["3rd", "singular", "present", "subjunctive"]}
          value={["3rd", "singular", "present", "subjunctive"]}
          multiple
          freeSolo
          autoComplete
          renderInput={(params) => (
            <TextField {...params} label="Tags" placeholder="category" />
          )}
          renderTags={(value, getTagProps) =>
            value.map((obj, index) => (
              <Chip
                variant="outlined"
                size="small"
                label={obj}
                {...getTagProps({ index })}
              />
            ))
          }
        />
      </Box>
      <p>
        Tags are whatever labels you might find useful to categorize your notes.
        Assuming your notes are being used for language acquisition, they might
        be grammatical categories like gender, number, or word class &mdash;
        verb, noun, preposition, particle. You could also use them to group
        notes by topic, like "music" or "household objects".
      </p>
      <p>
        Tags are shared across{" "}
        <TabLink tab="projects" app={app}>
          projects
        </TabLink>
        . If you add the tag "food" in your Hindi project you will find it
        suggested when later you go to add a tag to some note in your Swahili
        project.
      </p>
      <T id="relations" variant="h6">
        Relations <LinkUp />
      </T>
      <p>
        Relations are a mechanism for connecting notes. Each{" "}
        <TabLink tab="projects" app={app}>
          project
        </TabLink>{" "}
        defines its own set of relations. There is only one relation which can
        link notes across projects: "see also". The see also relation is the
        only relation automatically defined for all projects.
      </p>
      <p>
        Example relations: kind of, part of, variation of, inflectional variant
        of, etc. If you have a note for "cat" and another note for "cats", you
        may want a relation to tie these notes together.
      </p>
      <T id="citation-list" variant="h6">
        Citation List <LinkUp />
      </T>
      <Box m={2}>
        <Citation
          phrase="first example"
          title="A Great First Example"
          url="https://example.com/first"
          cz="first"
          onlyCitation={false}
          starred={true}
          key="first-example"
          when={[new Date()]}
        />
        <Citation
          phrase="FIRST EXAMPLE"
          title="A Lesser Example"
          url="https://example.com/lesser"
          cz="current"
          onlyCitation={false}
          starred={false}
          key="second-example"
          when={[new Date()]}
        />
      </Box>
      <p>
        You may find multiple citations for the same phrase. Each of these will
        have its own context and may have its own{" "}
        <LinkDown to="citation-note">citation note</LinkDown>. If you have more
        than one citation, you can mark one of them as canonical with the{" "}
        <Mark starred={false} fontSize="small" /> icon or delete citations with
        the <Clear fontSize="small" />. The citation currently displayed is
        highlighted. Since there is little space to display this citation
        information, elements will likely be truncated. If you click on any
        element, you will see its full contents.
      </p>
      <T id="internals" variant="h6">
        Internals <LinkUp />
      </T>
      <p>
        When Amanuensis creates a note on a selection it saves some information
        about the structure of the page in order to find this selection again in
        the future. It saves enough information identify the selection on the
        page as the page is at the moment, but it seeks not to save{" "}
        <em>too much</em> information. On the one hand, extraneous information
        just wastes space. On the other, web pages change, so if Amanuensis
        saves too much information it may find that some of the signposts it
        relies on to find the selection are gone the next time it returns to the
        page. So Amanuensis saves a smallish but still hopefully sufficient bit
        of structural information to relocate the selection. Among the
        information it saves are the textual context of the selection &mdash;
        the text before it and after it in a smallish piece of the page.
      </p>
      <p>
        If you return to a page via the{" "}
        <LinkDown to="navigate">navigation widget</LinkDown> but cannot retrieve
        the selection, this process has failed. However, you may still be able
        to find the relevant selection on the page. Amanuensis is conservative
        when it tries to identify the original selection. You may have more luck
        with your eyes and human intelligence. Generally, though, Amanuensis
        will be able to retrieve the original selection.
      </p>
      <AboutLink app={app} />
    </>
  )
}

const widgetStyles = makeStyles((theme) => ({
  root: {
    display: "table",
    float: "right",
    lineHeight: "1.2rem",
    fontSize: "small",
    textAlign: "center",
  },
  save: {
    cursor: "pointer",
    display: "block",
    color: theme.palette.warning.dark,
  },
  delete: {
    cursor: "pointer",
    display: "block",
    color: theme.palette.error.dark,
  },
}))

function Widgets({ app, n }: { n: Note; app: App }) {
  const classes = widgetStyles()

  const t = () => {
    app.confirm({
      title: `Delete this note?`,
      text: `Delete this note concerning "${notePhrase(n.state)}"?`,
      callback: () => {
        return new Promise((resolve, _reject) => {
          app.removeNote(n.state)
          n.savedState = nullState()
          const state: NoteState = deepClone(n.state)
          state.relations = {}
          state.everSaved = false
          state.unsavedContent = true
          n.setState(state)
          resolve(undefined)
        })
      },
    })
  }
  return (
    <div className={classes.root}>
      <Nav app={app} n={n} />
      {n.state.unsavedContent && (
        <TT msg="save unsaved content" placement="left">
          <Save className={classes.save} onClick={() => n.save()} />
        </TT>
      )}
      {n.state.everSaved && <Delete className={classes.delete} onClick={t} />}
      {n.hasWord() && <Similar app={app} n={n} />}
    </div>
  )
}

const similarStyles = makeStyles((theme) => ({
  filter: {
    cursor: "pointer",
  },
  similars: {
    padding: theme.spacing(1),
  },
  fallback: {
    fontSize: "smaller",
    fontStyle: "italic",
  },
  search: {
    cursor: "pointer",
    display: "table",
    margin: "0 auto",
    marginBottom: theme.spacing(0.1),
  },
}))

function Similar({ app, n }: { app: App; n: Note }) {
  const classes = similarStyles()
  const [anchorEl, setAnchorEl] = React.useState<null | Element>(null)
  const [fallback, setFallback] = useState("...")
  const open = Boolean(anchorEl)
  const id = open ? "similar-popover" : undefined
  const search: AdHocQuery = {
    type: "ad hoc",
    phrase: n.currentCitation().phrase,
    sorter: app.sorterFor(n),
    strictness: "similar",
  }
  const findSimilar = (e: React.MouseEvent<HTMLSpanElement, MouseEvent>) => {
    setAnchorEl(e.currentTarget)
    app.switchboard.index
      ?.find({
        ...search,
        limit: 5, // TODO make this configurable
      })
      .then((found) => {
        let matches: NoteRecord[] = []
        switch (found.type) {
          case "found":
            matches.push(found.match)
            break
          case "ambiguous":
            matches = found.matches
            break
        }
        const similars = matches
          .map((m) => notePhrase(m))
          .filter((w) => w !== search.phrase)
        setFallback(similars.length ? "" : "none")
        n.setState({ similars })
      })
  }
  const similarSearch = () => {
    app.switchboard.index?.find(search).then((r) => {
      let searchResults: NoteRecord[] = []
      switch (r.type) {
        case "ambiguous":
          searchResults = r.matches
          break
        case "found":
          searchResults.push(r.match)
          break
      }
      app.setState({ tab: Section.search, search, searchResults })
    })
  }
  return (
    <>
      {app.noteCount() > 1 && (
        <div>
          <span
            id="similar-target"
            className={classes.filter}
            onClick={findSimilar}
          >
            <FilterList color="primary" />
          </span>
          <Popover
            id={id}
            open={open}
            anchorEl={anchorEl}
            onClose={() => setAnchorEl(null)}
          >
            <div className={classes.similars}>
              {!!fallback && <div className={classes.fallback}>{fallback}</div>}
              {!fallback && (
                <div className={classes.search} onClick={similarSearch}>
                  <Search color="primary" />
                </div>
              )}
              {(n.state.similars || []).map((v) => (
                <div key={v}>{v}</div>
              ))}
            </div>
          </Popover>
        </div>
      )}
    </>
  )
}

function DemoSimilar() {
  const classes = similarStyles()
  const [anchorEl, setAnchorEl] = React.useState<null | Element>(null)
  const open = Boolean(anchorEl)
  const id = open ? "demo-similar-popover" : undefined
  const findSimilar = (e: React.MouseEvent<HTMLSpanElement, MouseEvent>) => {
    setAnchorEl(e.currentTarget)
  }
  return (
    <div>
      <span className={classes.filter} onClick={findSimilar}>
        <FilterList color="primary" id="demo-similar" />
      </span>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
      >
        <div className={classes.similars}>
          <div className={classes.search}>
            <Search color="primary" />
          </div>
          {["food", "foot", "boo", "moo"].map((v) => (
            <div key={v}>{v}</div>
          ))}
        </div>
      </Popover>
    </div>
  )
}

const navStyles = makeStyles((theme) => ({
  arrow: {
    cursor: "pointer",
  },
  nav: {
    padding: theme.spacing(1),
  },
  focus: {
    cursor: "pointer",
    display: "table",
    margin: "0 auto",
    marginBottom: theme.spacing(0.1),
  },
}))

function Nav({ app, n }: { app: App; n: Note }) {
  const [anchorEl, setAnchorEl] = React.useState<null | Element>(null)
  if (app.state.history.length < 1) {
    return null
  }
  const classes = navStyles()
  const open = Boolean(anchorEl)
  const id = open ? "simple-popover" : undefined
  return (
    <div>
      <span
        className={classes.arrow}
        onClick={(event) => {
          setAnchorEl(event.currentTarget)
        }}
      >
        <Navigation color="primary" id="nav" />
      </span>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
      >
        <div className={classes.nav}>
          <div className={classes.focus} onClick={() => n.focus()}>
            <FilterCenterFocus color="primary" />
          </div>
          {app.state.history.map((v) => (
            <HistoryLink v={v} app={app} n={n} />
          ))}
        </div>
      </Popover>
    </div>
  )
}

// for use in NoteDetails
function DemoNav() {
  const classes = navStyles()
  const linkClasses = historyLinkStyles()
  const [anchorEl, setAnchorEl] = useState<null | Element>(null)
  const open = Boolean(anchorEl)
  return (
    <>
      <span
        className={classes.arrow}
        onClick={(event) => {
          setAnchorEl(event.currentTarget)
        }}
      >
        <Navigation color="primary" />
      </span>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
      >
        <div className={classes.nav}>
          <div className={classes.focus}>
            <FilterCenterFocus color="primary" />
          </div>
          {["foo", "bar", "baz"].map((v) => {
            const cz =
              v === "foo"
                ? `${linkClasses.root} ${linkClasses.current}`
                : linkClasses.root
            return (
              <div key={v} className={cz}>
                {v}
              </div>
            )
          })}
        </div>
      </Popover>
    </>
  )
}

const historyLinkStyles = makeStyles((theme) => ({
  root: {
    cursor: "pointer",
    display: "table",
    margin: "0 auto",
  },
  current: {
    backgroundColor: theme.palette.secondary.light,
  },
}))

function HistoryLink({ v, app, n }: { v: Visit; app: App; n: Note }) {
  const classes = historyLinkStyles()
  const note = app.currentNote()
  const currentKey = note && sameNote(note, v.current)
  const callback = () => {
    if (!currentKey) {
      app.goto(v.current, () => {
        const visit = app.recentHistory()
        n.savedState = visit!.saved
        n.setState(visit!.current)
      })
    }
  }
  const cz = currentKey ? `${classes.root} ${classes.current}` : classes.root
  return (
    <div key={enkey(v.current.key)} onClick={callback} className={cz}>
      {v.current.citations[v.current.canonicalCitation || 0].phrase}
    </div>
  )
}

const phraseStyles = makeStyles((theme) => ({
  root: {},
  word: {
    backgroundColor: theme.palette.secondary.light,
  },
}))

export function Phrase({
  hasWord = true,
  phrase,
  trim,
}: {
  hasWord?: boolean
  phrase: PhraseInContext
  trim?: number
}) {
  const classes = phraseStyles()
  if (hasWord) {
    let { before, after } = phrase ?? {}
    if (trim) {
      if (before && before.length > trim) {
        before = "\u2026" + before.substr(before.length - trim, trim)
      }
      if (after && after.length > trim) {
        after = after.substr(0, trim) + "\u2026"
      }
    }
    return (
      <div className={classes.root}>
        <span>{before}</span>
        <span className={classes.word}>{phrase.phrase}</span>
        <span>{after}</span>
      </div>
    )
  } else {
    return <div className={classes.root}>No phrase</div>
  }
}

const tagStyles = makeStyles((theme) => ({
  text: {
    width: "100%",
    marginTop: theme.spacing(1),
    "&:first-child": {
      marginTop: 0,
    },
  },
}))

function Tags(props: { note: Note }) {
  const classes = tagStyles()
  const { note } = props
  const { tags } = note.state
  if (!note.hasWord()) {
    return null
  }
  let options: string[]
  if (note.app.switchboard.index?.tags) {
    options = Array.from(note.app.switchboard.index.tags)
  } else {
    options = []
  }
  return (
    <Autocomplete
      id="clone-form-relations"
      className={classes.text}
      options={options}
      value={tags}
      onChange={(_event, tags) =>
        note.setState({ tags }, () => note.checkSavedState())
      }
      multiple
      freeSolo
      autoComplete
      renderInput={(params) => (
        <TextField {...params} label="Tags" placeholder="category" />
      )}
      renderTags={(value, getTagProps) =>
        value.map((obj, index) => (
          <Chip
            variant="outlined"
            size="small"
            label={obj}
            {...getTagProps({ index })}
          />
        ))
      }
    />
  )
}

function Citations({ note }: { note: Note }) {
  return (
    <div>
      {note.state.citations.map((c, i) => (
        <Cite note={note} i={i} c={c} />
      ))}
    </div>
  )
}

const citationsStyles = makeStyles((theme) => ({
  cell: {
    fontSize: "smaller",
  },
  first: {
    fontWeight: "bold",
    cursor: "pointer",
  },
  current: {
    fontWeight: "bold",
    backgroundColor: theme.palette.secondary.light,
  },
  repeat: {
    color: theme.palette.grey[500],
    cursor: "pointer",
  },
  date: {
    color: theme.palette.grey[500],
  },
  remover: {
    cursor: "pointer",
  },
}))

function Cite({ note, i, c }: { note: Note; i: number; c: CitationRecord }) {
  const current = i === note.state.citationIndex
  let cz: "repeat" | "first" | "current" = "first"
  if (current) {
    cz = "current"
  } else if (i > 0 && c.phrase === note.state.citations[i - 1].phrase) {
    cz = "repeat"
  }
  let cb
  if (!current) {
    cb = () => note.setState({ citationIndex: i })
  }
  const key = `${note.state.key[0]}:${note.state.key[1]}:${i}`
  const onlyCitation = note.state.citations.length === 1
  const starred = i === note.state.canonicalCitation
  let makeCanonical, removeCitation
  if (!(onlyCitation || starred)) {
    makeCanonical = () =>
      note.setState({ canonicalCitation: i, unsavedContent: true })
    removeCitation = () => {
      const citations = deepClone(note.state.citations)
      citations.splice(i, 1)
      const changes: any = { citations, unsavedContent: true }
      if (i === note.state.canonicalCitation) {
        changes.canonicalCitation = undefined
      }
      note.setState(changes)
    }
  }
  return (
    <Citation
      key={key}
      cz={cz}
      phraseCallback={cb}
      phrase={c.phrase}
      title={c.source.title}
      onlyCitation={onlyCitation}
      url={c.source.url}
      when={c.when}
      starred={starred}
      starCallback={makeCanonical}
      deleteCallback={removeCitation}
    />
  )
}

type CitationProps = {
  starred: boolean
  phrase: string
  title: string
  url: string
  key: string
  when: Date[]
  onlyCitation: boolean
  cz: "first" | "current" | "repeat"
  phraseCallback?: () => void
  starCallback?: () => void
  deleteCallback?: () => void
}

// factored out of Cite to facilitate use in NoteDetails
function Citation({
  starred = false,
  phrase,
  title,
  url,
  key,
  when,
  onlyCitation = false,
  cz = "first",
  phraseCallback,
  starCallback = () => {},
  deleteCallback = () => {},
}: CitationProps) {
  const classes = citationsStyles()
  return (
    <Grid container spacing={1} key={key}>
      <Grid item xs={2} className={classes[cz]} onClick={phraseCallback}>
        <Expando text={phrase} id={`${key}-phrase`} className={classes.cell} />
      </Grid>
      <Grid item xs={3}>
        <Expando text={title} id={`${key}-phrase`} className={classes.cell} />
      </Grid>
      <Grid item xs={onlyCitation ? 5 : 3}>
        <Expando text={url} id={`${key}-phrase`} className={classes.cell} />
      </Grid>
      <Grid item xs={2} className={classes.date}>
        <Expando
          text={formatDates(when)}
          id={`${key}-phrase`}
          className={classes.cell}
        />
      </Grid>
      {!onlyCitation && (
        <Grid item xs={2}>
          <Mark starred={starred} onClick={starCallback} fontSize="small" />
          <Clear
            fontSize="small"
            className={classes.remover}
            onClick={deleteCallback}
          />
        </Grid>
      )}
    </Grid>
  )
}

const annotationStyles = makeStyles((theme) => ({
  note: {
    width: "100%",
  },
  unfolder: {
    cursor: "pointer",
  },
  centering: {
    display: "flex",
    alignItems: "center",
  },
  centered: {
    display: "table",
    margin: "auto auto",
  },
}))

function Annotations({
  gist,
  details,
  citationNote,
  gistHandler,
  notesHandler,
  citationNoteHandler,
}: {
  gist: string
  citationNote: string
  details: string
  citationNoteHandler: (e: ChangeEvent<HTMLInputElement>) => void
  gistHandler: (e: ChangeEvent<HTMLInputElement>) => void
  notesHandler: (e: ChangeEvent<HTMLTextAreaElement>) => void
}) {
  const classes = annotationStyles()
  const [showMore, setShowMore] = useState(false)
  const showerOpts: any = {
    className: classes.unfolder,
    onClick: () => setShowMore(!showMore),
  }
  if (citationNote || details) showerOpts.color = "secondary"
  return (
    <div>
      <Collapse in={showMore}>
        <TextField
          label="Note on Citation"
          id="citation-note"
          placeholder="Notes on the citation above"
          className={classes.note}
          rowsMax={2}
          value={citationNote}
          onChange={citationNoteHandler}
        />
      </Collapse>
      <Grid container>
        <Grid item xs={11}>
          <TextField
            label="Gist"
            id="gist"
            multiline
            autoFocus
            placeholder="Essential information about this topic"
            className={classes.note}
            rowsMax={2}
            value={gist}
            onChange={gistHandler}
          />
        </Grid>
        <Grid item xs={1} className={classes.centering}>
          <div className={classes.centered}>
            {showMore ? (
              <UnfoldMore {...showerOpts} />
            ) : (
              <UnfoldLess {...showerOpts} />
            )}
          </div>
        </Grid>
      </Grid>
      <Collapse in={showMore}>
        <TextField
          label="Elaboration"
          id="details"
          multiline
          placeholder="Further observations about this topic"
          className={classes.note}
          rowsMax={6}
          value={details}
          onChange={notesHandler}
        />
      </Collapse>
    </div>
  )
}

function Relations({ note, hasWord }: { note: Note; hasWord: boolean }) {
  const [initialize, setInitialize] = useState(true)
  const [phraseMap, setPhraseMap] = useState(new Map<string, string>())
  const { relations } = note.state
  if (initialize) {
    const keys: string[] = []
    for (const others of Object.values(relations)) {
      for (const k of others) {
        keys.push(enkey(k))
      }
    }
    if (keys.length) {
      note.app.switchboard.then(() => {
        note.app.switchboard
          .index!.getBatch(keys)
          .then((results) => {
            const realMap = new Map<string, string>()
            Object.entries(results).forEach(([key, n]) => {
              realMap.set(key, notePhrase(n))
              note.app.switchboard.index!.cache.set(key, n)
            })
            setInitialize(false)
            setPhraseMap(realMap)
          })
          .catch((e) => note.app.error(e))
      })
    } else {
      setInitialize(false)
    }
  }
  const showSomething =
    hasWord && !!Object.keys(relations).length && !initialize
  return (
    <>
      {!showSomething && <Box mt={2} />}
      {showSomething && (
        <Box m={2}>
          {Object.entries(relations).map(([relation, keys]) => (
            <Grid container key={relation} spacing={2}>
              <Grid item container xs={3} justify="flex-end">
                {relation}
              </Grid>
              <Grid item xs={9}>
                {keys.map((k) => {
                  const key = enkey(k)
                  return (
                    <Chip
                      key={key}
                      label={phraseMap.get(key)}
                      size="small"
                      variant="outlined"
                      clickable
                      onClick={() => {
                        // a bit of a hack -- this forces a refresh of everything -- going to sorters because it's a simplish tab
                        note.app.setState({ tab: Section.sorters }, () => {
                          note.app.goto(
                            note.app.switchboard.index!.cache.get(key)!
                          )
                        })
                      }}
                      onDelete={() => {
                        note.app.switchboard
                          .index!.unrelate(
                            { phrase: note.state.key, role: relation },
                            {
                              phrase: k,
                              role: note.app.switchboard.index!.reverseRelation(
                                k[0],
                                relation
                              )!,
                            }
                          )
                          .then(({ head }) => {
                            note.setState({ relations: head.relations }, () => {
                              setInitialize(true)
                              setPhraseMap(new Map())
                              note.app.cleanSearch()
                              note.app.cleanHistory(true)
                            })
                          })
                          .catch((e) => note.app.error(e))
                      }}
                      deleteIcon={<Cancel />}
                    />
                  )
                })}
              </Grid>
            </Grid>
          ))}
        </Box>
      )}
    </>
  )
}

export function nullState(): NoteState {
  return {
    key: [0, 0], // "namespace" and primary key for the note; project indices map to names; e.g., "German"; project 0 is the default; 0 represents an unsaved note
    gist: "", // the most important notes about the phrase
    details: "", // less essential notes about the phrase
    tags: [], // tags used to categorize phrases
    citations: [], // instances this *particular* phrase, after normalization, has been found
    relations: {},
    unsavedContent: false,
    everSaved: false,
    unsavedCitation: false,
    citationIndex: 0,
  }
}

// add a new citation to an existing record
function mergeCitation(
  note: NoteRecord,
  citation: CitationRecord
): number | undefined {
  let match: CitationRecord | null = null
  let index: number | undefined
  const { source, selection } = citation
  for (let i = 0; i < note.citations.length; i++) {
    const c = note.citations[i]
    if (
      citation.phrase === c.phrase &&
      citation.before === c.before &&
      citation.after === c.after &&
      source.title === c.source.title &&
      source.url === c.source.url &&
      selection.path === c.selection.path &&
      !anyDifference(selection.anchor, c.selection.anchor) &&
      !anyDifference(selection.focus, c.selection.focus)
    ) {
      index = i
      match = c
      break
    }
  }
  if (match) {
    match.when.unshift(citation.when[0])
  } else {
    note.citations.unshift(citation)
  }
  return index
}
