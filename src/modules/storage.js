import { deepClone } from './clone'

// utility function to convert maps into arrays for permanent storage
function m2a(map) {
    const ar = []
    map.forEach((v, k) => ar.push([k, v]))
    return ar
}

class Index {
    constructor(chrome, realms, index, realmIndices, tags) {
        this.chrome = chrome             // the chrome extension API
        this.realms = realms             // a map from namespaces to objects containing namespace properties
        this.index = index               // a map from phrases under default normalization to their realms
        this.realmIndices = realmIndices // a map from phrases normalized for the realm to numeric indices
        this.tags = tags                 // the set of all tags ever used
        if (this.realmIndices.size === 0) {
            // add the default realm
            this.realms.set('', { index: 0, description: 'default', normalizer: "", relations: ["see also", "see also"] })
            this.realmIndices.set(0, new Map())
        }
        this.reverseRealmIndex = new Map()
        this.realms.forEach((value, key) => this.reverseRealmIndex.set(value.pk, key))
        this.cache = new Map()
    }

    // return the set of relations known to the realm
    relationsForRealm(realm) {
        const [, realmInfo] = this.findRealm(realm), relations = new Set()
        for (const [a, b] in realmInfo.relations) {
            relations.add(a)
            relations.add(b)
        }
        return relations
    }

    // returns the other relation in a relation pair, e.g., "part" for "whole", "subtype" for "supertype", or "synonym" for "synonym"
    // the last is an example of a symmetric relation; the "see also" relation, the only relation available by default, is symmetric
    reverseRelation(realm, relation) {
        const [, realmInfo] = this.findRealm(realm)
        for (const [a, b] in realmInfo.relations) {
            if (a === relation) {
                return b
            }
            if (b === relation) {
                return a
            }
        }
        return null
    }

    // looks in given realm for phrase, providing it to callback as {realm, found}
    // if no realm is given and the phrase exists only in one realm, also provides {realm, found}
    // if no realm is given and the phrase exists in multiple realms, provides [realm...]
    // if there is an error this is returned as {error}
    find(phrase, realm, callback) {
        let key, realmInfo, found
        if (realm) {
            [realm, realmInfo] = this.findRealm(realm)
            const index = this.realmIndex(phrase, realmInfo)
            found = this.cache.get([realmInfo.pk, index])
            if (found) {
                callback({ realm, found })
            } else {
                key = this.key(phrase, realm)
                if (!key) {
                    callback({ realm: null, found: null })
                } else {
                    this.chrome.storage.local.get(key, function (found) {
                        if (this.chrome.runtime.lastError) {
                            callback({ error: this.chrome.runtime.lastError })
                        } else {
                            this.cache.set([realmInfo.pk, index], found)
                            callback({ realm, found })
                        }
                    })
                }
            }
        } else {
            const realms = this.index[this.defaultNormalize(phrase)]
            if (realms) {
                if (realms.length === 1) {
                    [realm, realmInfo] = this.findRealm(realms[0])
                    this.chrome.storage.local.get(this.key(phrase, realmInfo), function (found) {
                        if (this.chrome.runtime.lastError) {
                            callback({ error: this.chrome.runtime.lastError })
                        } else {
                            const index = this.realmIndex(phrase, realmInfo)
                            this.cache.set([realmInfo.pk, index], found)
                            callback({ realm, found })
                        }
                    })
                } else {
                    callback(realms) // user will have to disambiguate
                }
            } else {
                callback({ realm: null, found: null })
            }
        }
    }

