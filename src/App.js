import React from 'react'
import './App.scss'
import Note from './Note'
import Switchboard from './modules/switchboard'

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
