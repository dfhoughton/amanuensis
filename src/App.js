import React from 'react'
import './App.scss'
import Note from './Note'
import Config from './Config'
import Switchboard from './modules/switchboard'
import Projects from './Projects'
import Search from './Search'
import { tt } from './modules/util'

import PropTypes from 'prop-types'
import { createMuiTheme, makeStyles, ThemeProvider } from '@material-ui/core/styles'
import { withStyles } from '@material-ui/core/styles'

import { Build, Edit, LocalLibrary, Search as SearchIcon } from '@material-ui/icons'

import { amber, indigo } from '@material-ui/core/colors'
import { AppBar, Box, Snackbar, Tab, Tabs, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'

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


/*global chrome*/
class App extends React.Component {
  constructor(props) {
    super()
    this.switchboard = new Switchboard(chrome)
    this.stash = new Map()
    this.state = {
      value: 0,
      message: null
    }
  }
  notify(message, level = "info") {
    console.log({ message, level })
    this.setState({ message: { text: message, level } })
  }
  clearMessage() {
    this.setState({ message: null })
  }
  render() {
    const { classes } = this.props;

    const handleChange = (_event, newValue) => {
      this.setState({ value: newValue });
    }
    const closeBar = (_event, reason) => {
      if (reason === 'clickaway') {
        return
      }
      this.clearMessage()
    }
    const notify = this.notify.bind(this)
    return (
      <ThemeProvider theme={theme}>
        <div className={`App ${classes.root}`}>
          <AppBar position="static">
            <Tabs value={this.state.value} onChange={handleChange} variant="fullWidth" aria-label="Amanuensis navigation">
              <Tab icon={tt("note", <Edit />)} {...a11yProps(0)} value={0} />
              <Tab icon={tt("projects", <LocalLibrary />)} {...a11yProps(1)} value={1} />
              <Tab icon={tt("search", <SearchIcon />)} {...a11yProps(2)} value={2} />
              <Tab icon={tt("configuration", <Build />)} {...a11yProps(3)} value={3} />
            </Tabs>
          </AppBar>
          <TabPanel value={this.state.value} index={0}>
            <Note stash={this.stash} switchboard={this.switchboard} notify={notify} />
          </TabPanel>
          <TabPanel value={this.state.value} index={1}>
            <Projects switchboard={this.switchboard} notify={notify} />
          </TabPanel>
          <TabPanel value={this.state.value} index={2}>
            <Search switchboard={this.switchboard} notify={notify} />
          </TabPanel>
          <TabPanel value={this.state.value} index={3}>
            <Config switchboard={this.switchboard} classes={classes} notify={notify} />
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
  }
}

export default withStyles(styles)(App);

// code below taken with little or no modification from the material-ui value demo code

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`full-width-tabpanel-${index}`}
      aria-labelledby={`full-width-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={3}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired,
};

function a11yProps(index) {
  return {
    id: `full-width-tab-${index}`,
    'aria-controls': `full-width-tabpanel-${index}`,
  };
}

const styles = theme => ({
  root: {
    flexGrow: 1,
    backgroundColor: theme.palette.background.paper,
  },
  button: {
    margin: theme.spacing(1),
  },
});
