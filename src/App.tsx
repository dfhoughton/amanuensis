import React, { ReactElement, SyntheticEvent } from 'react'
import Note, { NoteState } from './Note'
import Config from './Config'
import Switchboard from './modules/switchboard'
import Projects from './Projects'
import Search from './Search'

import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles'
import { withStyles } from '@material-ui/core/styles'

import { Build, Edit, LocalLibrary, Search as SearchIcon, Sort } from '@material-ui/icons'

import { amber, indigo } from '@material-ui/core/colors'
import {
  AppBar, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Snackbar, Tab, Tabs, Typography
} from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import { AdHocQuery, Chrome, NoteRecord, Query } from './modules/types'
import { anyDifference, deepClone } from './modules/clone'
import { enkey } from './modules/storage'
import { flatten, sameNote } from './modules/util'
import Sorting from './Sorting'

export const projectName = "Notorious"

const theme = createMuiTheme({
  palette: {
    primary: indigo,
    secondary: amber,
  },
})

interface AppProps {
  // injected style props
  classes: {
    root: string
  }
}

interface ConfirmationState {
  callback?: () => Promise<string | undefined>,
  title?: string,
  text?: string | ReactElement,
  ok?: string,
}

interface AppState {
  tab: number,
  url: string | null,
  message: Message | null,
  history: Visit[],
  historyIndex: number,
  defaultProject: number,
  search: Query,
  searchResults: NoteRecord[],
  confirmation: ConfirmationState,
}

interface Message {
  text: string,
  level: MessageLevels
}

export interface Visit {
  current: NoteState,
  saved: NoteState,
}

type MessageLevels = "error" | "warning" | "info" | "success"

const styles = (theme: any) => ({
  root: {
    flexGrow: 1,
    width: '550px',
    // backgroundColor: theme.palette.background.paper,
  },
  button: {
    margin: theme.spacing(1),
  },
});

/*global chrome*/
declare var chrome: Chrome;
export class App extends React.Component<AppProps, AppState> {
  switchboard: Switchboard
  constructor(props: AppProps) {
    super(props)
    this.switchboard = new Switchboard(chrome)
    this.state = {
      tab: 0,
      url: null,
      message: null,
      history: [],
      historyIndex: -1,
      defaultProject: 0,
      search: { type: "ad hoc" },
      searchResults: [],
      confirmation: {},
    }
  }

  render() {
    const { classes } = this.props;

    const handleChange = (_event: any, newValue: number) => {
      this.setState({ tab: newValue });
    }
    const closeBar = (event: SyntheticEvent<Element, Event>) => {
      this.clearMessage()
    }
    return (
      <ThemeProvider theme={theme}>
        <div className={classes.root}>
          <AppBar position="sticky">
            <Tabs value={this.state.tab} onChange={handleChange} variant="fullWidth" aria-label={`${projectName} navigation`}>
              <Tab icon={<Edit />} {...a11yProps(0)} value={0} />
              <Tab icon={<SearchIcon />} {...a11yProps(2)} value={2} />
              <Tab icon={<LocalLibrary />} {...a11yProps(1)} value={1} />
              <Tab icon={<Sort />} {...a11yProps(4)} value={4} />
              <Tab icon={<Build />} {...a11yProps(3)} value={3} />
            </Tabs>
          </AppBar>
          <TabPanel value={this.state.tab} index={0}>
            <Note app={this} />
          </TabPanel>
          <TabPanel value={this.state.tab} index={1}>
            <Projects app={this} />
          </TabPanel>
          <TabPanel value={this.state.tab} index={2}>
            <Search app={this} />
          </TabPanel>
          <TabPanel value={this.state.tab} index={3}>
            <Config app={this} />
          </TabPanel>
          <TabPanel value={this.state.tab} index={4}>
            <Sorting app={this} />
          </TabPanel>
          <Snackbar open={!!this.state.message} autoHideDuration={6000} onClose={closeBar}>
            <Alert onClose={closeBar} severity={this.state.message?.level || 'info'}>{this.state.message?.text}</Alert>
          </Snackbar>
          <ConfirmationModal app={this} confOps={this.state.confirmation} cancel={() => this.setState({ confirmation: {} })} />
        </div>
      </ThemeProvider>
    );
  }

