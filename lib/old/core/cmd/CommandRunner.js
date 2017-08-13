import Babel from 'babel-standalone'

import {RE_IDENT, reFindAll} from '../RegExp'

const RE_REQUIRE = /\brequire\('(.*?)'\)/g

const ma = (pattern, cb) => {  // matcher
  const re = new RegExp(
    '^' + pattern.map(p => ({
      // patterns with at least 2 chars produce a match group
      '++': '(.+)',
      '**': '(.*)',
      'ID': '(' + RE_IDENT.source + ')',
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

const globalMatchers = [
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
]

const stmtMatchers = [
  ma(['', 'set', ' ', 'ID', '', '=', '', '++'],
    m => `var ${m[1]} = scope.set('${m[1]}', ${m[2]})`),

  ma(['', 'delete', ' ', 'ID', ''],
    m => `scope.delete('${m[1]}')`),

  ma(['', 'hide', ' ', 'ID', ''],
    m => `scope.hide('${m[1]}')`),

  ma(['', 'import', ' ', 'ID', ''],
    m => `var ${m[1]} = await scope.import('${m[1]}')`),

  ma(['', 'show', ' ', 'ID', ''],
    m => `scope.show('${m[1]}')`),
]

const stmtMatchMap = (t, ctx) => stmtMatchers.reduce((t, m) => m(t, ctx), t)

export default class CommandRunner {
  constructor(scope) {
    this.scope = scope
  }

  _run_preCompile = async (text, ctx) => {
    globalMatchers.forEach(m => text = m(text, ctx))
    text = text.split(';').map(t => stmtMatchMap(t, ctx)).join(';')

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