import React from 'react'
import ReactDOM from 'react-dom'
import * as Redux from 'redux'

import App from './components/App.mjs'

document.getElementById('root').textContent = ''

ReactDOM.render(
  <App />,
  document.getElementById('root'),
)