  componentDidMount() {
    this.switchboard.mounted()
    this.switchboard.then(() => this.setState({ defaultProject: this.switchboard.index!.currentProject }))
    this.switchboard.addActions("app", {
      url: ({ url }) => this.setState({ url }),
      error: ({ message }: { message: string }) => this.error(message)
    })
  }

  notify(text: string, level: MessageLevels = "info") {
    switch (level) {
      case 'error':
        console.error(text)
        break
      case 'warning':
        console.warn(text)
        break
      case 'info':
        console.info(level, text)
        break
      case 'success':
        console.log(level, text)
        break
    }
    this.setState({ message: { text, level } })
  }
  success(message: string) {
    this.notify(message, 'success')
  }
  error(message: string) {
    this.notify(message, "error")
  }
  warn(message: string) {
    this.notify(message, "warning")
  }
  clearMessage() {
    this.setState({ message: null })
  }

  // pop open the confirmation modal
  confirm(confirmation: ConfirmationState) {
    this.setState({ confirmation })
  }

  // search for any citations from the current URL
  urlSearch() {
    const index = this.switchboard.index
    if (this.state.url && index) {
      const search: AdHocQuery = {
        type: 'ad hoc',
        url: this.state.url
      }
      index.find(search)
        .then((found) => {
          switch (found.type) {
            case "none":
              this.setState({ search, tab: 2, searchResults: [] })
              break
            case "ambiguous":
              this.setState({ search, tab: 2, searchResults: found.matches })
              break
            case "found":
              this.setState({ search, tab: 2, searchResults: [found.match] })
          }
        })
        .catch((e) => this.error(e))
    }
  }

  recentHistory(): Visit | undefined {
    return this.state.history[this.state.historyIndex]
  }

  currentNote(): NoteState | undefined {
    return this.recentHistory()?.current
  }

  // to happen after a save
  changeHistory(current: NoteState, saved: NoteState) {
    const newHistory = deepClone(this.state.history)
    newHistory[this.state.historyIndex] = { current, saved }
    this.setState({ history: newHistory })
  }

  // to happen when a note is navigated away from to another tab
  makeHistory(current: NoteState, saved: NoteState) {
    let historyIndex = 0, found = false
    for (let l = this.state.history.length; historyIndex < l; historyIndex++) {
      const v = this.state.history[historyIndex]
      if (sameNote(v.current, current)) {
        found = true
        if (!anyDifference(v.current, current)) {
          this.setState({ historyIndex })
          return
        }
        break
      }
    }
    const newEvent = { current, saved }
    const history: Visit[] = deepClone(this.state.history)
    if (found) {
      history[historyIndex] = newEvent
    } else {
      historyIndex = history.length
      history.push(newEvent)
    }
    this.setState({ history, historyIndex })
  }

  // go to an existing saved note
  goto(note: NoteRecord | NoteState, callback: () => void = () => { }) {
    let historyIndex = 0
    // erase the null state if it's present in the history
    const history: Visit[] = (deepClone(this.state.history) as Visit[]).filter((v) => v.current.citations.length > 0)
    for (let l = history.length; historyIndex < l; historyIndex++) {
      const v = this.state.history[historyIndex]
      if (sameNote(v.current, note)) {
        this.setState({ history, historyIndex, tab: 0 }, callback)
        return
      }
    }
    const current: NoteState = {
      ...note,
      everSaved: true,
      citationIndex: 0,
      unsavedContent: false,
      unsavedCitation: false,
    }
    const saved: NoteState = deepClone(current)
    history.push({ current, saved })
    this.setState({ tab: 0, history, historyIndex }, callback)
  }

