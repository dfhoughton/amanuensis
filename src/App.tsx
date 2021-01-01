import React, { ReactElement, SyntheticEvent } from 'react'
import Note from './Note'
import { NoteState } from './Note'
import Config from './Config'
import Switchboard from './modules/switchboard'
import Projects from './Projects'
import Search from './Search'

import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles'
import { withStyles } from '@material-ui/core/styles'

import { Build, Edit, LocalLibrary, Search as SearchIcon } from '@material-ui/icons'

import { amber, indigo } from '@material-ui/core/colors'
import { AppBar, Box, Snackbar, Tab, Tabs, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import { Chrome, ProjectInfo } from './modules/types'
import { anyDifference, deepClone } from './modules/clone'

const theme = createMuiTheme({
  palette: {
    primary: indigo,
    secondary: amber,
  },
  overrides: {
    MuiFilledInput: {
      root: {
        backgroundColor: 'transparent',
        '&:hover': {
          backgroundColor: 'transparent',
        }
      },
    }
  }
})

interface AppProps {
  // injected style props
  classes: {
    root: string
  }
}

interface AppState {
  tab: number,
  message: Message | null,
  history: Visit[],
  historyIndex: number,
  defaultProject: number,
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
    minWidth: '550px',
    backgroundColor: theme.palette.background.paper,
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
            <Tabs value={this.state.tab} onChange={handleChange} variant="fullWidth" aria-label="Amanuensis navigation">
              <Tab icon={<Edit />} {...a11yProps(0)} value={0} />
              <Tab icon={<LocalLibrary />} {...a11yProps(1)} value={1} />
              <Tab icon={<SearchIcon />} {...a11yProps(2)} value={2} />
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
        </div>
      </ThemeProvider>
    );
  }

  componentDidMount() {
    this.switchboard.mounted()
    // add handlers for reloaded and error
    this.switchboard.addActions({
      reloaded: (msg) => this.highlight(msg),
      error: ({ message }: { message: string }) => this.notify(message, 'error')
    })
  }

  notify(message: string, level: MessageLevels = "info") {
    console.log({ message, level })
    this.setState({ message: { text: message, level } })
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