    // save a phrase, all the data associated with the phrase should be packed into data
    add({ phrase, data, callback }) {
        const storable = {}
        const [, realmInfo] = this.findRealm(data.realm)
        let key = this.normalize(phrase, realmInfo)
        let realmIndex = this.realmIndices.get(realmInfo.pk)
        let pk = realmIndex[key]
        if (pk == null) {
            // this is necessarily in neither the index nor the realm index
            // we will have to generate a primary key for this phrase and store both indices
            pk = 0
            realmIndex.forEach(function (v, k) {
                if (v >= pk) {
                    pk = v + 1
                }
            })
            realmIndex[key] = pk
            storable[realmInfo.pk.toString()] = m2a(realmIndex)
            key = this.defaultNormalize(phrase)
            let realms = this.index[key] || []
            realms.push(realmInfo.pk)
            storable.index = m2a(this.index)
        }
        key = [realmInfo.pk, pk] // convert key to the 
        this.cache.set(key, data)
        // check for any new tags
        const l = this.tags.size
        for (const tag in data.tags) {
            this.tags.add(tag)
        }
        if (this.tags.size > l) {
            const tags = []
            for (const tag in this.tags) {
                tags.push(tag)
            }
            storable.tags = tags
        }
        // modify any phrases newly tied to this by a relation
        // NOTE any relation *deleted* in editing will need to be handled separately
        for (const [relation, pairs] of data.relations) {
            let reversedRelation,
            for (const pair in pairs) {
                const other = this.cache.get(pair)
                if (other) {
                    // other will necessarily be cached if a relation to it was added
                    reversedRelation ||= this.reverseRelation(realmInfo, relation)
                    outer: for (const [relation2, pairs2] in other.relations) {
                        if (relation2 === reversedRelation) {
                            for (const key2 in pairs2) {
                                if (key2[0] === key[0] && key2[1] === key[1]) {
                                    break outer
                                }
                            }
                            // this is a new relation for other, so we'll need to store other
                            pairs2.push(key)
                            storable[`${pair[0]}:${pair[1]}`] = other
                            break // we found the reversed relation, so we're done with this pair/relation
                        }
                    }
                }
            }
        }
        // store the phrase itself
        storable[`${key[0]}:${key[1]}`] = data
        callback ||= function (msg) { msg && console.error(msg) }
        this.chrome.storage.local.set(storable, function () { callback(this.chrome.runtime.lastError) })
    }

    delete({ phrase, realm }) {
        // TODO
        // must delete given phrase from the given realm
        // must delete it from the realm index
        // must delete it from all the phrases to which it is related
        // then must also iterate over *all* the phrases in the realm to see if any share its default normalization
        // if so, the master index need not be altered and saved
        // otherwise, we must delete its entry from the master index as well
    }

    // delete a particular relation between two phrases
    // these two phrases will necessarily both already be saved
    // the optional callback is to handle errors, if any
    deleteRelation({ phrase, realm, relation, pair, callback }) {
        callback ||= function (msg) { msg && console.error(msg) }
        const [, realmInfo] = this.findRealm(realm)
        let key = this.normalize(phrase, realmInfo)
        const realmIndex = this.realmIndices.get(realmInfo.pk)
        let pk = realmIndex[key]
        key = [realmInfo.pk, pk]
        data = this.cache.get(key) // the phrase in question is necessarily cached
        const continuation = (other) => {
            // prepare other end of relation for storage
            const reversedRelation = this.reverseRelation(realmInfo, relation), storable = {}
            storable[`${pair[0]}:${pair[1]}`] = other
            // remove other end of relation from other's relations
            let pairs2 = other.relations[reversedRelation] || []
            const pairs22 = []
            for (const [r2, pk2] in pairs2) {
                if (!(r2 === key[0] && pk2 === key[1])) {
                    pairs22.push([r2, pk2])
                }
            }
            if (pairs22.length) {
                other.relations[reversedRelation] = pairs22
            } else {
                delete other.relations[reversedRelation]
            }
            // remove near end of relation from data's relations
            const data2 = deepClone(data) // don't modify the original so React can use if for diffing
            storable[`${key[0]}:${key[1]}`] = data2
            let pairs = data2.relations[relation] || []
            pairs2 = []
            for (const [r2, pk2] in pairs) {
                if (!(r2 === pair[0] && pk2 === pair[1])) {
                    pairs2.push([r2, pk2])
                }
            }
            if (pairs2.length) {
                data2.relations[relation] = pairs2
            } else {
                delete data2.relations[relation]
            }
            this.chrome.storage.local.set(storable, function () { callback(this.chrome.runtime.lastError) })
        }
        let other = this.cache.get(pair)
        if (other) {
            continuation(other)
        } else {
            this.chrome.storage.local.get(`${pair[0]}:${pair[1]}`, function (found) {
                if (this.chrome.runtime.lastError) {
                    callback({ error: this.chrome.runtime.lastError })
                } else {
                    this.cache.set(pair, found)
                    continuation(other)
                }
            })
        }
    }