  removeNote(note: NoteState) {
    const [, project] = this.switchboard.index!.findProject(note.key[0])
    this.switchboard.index?.delete({ phrase: note.citations[0].phrase, project })
      .then((otherNotesModified) => {
        this.cleanHistory(otherNotesModified)
          .catch((e) => this.error(e))
          .then(() => {
            this.cleanSearch()
              .catch((e) => this.error(`Error restoring search after note deletion: ${e}`))
              .then(() => this.success(`The note regarding "${note.citations[0].phrase}" has been deleted from the ${project.name} project.`))
          })
      })
      .catch((e) => this.error(e))
  }
  // clean up the search state after some deletion
  cleanSearch(): Promise<void> {
    return new Promise((resolve, reject) => {
      const search: Query = this.state.search.type === 'lookup' ? { type: 'ad hoc' } : deepClone(this.state.search)
      const p = search.project == null ? null : flatten(search.project)
      if (p) {
        // projects may be deleted
        for (let i = p.length - 1; i >= 0; i--) {
          if (!this.switchboard.index!.reverseProjectIndex.has(p[i])) {
            p.splice(i, 1)
          }
        }
        switch (p.length) {
          case 0:
            delete search.project
            break;
          case 1:
            search.project = p[0]
            break
          default:
            search.project = p
        }
      }
      this.switchboard.index?.find(search)
        .catch((e) => reject(e))
        .then((found) => {
          const changes: any = { search, historyIndex: 0 }
          if (found) {
            switch (found.type) {
              case "none":
                changes.searchResults = []
                break
              case "ambiguous":
                changes.searchResults = found.matches
                break
              case 'found':
                changes.searchResults = [found.match]
            }
          }
          this.setState(changes, () => resolve())
        })
    }
    )
  }
  // fix the state of everything in navigational history
  cleanHistory(otherNotesModified: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const keys: string[] = this.state.history.map((v) => enkey(v.current.key))
      this.switchboard.index?.getBatch(keys)
        .catch((e) => reject(`Failed to retrieve information required to clean navigation history: ${e}`))
        .then((found) => {
          const history: Visit[] = deepClone(this.state.history)
          let historyIndex = this.state.historyIndex
          for (let i = history.length - 1; i >= 0; i--) {
            const visit = history[i]
            const key = enkey(visit.current.key)
            const retrieved = found && found[key]
            let current, saved: NoteState
            if (retrieved) {
              if (otherNotesModified) {
                // erase any unsaved changes (Gordian Knot solution -- we could do better)
                current = { ...retrieved, unsavedContent: false, unsavedCitation: false, everSaved: true, citationIndex: visit.current.citationIndex }
                saved = deepClone(current)
                history[i] = { current, saved }
              }
            } else {
              // remove it from navigational history
              if (historyIndex > i) {
                historyIndex--
              } else if (historyIndex === i) {
                historyIndex = 0
              }
              history.splice(i, 1)
            }
          }
          this.setState({ history, historyIndex }, () => resolve())
        })
    })
  }
}

export default withStyles(styles)(App);

// code below taken with little or no modification from the material-ui value demo code

function TabPanel({ children, value, index }: { children: ReactElement, value: number, index: number }) {

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`full-width-tabpanel-${index}`}
      aria-labelledby={`full-width-tab-${index}`}
    >
      {value === index && (
        <Box p={3}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `full-width-tab-${index}`,
    'aria-controls': `full-width-tabpanel-${index}`,
  };
}

function ConfirmationModal({ app, confOps, cancel }: { app: App, confOps: ConfirmationState, cancel: () => void }) {
  const { text, callback, title = "Confirm", ok = "Ok" } = confOps
  if (!(text && callback)) {
    return null
  }
  return (
    <Dialog
      open
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id="confirm-dialog-description">{text}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel} >
          Cancel
        </Button>
        <Button
          onClick={
            () => {
              callback()
                .then((message) => app.setState({ confirmation: {} }, () => {
                  if (message) {
                    app.success(message)
                  }
                }))
                .catch((e) => app.error(e.message))
            }
          }
          color="primary"
          autoFocus
        >
          {ok}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
