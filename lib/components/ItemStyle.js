import _ from 'lodash'
import React from 'react'

export default class ItemStyle extends React.Component {
  componentWillMount() {
    this.loadItem()
  }

  componentWillReceiveProps(nextProps) {
    this.loadItem()
  }

  async loadItem() {
    this.setState({style: null})
    const modulePath = `lib/items/${this.props.type}Style`
    const {styleCSS} = await SystemJS.import(modulePath)
    this.setState({style: styleCSS})
  }

  render() {
    return (
      <style>{this.state.style}</style>
    )
  }
}