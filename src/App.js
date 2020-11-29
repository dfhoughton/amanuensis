import React from 'react'
import './App.scss'
import Note from './Note'
import Switchboard from './modules/switchboard'

import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import AppBar from '@material-ui/core/AppBar';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Typography from '@material-ui/core/Typography';
import Box from '@material-ui/core/Box';

/*global chrome*/
class App extends React.Component {
  constructor(props) {
    super()
    this.switchboard = new Switchboard(chrome)
    this.stash = new Map()
    this.state = {
      tab: 0
    }
  }
  render() {
    const {classes} = this.props;

    const handleChange = (_event, newValue) => {
      this.setState({ tab: newValue });
    };
    return (
      <div className={`App ${classes.root}`}>
        <AppBar position="static">
          <Tabs tab={this.state.tab} onChange={handleChange} aria-label="Amanuensis navigation">
            <Tab label="Note" {...a11yProps(0)} tab={0} />
            <Tab label="Search" {...a11yProps(1)} tab={1} />
            <Tab label="Realms" {...a11yProps(2)} tab={2} />
          </Tabs>
        </AppBar>
        <TabPanel tab={this.state.tab} index={0}>
          <Note stash={this.stash} switchboard={this.switchboard} />
        </TabPanel>
        <TabPanel tab={this.state.tab} index={1}>
          Item Two
        </TabPanel>
        <TabPanel tab={this.state.tab} index={2}>
          Item Three
        </TabPanel>
      </div>
    );
  }

  componentDidMount() {
    this.switchboard.mounted()
  }
}

export default withStyles(styles)(App);

// code below taken with little or no modification from the material-ui tab demo code

function TabPanel(props) {
  const { children, tab, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={tab !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {tab === index && (
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
  tab: PropTypes.any.isRequired,
};

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

const styles = theme => ({
  root: {
    flexGrow: 1,
    backgroundColor: theme.palette.background.paper,
  },
});
