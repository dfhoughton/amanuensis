import React from 'react';
import './App.scss';
// import Game from './Game.js';
import Note from './Note.js';
import Switchboard from './modules/switchboard.js'

/*global chrome*/
class App extends React.Component {
  constructor(props) {
    super()
    this.switchboard = new Switchboard(chrome)
  }
  render() {
    return (
      <div className="App">
        <Note switchboard={this.switchboard}/>
      </div>
    );
  }
  componentDidMount() {
    this.switchboard.mounted()
  }
}

export default App;