    // how much memory do we have left?
    // useful for warning the user
    // the callback should receive one parameter
    // if it is a string this is an error message, otherwise it will be the number of bytes remaining
    memfree(callback) {
        this.chrome.storage.local.getBytesInUse(null, function (bytes) {
            if (this.chrome.runtime.lastError) {
                callback(this.chrome.runtime.lastError)
            } else {
                callback(5242880 - bytes)
            }
        })
    }
    // convert a realm in any representation, name, index, or info, into a [name, info] pair
    findRealm(realm) {
        let realmInfo
        switch (typeof realm) {
            case 'string':
                realmInfo = this.realms.get(realm)
                break
            case 'object':
                // test for null
                if (realm) {
                    realmInfo = realm
                    realm = this.reverseRealmIndex.get(realm.pk)
                }
                break
            case 'number':
                realm = this.reverseRealmIndex.get(realm)
                realmInfo = this.realms.get(realm)
                break
            default:
                throw "unreachable"
        }
        if (realmInfo) {
            return [realm, realmInfo]
        } else {
            // default realm
            return ['', this.realms.get('')]
        }
    }
    // save a realm or create a new one
    // the optional callback receives an error message, if any
    saveRealm({ name, description, normalizer, relations, callback }) {
        name = name.replace(/^\s+|\s+$/g, '').replace(/\s+/, ' ')
        description ||= '[no description]'
        description = description.replace(/^\s+|\s+$/g, '').replace(/\s+/, ' ')
        normalizer ||= ''
        relations  ||= [["see also", "see also"]]
        callback   ||= function (msg) { msg && console.error(msg) }
        let pk
        const storable = {}
        if (this.realms.has(name)) {
            pk = this.realms.get(name).pk
        } else {
            pk = 1
            for (let [, realmInfo] in Object.entries(this.realms)) {
                if (realmInfo.pk >= pk) {
                    pk = realmInfo.pk + 1
                }
            }
            this.realmIndices.set(pk, new Map())
            this.reverseRealmIndex.set(pk, name)
            storable[pk.toString()] = []
        }
        realm = { pk, description, normalizer, relations }
        this.realms[name] = realm
        storable.realms = m2a(this.realms)
        this.chrome.storage.local.set(storable, function () { callback(this.chrome.runtime.lastError) })
    }
    removeRealm(realm) {
        [realm, realmInfo] = this.findRealm(realm)
        const delenda = []
        const memoranda = []
        // TODO
        // iterate over all phrases in realm via realm index
        // for each phrase in realm, iterate over relations, adding relations with other realms to memoranda, adding key for phrase to delenda
        // THE ONLY RELATION POSSIBLE BETWEEN REALMS IS "see also"
        // remove realm from realms and reverse lookup; save realms
        // remove realm index
        // iterate over index, removing realm from values and deleting values as necessary
        // save index
        // remove delenda
        // iterate over memoranda, deleting cross-realm realtions and saving
        // callback
    }
    // create the key a phrase should be stored under for a given realm
    key(phrase, realm) {
        const [realm, realmInfo] = this.findRealm(realm)
        const index = this.realmIndex(phrase, realmInfo)
        if (index != null) {
            return `${realmInfo.pk}:${index}`
        }
    }
    realmIndex(phrase, realm) {
        const [realm, realmInfo] = this.findRealm(realm)
        return this.realmIndices.get(realmInfo.pk).get(this.normalize(phrase, realmInfo))
    }
    // normalize phrase for use in retrieval and insertion
    normalize(phrase, realm) {
        let r
        if (typeof realm === 'object') {
            r = realm
        } else {
            [realm, r] = this.findRealm(realm)
        }
        const normalizer = r ? r.normalizer : ""
        return normalizers[normalizer || ""].code(phrase)
    }
    defaultNormalize(phrase) {
        return normalizers[""].code(phrase)
    }
}

export default function getIndex(chrome, callback) {
    chrome.storage.local.get(['realms', 'index', 'tags'], function (result) {
        if (chrome.runtime.lastError) {
            callback(chrome.runtime.lastError)
        } else {
            let { realms, index, tags } = result || {}
            realms ||= []
            index ||= []
            tags ||= []
            // now that we have the realm we can fetch the realm indices
            const indices = []
            for (let [, realmInfo] in realms) {
                indices.push(realmInfo.pk.toString())
            }
            chrome.storage.local.get(indices, function (result) {
                if (chrome.runtime.lastError) {
                    callback(chrome.runtime.lastError)
                } else {
                    realmIndices = new Map()
                    for (const [idx, ridx] of Object.entries(result)) {
                        realmIndices.set(Number.parseInt(idx), new Map(ridx))
                    }
                    callback(new Index(new Map(realms), new Map(index), realmIndices, new Set(tags)))
                }
            })
        }
    })
}

function stripDiacrics(s) {
    return s.normalize('NFD').replace( /[\u0300-\u036f]/g, "")
}

// a collection of string normalization functions with metadata for use in display
const normalizers = {
    "": {
        name: 'default', // by default the name of a normalizer will be its key
        description: `
            Strips marginal whitespace, replaces any internal spaces with a singe whitespace,
            strips diacritics, removes non-word ( a-z, 0-9, and _) characters, converts to lowercase.
        `,
        code: function (phrase) {
            return stripDiacrics(phrase.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ')).replace(/[^\p{L}\p{N} _'-]+/ug, '').toLowerCase()
        }
    },
}