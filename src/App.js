import React from 'react'
import './App.scss'
import Note from './Note'
import Config from './Config'
import Switchboard from './modules/switchboard'

import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import AppBar from '@material-ui/core/AppBar';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Typography from '@material-ui/core/Typography';
import Box from '@material-ui/core/Box';
import BuildIcon from '@material-ui/icons/Build'

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
      <div className={`App ${classes.root}`}>
        <AppBar position="static">
          <Tabs value={this.state.value} onChange={handleChange} aria-label="Amanuensis navigation">
            <Tab label="Note" {...a11yProps(0)} value={0} />
            <Tab label="Search" {...a11yProps(1)} value={1} />
            <Tab label="Realms" {...a11yProps(2)} value={2} />
            <Tab icon={<BuildIcon />} {...a11yProps(3)} value={3} />
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
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
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
