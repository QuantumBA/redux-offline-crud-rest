const uuid = require('react-native-uuid')

const genActionTypes = require('./actionTypes')

// Join params with slashses
function composeUrl(...args) {
  let queryParams = ''
  const url = args.filter((item) => {
    if (item != null) {
      if(!item.startsWith('?')) {
        return item
      } else {
        queryParams = item
      }
    }
  }).join('/')
  return url.concat(queryParams)
}

function filterMethods([name, func]) {
  return name !== 'dispatch' && func instanceof Function
}

function reduceActions(acum, [key, func]) {
  return { ...acum, [key]: (...args) => this(func(...args)) }
}

function reduceFilteredMethods(acum, [key, func]) {
  return { ...acum, [key]: func }
}

function reduceNamespaces(acum, name) {
  return { ...acum, [name]: actions(name, this) }
}

function reduceNamespacesObject(acum, [name, options]) {
  if (typeof options !== 'object') options = { options }

  return reduceNamespaces.call({ ...this, ...options }, acum, name)
}

const removeLastChar = string => string.slice(0, -1)

function trim(string, char) {
  return string.replace(new RegExp(
    '^[' + char + ']+|[' + char + ']+$', 'g' // eslint-disable-line
  ), '')
}

function actions(basePath, options = {}) {
  if (Array.isArray(basePath)) {
    // basePath is an array, recursion
    return basePath.reduce(reduceNamespaces.bind(options), {})
  }

  if (typeof basePath !== 'string') {
    // basePath is an dictionary like object, recursion
    return Object.entries(basePath).reduce(reduceNamespacesObject.bind(options), {})
  }

  // basePath is a string
  if (basePath.endsWith('/')) basePath = removeLastChar(basePath)

  const { dispatch, headers } = options

  let baseUrl = options.baseUrl || ''
  if (baseUrl.endsWith('/')) baseUrl = removeLastChar(baseUrl)

  const actionTypes = genActionTypes(basePath)

  function reduceMethods(acum, [name, func]) {
    const actionType = `${basePath}#${name}`

    // eslint-disable-next-line
    return { ...acum, [name]: (id, body) => {
      const meta = { func, id }

      return {
        type: actionType,
        meta: {
          offline: {
            effect: {
              url: composeUrl(baseUrl, basePath, id, name),
              method: 'POST',
              body,
              headers,
            },
            commit: { type: `${actionType}_commit`, meta },
            rollback: { type: `${actionType}_rollback`, meta },
          },
        },
      }
    } }
  }

  // create object with CREATE, GET, PUT, PATCH, DELETE
  let result = {
    create(body, prefix) {
      const id = `tmp_id:${uuid.v4()}`
      if (prefix) prefix = trim(prefix, '/')

      return {
        type: actionTypes.create,
        payload: body,
        meta: {
          id,
          offline: {
            effect: {
              url: composeUrl(baseUrl, prefix, basePath),
              method: 'POST',
              body,
              headers,
            },
            commit: { type: actionTypes.create_commit, meta: { id } },
            rollback: { type: actionTypes.create_rollback, meta: { id } },
          },
        },
      }
    },

    read(id, ownId = undefined, prefix) {
      if (prefix) prefix = trim(prefix, '/')
      return {
        type: actionTypes.read,
        meta: {
          id: ownId || id,
          offline: {
            effect: {
              url: composeUrl(baseUrl, prefix, basePath, id),
              method: 'GET',
              headers,
            },
            commit: { type: actionTypes.read_commit, meta: { id: ownId || id } },
            rollback: { type: actionTypes.read_rollback, meta: { id: ownId || id } },
          },
        },
      }
    },
    
    readPagination(id, ownId = undefined, prefix, skip) {
      if (prefix) prefix = trim(prefix, '/')
      return {
        type: actionTypes.read_pagination,
        meta: {
          id: ownId || id,
          offline: {
            effect: {
              url: composeUrl(baseUrl, prefix, basePath, id, skip),
              method: 'GET',
              headers,
            },
            commit: { type: actionTypes.read_pagination_commit, meta: { id: ownId || id, skipParam: skip } },
            rollback: { type: actionTypes.read_pagination_rollback, meta: { id: ownId || id } },
          },
        },
      }
    },

    update(id, body, ownId = undefined, prefix) {
      if (prefix) prefix = trim(prefix, '/')

      return {
        type: actionTypes.update,
        payload: body,
        meta: {
          id: ownId || id,
          offline: {
            effect: {
              url: composeUrl(baseUrl, prefix, basePath, id),
              method: 'PUT',
              body,
              headers,
            },
            commit: { type: actionTypes.update_commit, meta: { id: ownId || id } },
            rollback: { type: actionTypes.update_rollback, meta: { id: ownId || id } },
          },
        },
      }
    },

    patch(id, body, prefix) {
      if (prefix) prefix = trim(prefix, '/')

      return {
        type: actionTypes.patch,
        payload: body,
        meta: {
          id,
          offline: {
            effect: {
              url: composeUrl(baseUrl, prefix, basePath, id),
              method: 'PATCH',
              body,
              headers: { ...headers, 'content-type': 'merge-patch+json' },
            },
            commit: { type: actionTypes.patch_commit, meta: { id } },
            rollback: { type: actionTypes.patch_rollback, meta: { id } },
          },
        },
      }
    },

    delete(id, prefix) {
      if (prefix) prefix = trim(prefix, '/')

      return {
        type: actionTypes.delete,
        meta: {
          id,
          offline: {
            effect: {
              url: composeUrl(baseUrl, prefix, basePath, id),
              method: 'DELETE',
              headers,
            },
            commit: { type: actionTypes.delete_commit, meta: { id } },
            rollback: { type: actionTypes.delete_rollback, meta: { id } },
          },
        },
      }
    },
  }

  // custom methods
  let { resourceMethods } = options
  if (!resourceMethods) {
    resourceMethods = Object.entries(options).filter(filterMethods)
      .reduce(reduceFilteredMethods, {})
  }

  // merge CRUD methods with custom ones
  result = Object.entries(resourceMethods).reduce(reduceMethods, result)

  if (!dispatch) return result

  return Object.entries(result).reduce(reduceActions.bind(dispatch), {})
}


module.exports = actions
