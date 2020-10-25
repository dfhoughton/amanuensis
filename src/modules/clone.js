/*
Some utility functions for cloning state and diffing state
*/

// make a deep copy of an object, possibly nullifying certain object keys at whatever depth they might appear
// note the only non-simple object expected is Dates
export function deepClone(obj, ...except) {
    let rv
    switch (typeof obj) {
        case 'array':
            rv = []
            for (const v of obj) {
                rv.push(deepClone(v, ...except))
            }
            return rv
        case 'object':
            if (obj == null) {
                return null
            }
            if (obj.getTime) {
                return new Date(obj.getTime())
            } else {
                rv = {}
                for (const [k, v] of Object.entries(obj)) {
                    // keep the key but not the value
                    const clone = except.indexOf(k) === -1 ? null : deepClone(v, ...except)
                    rv[k] = clone
                }
                return rv
            }
        default:
            rv = obj
            return rv
    }
}

// to find whether there has been any change since the last save, possibly ignoring certain object keys at whatever depth they might appear
// note the only non-simple object expected is Dates
export function anyDifference(obj1, obj2, ...except) {
    if (typeof obj1 !== typeof obj2) {
        return true
    }
    switch (typeof obj1) {
        case 'array':
            if (obj1.length !== obj2.length) {
                return true
            }
            for (let i = 0; i < obj1.length; i++) {
                if (anyDifference(obj1[i], obj2[i], ...except)) {
                    return true
                }
            }
            return false
        case 'object':
            if (obj1 == null ^ obj2 == null) {
                return true
            }
            if (obj1 == null) {
                return false
            }
            if (obj1.getTime ^ obj2.getTime) {
                return true
            }
            if (obj1.getTime) {
                return obj1.getTime() === obj2.getTime()
            }
            if (Object.keys(obj1).length !== Object.keys(obj2).length) {
                return true
            }
            for (const [k, v] of Object.entries(obj1)) {
                if (except.indexOf(k) === -1) {
                    if (anyDifference(v, obj2[k], ...except)) {
                        return true
                    }
                }
            }
            return false
        default:
            return obj1 === obj2
    }
}
