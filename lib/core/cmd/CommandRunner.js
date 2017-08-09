import Babel from 'babel-standalone'

import {RE_IDENT, reFindAll} from '../RegExp'

const RE_REQUIRE = /\brequire\('(.*?)'\)/g

const ma = (pattern, cb) => {  // matcher
  const re = new RegExp(
    '^' + pattern.map(p => ({
      // patterns with at least 2 chars produce a match group
      '++': '(.+)',
      '**': '(.*)',
      'id': '(' + RE_IDENT.source + ')',
      '.': '\\.',
      ' ': '\\s+',
      '': '\\s*',
    }[p] || p)).join('') + '$'
  )

  return (text, ctx) => {
    const match = text.match(re)

    if (match !== null) {
      text = cb(match, ctx)
    }

    return text
  }
}

const matchers = [
  ma(['**', '', '.', ''], (m, ctx) => {
    ctx.mutableOptions.keepCommand = true
    return m[1]
  }),
  ma(['!', '**'], (m, ctx) => {
    ctx.printCompiledCode = true
    return m[1]
  }),
  ma(['', '=', '', '**'], (m, ctx) => {
    ctx.useConsoleLog = true
    return m[1]
  }),
  ma(['', 'id', '', '=', '', '++'], m => `scope.set('${m[1]}', ${m[2]})`),
  ma(['', 'delete', ' ', 'id', ''], m => `scope.delete('${m[1]}')`),
  ma(['', 'import', ' ', 'id', ''], m => `scope.import('${m[1]}')`),
]

export default class CommandRunner {
  constructor(scope) {
    this.scope = scope
  }

  _run_preCompile = async (text, ctx) => {
    matchers.forEach(m => text = m(text, ctx))

    if (ctx.useConsoleLog) {
      text = `
        return Promise.resolve()
          .then(async () => (${text}))
          .then(r => console.log(r))
      `
    } else {
      text = `
        return (async () => {
          ${text}
        })()
      `
    }

    return text
  }

  _run_compile = async (text) => {
    text = Babel.transform(text, {
      parserOpts: {
        allowReturnOutsideFunction: true,
      },
      generatorOpts: {
        quotes: 'single',
      },
      presets: [
        'es2017',
        'es2016',
        'es2015',
        'react',
      ],
      plugins: [
        'transform-runtime',
      ]}
    ).code
    return text
  }

  _run_prepareRequire = async (text, ctx) => {
    let modulesNames = []
    modulesNames = modulesNames.concat(reFindAll(RE_REQUIRE, text))

    const modules = await Promise.all(modulesNames.map(m => System.import(m)))
    const mappedModules = {}
    modulesNames.forEach((n, i) => {
      mappedModules[n] = modules[i]
    })

    ctx.require = (n) => mappedModules[n]

    return text
  }

  _run_execute = async (text, ctx) => {
    // const entries = this.scope.entries().set('require', CONTEXT_REQUIRE)
    const entries = this.scope.entries().set('require', ctx.require)
    const fn = new Function(...entries.keys(), text)
    return await fn.apply(undefined, entries.toArray())
  }

  run = async (text, mutableOptions) => {
    const ctx = {
      mutableOptions: mutableOptions,
      printCompiledCode: false,
      useConsoleLog: false,
    }

    text = await this._run_preCompile(text, ctx)
    text = await this._run_compile(text)
    text = await this._run_prepareRequire(text, ctx)
    if (ctx.printCompiledCode) {
      return console.log(text, ctx)
    } else {
      return await this._run_execute(text, ctx)
    }
  }
}