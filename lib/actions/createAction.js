import _ from 'lodash'

import actions from './actionsMap'

const createAction = (n, cb) => {
  const cName = _.snakeCase(n).toUpperCase()  // foo bar => FOO_BAR
  const fName = _.camelCase(n)  // foo bar => fooBar
  const typeObj = {type: cName}
  actions[cName] = cName
  actions[fName] = (...args) => {
    return Object.assign({}, typeObj, cb(...args))
  }
}

export default createAction