import React from 'react';

function Square(props) {
    return (
        <button
            className="square"
            onClick={props.onClick}
        >
            {props.value}
        </button>
    );
}

class Board extends React.Component {

    renderSquare(i) {
        return (
            <Square
                value={this.props.squares[i]}
                onClick={() => this.props.handleClick(i)}
            />
        );
    }

    render() {
        return (
            <div className="board-grid">
                <div className="board-row">
                    {this.renderSquare(0)}
                    {this.renderSquare(1)}
                    {this.renderSquare(2)}
                </div>
                <div className="board-row">
                    {this.renderSquare(3)}
                    {this.renderSquare(4)}
                    {this.renderSquare(5)}
                </div>
                <div className="board-row">
                    {this.renderSquare(6)}
                    {this.renderSquare(7)}
                    {this.renderSquare(8)}
                </div>
            </div>
        );
    }
}

class Game extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            active: 0,
            where: 0,
            history: [{
                squares: Array(9).fill(null),
                xIsNext: true,
                winner: null,
            }],
        };
    }

    w00t() {
        const board = document.getElementsByClassName('board-grid')[0];
        board.classList.add('w00t');
        setTimeout(function () { board.classList.remove('w00t'); }, 1000);
    }

    minorPing() {
        const board = document.getElementsByClassName('board-grid')[0];
        board.classList.add('glow');
        setTimeout(function () { board.classList.remove('glow'); }, 500);
    }

    flashTimeTravelWarning() {
        this.minorPing();
        const flash = document.getElementsByClassName('naughty-naughty')[0];
        const restart = document.getElementsByClassName('restart')[0];
        flash.classList.add('flash');
        restart.classList.add('glow');
        setTimeout(function () { flash.classList.remove('flash'); restart.classList.remove('glow'); }, 500);
    }

    mutable() {
        return this.state.active === this.state.where
    }

    deadlock() {
        const current = this.state.history[this.state.active];
        return !current.winner && this.state.where === 9;
    }

    handleClick(i) {
        if (!this.mutable()) {
            this.flashTimeTravelWarning();
            return
        }
        const history = this.state.history;
        const current = history[this.state.active];
        if (current.winner || current.squares[i]) {
            this.minorPing();
            return
        }
        const squares = current.squares.slice();
        squares[i] = current.xIsNext ? 'X' : 'O';
        const winner = calculateWinner(squares);
        if (winner) {
            this.w00t();
        }
        this.setState({
            active: history.length,
            where: history.length,
            history: history.concat({
                squares: squares,
                xIsNext: !current.xIsNext,
                winner: winner,
            })
        }
        );
    }

    jumpTo(move) {
        this.setState({ where: move });
    }

    restart() {
        const history = this.state.history.slice(0, this.state.where + 1);
        this.setState({
            active: this.state.where,
            history: history
        });
    }

    render() {
        const history = this.state.history;
        const current = history[this.state.where];
        const status = current.winner ? <span className="winner">Winner: {current.winner}</span> : 'Next player: ' + (current.xIsNext ? 'X' : 'O');
        const finalIndex = this.mutable() ? history.length - 1 : history.length;
        const moves = history.slice(0, finalIndex).map((step, move) => {
            const desc = move ? `Go to move ${move}` : 'Go to game start';
            const cz = move === this.state.where ? 'active' : 'none';
            return (
                <li key={move} className={cz}>
                    <button onClick={() => this.jumpTo(move)}>{desc}</button>
                </li>
            )
        });
        return (
            <div className="game">
                <div className="game-board">
                    <Board
                        handleClick={i => this.handleClick(i)}
                        squares={current.squares}
                    />
                </div>
                <div className="game-info">
                    <div>{status}</div>
                    <div className="naughty-naughty squashed">naughty, naughty!</div>
                    <ol className="game-moves">{moves}</ol>
                    {!this.mutable() &&
                        <button className="restart" onClick={() => this.restart()}>
                            resume here
                        </button>
                    }
                    {this.deadlock() &&
                        <div className="deadlock">
                            DEADLOCK
                        </div>
                    }
                </div>
            </div>
        );
    }
}

function calculateWinner(squares) {
    const lines = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ];
    for (let i = 0; i < lines.length; i++) {
        const [a, b, c] = lines[i];
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            return squares[a];
        }
    }
    return null;
}

export default Game;
