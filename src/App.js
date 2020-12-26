import React from 'react'
import './App.scss'
import Note from './Note'
import Config from './Config'
import Switchboard from './modules/switchboard'

import PropTypes from 'prop-types'
import { createMuiTheme, makeStyles, ThemeProvider } from '@material-ui/core/styles'
import { withStyles } from '@material-ui/core/styles'

import AppBar from '@material-ui/core/AppBar'
import Box from '@material-ui/core/Box'
import Tab from '@material-ui/core/Tab'
import Tabs from '@material-ui/core/Tabs'
import Tooltip from '@material-ui/core/Tooltip'
import Typography from '@material-ui/core/Typography'

import BuildIcon from '@material-ui/icons/Build'
import EditIcon from '@material-ui/icons/Edit'
import LocalLibraryIcon from '@material-ui/icons/LocalLibrary'
import SearchIcon from '@material-ui/icons/Search'

import amber from '@material-ui/core/colors/amber'
import indigo from '@material-ui/core/colors/indigo'

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
    }
  }
  render() {
    const { classes } = this.props;

    const handleChange = (_event, newValue) => {
      this.setState({ value: newValue });
    };
    return (
      <ThemeProvider theme={theme}>
        <div className={`App ${classes.root}`}>
          <AppBar position="static">
            <Tabs value={this.state.value} onChange={handleChange} variant="fullWidth" aria-label="Amanuensis navigation">
              <Tab icon={tt("note", <EditIcon />)} {...a11yProps(0)} value={0} />
              <Tab icon={tt("projects", <LocalLibraryIcon />)} {...a11yProps(2)} value={2} />
              <Tab icon={tt("search", <SearchIcon />)} {...a11yProps(1)} value={1} />
              <Tab icon={tt("configuration", <BuildIcon />)} {...a11yProps(3)} value={3} />
            </Tabs>
          </AppBar>
          <TabPanel value={this.state.value} index={0}>
            <Note stash={this.stash} switchboard={this.switchboard} />
          </TabPanel>
          <TabPanel value={this.state.value} index={1}>
            Item Two
        </TabPanel>
          <TabPanel value={this.state.value} index={2}>
            Item Three
        </TabPanel>
          <TabPanel value={this.state.value} index={3}>
            <Config switchboard={this.switchboard} classes={classes} />
          </TabPanel>
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

function tt(msg, obj) {
  return <Tooltip title={msg} arrow>{obj}</Tooltip>
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
