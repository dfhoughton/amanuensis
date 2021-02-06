import React, { ReactElement, SyntheticEvent } from 'react'
import Note, { NoteState } from './Note'
import Config from './Config'
import Switchboard from './modules/switchboard'
import Projects from './Projects'
import Search from './Search'

import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles'
import { withStyles } from '@material-ui/core/styles'

import { Build, Edit, LocalLibrary, Search as SearchIcon } from '@material-ui/icons'

import { amber, indigo } from '@material-ui/core/colors'
import {
  AppBar, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Snackbar, Tab, Tabs, Typography
} from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import { Chrome, NoteRecord, Query } from './modules/types'
import { anyDifference, deepClone } from './modules/clone'
import { enkey } from './modules/storage'

export const projectName = "Notorious"

const theme = createMuiTheme({
  palette: {
    primary: indigo,
    secondary: amber,
  },
  // overrides: {
  //   MuiFilledInput: {
  //     root: {
  //       backgroundColor: 'transparent',
  //       '&:hover': {
  //         backgroundColor: 'transparent',
  //       }
  //     },
  //   }
  // }
})

interface AppProps {
  // injected style props
  classes: {
    root: string
  }
}

interface ConfirmationState {
  callback?: () => void,
  title?: string,
  text?: string | ReactElement,
  ok?: string,
}

interface AppState {
  tab: number,
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

interface Visit {
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
          <AppBar position="static">
            <Tabs value={this.state.tab} onChange={handleChange} variant="fullWidth" aria-label={`${projectName} navigation`}>
              <Tab icon={<Edit />} {...a11yProps(0)} value={0} />
              <Tab icon={<SearchIcon />} {...a11yProps(2)} value={2} />
              <Tab icon={<LocalLibrary />} {...a11yProps(1)} value={1} />
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
            <Config classes={classes} app={this} />
          </TabPanel>
          <Snackbar open={!!this.state.message} autoHideDuration={6000} onClose={closeBar}>
            <Alert onClose={closeBar} severity={this.state.message?.level || 'info'}>{this.state.message?.text}</Alert>
          </Snackbar>
          <ConfirmationModal confOps={this.state.confirmation} cancel={() => this.setState({ confirmation: {} })} />
        </div>
      </ThemeProvider>
    );
  }

  componentDidMount() {
    this.switchboard.mounted()
    this.switchboard.then(() => this.setState({ defaultProject: this.switchboard.index!.currentProject }))
    this.switchboard.addActions({
      reloaded: (msg) => this.highlight(msg),
      error: ({ message }: { message: string }) => this.error(`There was an error in the currently active page: ${message}`)
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

  highlight({ url }: { url: string }) {
    // TODO
    // check to make sure the URL is what is currently in the history
    // if so, send the select action with the relevant citation
  }

  recentHistory(): Visit | undefined {
    return this.state.history[this.state.historyIndex]
  }

  // to happen after a save
  changeHistory(current: NoteState, saved: NoteState) {
    const newHistory = deepClone(this.state.history)
    newHistory[this.state.historyIndex] = { current, saved }
    this.setState({ history: newHistory })
  }

  // to happen when a note is navigated away from to another tab
  makeHistory(current: NoteState, saved: NoteState) {
    const newEvent = { current, saved }
    if (anyDifference(this.recentHistory(), newEvent)) {
      const newHistory = deepClone(this.state.history)
      newHistory.push(newEvent)
      this.setState({ history: newHistory, historyIndex: this.state.history.length })
    }
  }

  // to travel to a different point in history
  timeTravel(index: number, current?: NoteState, saved?: NoteState) {
    if (index !== this.state.historyIndex && index >= 0 && this.state.history[index]) {
      if (current && saved) {
        this.makeHistory(current, saved)
        this.setState({ historyIndex: index, tab: 2 }) // toggle tab to force a re-render of the note
        this.setState({ tab: 0 })
      }
    } else {
      this.warn(`could not go to citation ${index + 1} in history`)
    }
  }

  removeNote(note: NoteState) {
    const [, project] = this.switchboard.index!.findProject(note.key[0])
    this.switchboard.index?.delete({ phrase: note.citations[0].phrase, project })
      .then((otherNotesModified) => {
        const done = () => this.success(`The note regarding "${note.citations[0].phrase}" has been deleted from the ${project.name} project.`)
        let search: Query
        switch (this.state.search.type) {
          case "lookup":
            search = { type: "ad hoc" }
            this.switchboard.index?.find(search)
              .then((found) => {
                switch (found.type) {
                  case "none":
                    this.setState({
                      historyIndex: 0,
                      history: [],
                      searchResults: [],
                      tab: 2,
                      search
                    })
                    done()
                    break
                  case "found":
                    this.error(`the "found" state should be unreachable when deleting a note found by lookup`)
                    break
                  case "ambiguous":
                    this.error(`the "ambiguous" state should be unreachable when deleting a note found by lookup`)
                    break
                }
              })
              .catch((e) => this.error(e))
            break
          case "ad hoc":
            // TODO
            this.cleanHistory(otherNotesModified).catch(e => this.error(e)).then(() => { })
            break
        }
      })
      .catch((e) => this.error(e))
  }
  // remove deleted notes from navigational history
  cleanHistory(otherNotesModified: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const keys: string[] = this.state.history.map((v) => enkey(v.current.key))
      const missing: string[] = []
      const foundNotes: Map<string, NoteRecord> = new Map()
      for (const key of keys) {
        const note = this.switchboard.index?.cache.get(key)
        if (note) {
          foundNotes.set(key, note)
        } else {
          missing.push(key)
        }
      }
      const continuation = () => {
        const history: Visit[] = deepClone(this.state.history)
        let indexChanged = false
        let historyIndex = this.state.historyIndex
        for (let i = history.length - 1; i >= 0; i--) {
          const key = keys[i]
          const note = foundNotes.get(key)
          if (note) {
            const oldHistory = this.state.history[i]
            const ns = {
              unsavedContent: oldHistory.current.unsavedContent,
              citationIndex: oldHistory.current.citationIndex,
              ...note
            }
            let v: Visit
            if (otherNotesModified) {
              v = deepClone(oldHistory)
              v.current.unsavedContent = false
              v.current.relations = note.relations
              v.saved = deepClone(v.current)
              history[i] = v
            }
          } else {
            history.splice(i, 1)
            if (i === this.state.historyIndex) {
              indexChanged = true
            } else if (!indexChanged && i < historyIndex) {
              historyIndex--
            }
          }
          if (indexChanged) {
            historyIndex = history.length - 1
          }
          this.setState({ historyIndex, history })
        }
      }
      if (missing.length) {
        chrome.storage.local.get(missing, (found) => {
          if (chrome.runtime.lastError) {
            reject(`could not obtain all information required to clean history: ${chrome.runtime.lastError}`)
          } else {
            for (const [key, note] of Object.entries(found)) {
              foundNotes.set(key, note as NoteRecord)
            }
            continuation()
          }
        })
      } else {
        continuation()
      }
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

function ConfirmationModal({ confOps, cancel }: { confOps: ConfirmationState, cancel: () => void }) {
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
        <Button onClick={callback} color="primary" autoFocus>{ok}</Button>
      </DialogActions>
    </Dialog>
  )
}
