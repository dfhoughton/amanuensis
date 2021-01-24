/*
Some utility functions for cloning state and diffing state
*/

// make a deep copy of an object, possibly nullifying certain object keys at whatever depth they might appear
// note the only non-simple object expected is Dates
// this is meant for cloning the sorts of things that can be stored in chrome.storage.local
export function deepClone(obj: any, ...except: string[]): any {
    if (typeof obj === 'object') {
        if (obj == null) {
            return null
        }
        if (obj.getTime) {
            return new Date(obj.getTime())
        } else if (Array.isArray(obj)) {
            const rv: any[] = obj.slice()
            for (let i = 0; i < rv.length; i++) {
                rv[i] = deepClone(rv[i], ...except)
            }
            return rv
        } else {
            const rv: { [key: string]: any } = {}
            for (const [k, v] of Object.entries(obj)) {
                if (except.indexOf(k) === -1) {
                    rv[k] = deepClone(v, ...except)
                }
            }
            return rv
        }
    } else {
        return obj
    }
}

// to find whether there has been any change since the last save, possibly ignoring certain object keys at whatever depth they might appear
// note the only non-simple object expected is Dates
// this is meant for comparing the sorts of things that can be stored in chrome.storage.local
export function anyDifference(obj1: any, obj2: any, ...except: string[]): boolean {
    if (Object.is(obj1, obj2)) {
        return false
    }
    const type1 = typeof obj1
    if (type1 !== typeof obj2) {
        return true
    }
    if (type1 === 'object') {
        if ((obj1 == null) !== (obj2 == null)) {
            return true
        }
        if (obj1 == null) {
            return false
        }
        if (obj1.getTime ^ obj2.getTime) {
            return true
        }
        if (obj1.getTime) {
            return obj1.getTime() !== obj2.getTime()
        }
        if (Array.isArray(obj1)) {
            if (obj1.length !== obj2.length) {
                return true
            }
            for (let i = 0; i < obj1.length; i++) {
                if (anyDifference(obj1[i], obj2[i], ...except)) {
                    return true
                }
            }
            return false
        }
        const entries1 = Object.entries(obj1)
        if (entries1.length !== Object.keys(obj2).length) {
            return true
        }
        for (const [k, v] of entries1) {
            if (except.indexOf(k) === -1) {
                if (anyDifference(v, obj2[k], ...except)) {
                    return true
                }
            }
        }
        return false
    } else { return obj1 !== obj2 }
}

