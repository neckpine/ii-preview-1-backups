// based on require-like (https://git.io/v5SXp)

const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const vm = require('vm')

const stripShebang = require('ii-strip-shebang')

function updateChildren(parent, child, scan) {
  const children = parent && parent.children
  if (children && !(scan && children.includes(child)))
    children.push(child)
}

const wrapper = [
  '(function (exports, require, module, __filename, __dirname) { ',
  '\n});',
]

const wrap = (content) => `${wrapper[0]}${content}${wrapper[1]}`

const loadJS = (sandbox, mod, modPath, modCache) => {
  const modCode = wrap(stripShebang(fs.readFileSync(modPath, 'utf-8')))
  const modCompiled = vm.runInContext(modCode, sandbox, {
    filename: modPath,
    displayErrors: true,
  })

  const modDir = path.dirname(modPath)

  result = modCompiled.call(mod.exports, mod.exports, mod.require,
    mod, modPath, modDir)

  return result
}

const tryLoad = (sandbox, mod, modPath, modCache) => {
  assert(!mod.loaded)

  let extension = path.extname(modPath) || '.js'
  if (!Module._extensions[extension]) extension = '.js'

  let result
  if (extension !== '.js') {
    result = Module._extensions[extension](mod, modPath)
  } else {
    result = loadJS(sandbox, mod, modPath, modCache)
  }

  mod.loaded = true
  return result
}

const loadModule = (sandbox, childPath, parentModule, modCache) => {
  childPath = Module._resolveFilename(childPath, parentModule)
  if (childPath.indexOf('/') < 0) {  // builtin
    return require(childPath)
  }
  const cachedChildModule = Module._cache[childPath]
  if (cachedChildModule) {
    updateChildren(parentModule, cachedChildModule, true)
    return cachedChildModule.exports
  }

  const childModule = createDeepRequire.createModule(childPath, parentModule)
  childModule.require = createDeepRequire(sandbox, childModule, modCache)
  Module._cache[childPath] = childModule
  let threw = true
  try {
    childModule.returnValue = tryLoad(sandbox, childModule, childPath, modCache)
    threw = false
  } finally {
    if (threw) delete Module._cache[childPath]
  }
  return childModule.exports
}

const createDeepRequire = module.exports = (sandbox, parentModule, modCache) => {
  sandbox = vm.createContext(sandbox)
  modCache = modCache || Module._cache

  const deepRequire = (childPath) => {
    const cache = Module._cache
    if (modCache) {
      Module._cache = modCache
    }

    const exports = loadModule(sandbox, childPath, parentModule, modCache)
    Module._cache = cache

    return exports
  }

  deepRequire.resolve = (request) =>
    Module._resolveFilename(request, parentModule)

  deepRequire.main = process.mainModule
  deepRequire.extensions = Module._extensions
  deepRequire.cache = modCache

  return deepRequire
}

createDeepRequire.createModule = (modPath, parentModule) => {
  const mod = new Module(modPath, parentModule)
  mod.filename = modPath
  mod.paths = Module._nodeModulePaths(path.dirname(modPath))
  return mod
}
