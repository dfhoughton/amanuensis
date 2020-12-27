import { deepClone } from './clone'
import { Chrome, KeyPair, NoteRecord, RealmInfo, RealmIdentifier, Normalizer } from './types'

// utility function to convert maps into arrays for permanent storage
function m2a(map: Map<any, any>): [any, any][] {
    const ar: [any, any][] = []
    map.forEach((v, k) => ar.push([k, v]))
    return ar
}

type FindResponse =
    { state: "found", realm: number, record: NoteRecord } |
    { state: "ambiguous", realms: number[] } |
    { state: "none" }

// an interface between the app and the Chrome storage mechanism
export class Index {
    chrome: Chrome                                 // the chrome API
    realms: Map<string, RealmInfo>                 // an index from realm names to RealmInfo records
    index: Map<string, number[]>                   // an index from normalized phrases to the primary keys of realms in which there are records for these phrases
    realmIndices: Map<number, Map<string, number>> // an index from realm primary keys to indices from phrases normalized by the respective realm's normalizer to that phrase's primary key for the realm
    tags: Set<string>                              // the set of all tags used in a phrase in any realm
    reverseRealmIndex: Map<number, string>         // an index from RealmInfo primary keys to names
    cache: Map<KeyPair, NoteRecord>                // a mechanism to avoid unnecessary calls to fetch things from chrome storage
    constructor(chrome: Chrome, realms: Map<string, RealmInfo>, index: Map<string, number[]>, realmIndices: Map<number, Map<string, number>>, tags: Set<string>) {
        this.chrome = chrome
        this.realms = realms
        this.index = index
        this.realmIndices = realmIndices
        this.tags = tags
        if (this.realmIndices.size === 0) {
            // add the default realm
            const realm: RealmInfo = { pk: 0, description: 'default', normalizer: "", relations: [["see also", "see also"]] }
            this.realms.set('', realm)
            this.realmIndices.set(0, new Map())
            const storable = { realms: m2a(this.realms) }
            this.chrome.storage.local.set(storable)
        }
        this.reverseRealmIndex = new Map()
        this.realms.forEach((value, key) => this.reverseRealmIndex.set(value.pk, key))
        this.cache = new Map()
    }

    // return the set of relations known to the realm
    relationsForRealm(realm: RealmIdentifier): Set<string> {
        const [, realmInfo]: [string, RealmInfo] = this.findRealm(realm)
        const relations: Set<string> = new Set()
        for (const pair in realmInfo.relations) {
            relations.add(pair[0])
            relations.add(pair[1])
        }
        return relations
    }

    // returns the other relation in a relation pair, e.g., "part" for "whole", "subtype" for "supertype", or "synonym" for "synonym"
    // the last is an example of a symmetric relation; the "see also" relation, the only relation available by default, is symmetric
    reverseRelation(realm: RealmIdentifier, relation: string): string | null {
        const [, realmInfo] = this.findRealm(realm)
        for (const pair in realmInfo.relations) {
            if (pair[0] === relation) {
                return pair[1]
            }
            if (pair[1] === relation) {
                return pair[0]
            }
        }
        return null
    }

    // looks in given realm for phrase, resolving it in promise as {realm, found}
    // if no realm is given and the phrase exists only in one realm, also provides {realm, found}
    // if no realm is given and the phrase exists in multiple realms, provides [realm...]
    find(phrase: string, realm: RealmIdentifier): Promise<FindResponse> {
        return new Promise((resolve, reject) => {
            let key: string | null, realmInfo: RealmInfo, found: NoteRecord | null
            if (realm) {
                [, realmInfo] = this.findRealm(realm)
                const index = this.realmIndex(phrase, realmInfo)
                if (index == null) {
                    return resolve({ state: "none" })
                }
                found = this.cache.get([realmInfo.pk, index as number]) || null
                if (found) {
                    resolve({ state: "found", realm: realmInfo.pk, record: found })
                } else {
                    key = this.key(phrase, realm)
                    if (!key) {
                        resolve({ state: "none" })
                    } else {
                        this.chrome.storage.local.get([key], (found) => {
                            if (this.chrome.runtime.lastError) {
                                reject(this.chrome.runtime.lastError)
                            } else {
                                const record = found[key as string]
                                this.cache.set([realmInfo.pk, index], record)
                                resolve({ state: "found", realm: realmInfo.pk, record })
                            }
                        })
                    }
                }
            } else {
                const realms = this.index.get(this.defaultNormalize(phrase))
                if (realms) {
                    if (realms.length === 1) {
                        [, realmInfo] = this.findRealm(realms[0])
                        const key = this.key(phrase, realmInfo) as string
                        this.chrome.storage.local.get([key], (found) => {
                            if (this.chrome.runtime.lastError) {
                                reject(this.chrome.runtime.lastError)
                            } else {
                                const index = this.realmIndex(phrase, realmInfo)
                                const record = found[key]
                                this.cache.set([realmInfo.pk, index as number], record)
                                resolve({ state: "found", realm: realmInfo.pk, record })
                            }
                        })
                    } else {
                        resolve({ state: "ambiguous", realms: realms })
                    }
                } else {
                    resolve({ state: "none" })
                }
            }
        })
    }

    // save a phrase, all the data associated with the phrase should be packed into data
    add({ phrase, realm, data }: { phrase: string, realm: number, data: NoteRecord }): Promise<void> {
        return new Promise((resolve, reject) => {
            const storable: { [key: string]: any } = {}
            const [, realmInfo] = this.findRealm(realm)
            let key = this.defaultNormalize(phrase)
            const realms = this.index.get(key) || []
            if (realms.indexOf(realmInfo.pk) === -1) {
                realms.push(realmInfo.pk)
                storable.realms = m2a(this.realms)
                this.index.set(key, realms)
                storable.index = m2a(this.index)
            }
            key = this.normalize(phrase, realmInfo)
            let realmIndex = this.realmIndices.get(realmInfo.pk) || new Map()
            let pk = realmIndex.get(key)
            if (pk == null) {
                // this is necessarily in neither the index nor the realm index
                // we will have to generate a primary key for this phrase and store both indices
                pk = 0
                realmIndex.forEach(function (v, k) {
                    if (v >= pk) {
                        pk = v + 1
                    }
                })
                realmIndex.set(key, pk)
                storable[realmInfo.pk.toString()] = m2a(realmIndex)
            }
            const keyPair: KeyPair = [realmInfo.pk, pk] // convert key to the 
            this.cache.set(keyPair, data)
            // check for any new tags
            const l = this.tags.size
            for (const tag of data.tags) {
                this.tags.add(tag)
            }
            if (this.tags.size > l) {
                const tags: string[] = []
                for (const tag of this.tags) {
                    tags.push(tag)
                }
                storable.tags = tags
            }
            // modify any phrases newly tied to this by a relation
            // NOTE any relation *deleted* in editing will need to be handled separately
            for (const [relation, pairs] of Object.entries(data.relations)) {
                let reversedRelation: string = ''
                for (const pair of pairs) {
                    const other = this.cache.get(pair)
                    if (other) {
                        // other will necessarily be cached if a relation to it was added
                        reversedRelation ||= this.reverseRelation(realmInfo, relation) || ''
                        outer: for (const [relation2, pairs2] of Object.entries(other.relations)) {
                            if (relation2 === reversedRelation) {
                                for (const key2 of pairs2) {
                                    if (key2[0] === keyPair[0] && key2[1] === keyPair[1]) {
                                        break outer
                                    }
                                }
                                // this is a new relation for other, so we'll need to store other
                                pairs2.push(keyPair)
                                storable[`${pair[0]}:${pair[1]}`] = other
                                break // we found the reversed relation, so we're done with this pair/relation
                            }
                        }
                    }
                }
            }
            // store the phrase itself
            storable[`${keyPair[0]}:${keyPair[1]}`] = data
            this.chrome.storage.local.set(storable, () => {
                if (this.chrome.runtime.lastError) {
                    reject(this.chrome.runtime.lastError)
                } else {
                    resolve()
                }
            })
        })
    }

    delete({ phrase, realm }: { phrase: string, realm: RealmInfo }): Promise<void> {
        return new Promise((resolve, reject) => {
            // TODO
            // must delete given phrase from the given realm
            // must delete it from the realm index
            // must delete it from all the phrases to which it is related
            // then must also iterate over *all* the phrases in the realm to see if any share its default normalization
            // if so, the master index need not be altered and saved
            // otherwise, we must delete its entry from the master index as well
        })
    }

    // delete a particular relation between two phrases
    // these two phrases will necessarily both already be saved
    deleteRelation({ phrase, realm, relation, pair }: { phrase: string, realm: RealmInfo, relation: string, pair: KeyPair }): Promise<void> {
        return new Promise((resolve, reject) => {
            const [realmName, realmInfo] = this.findRealm(realm)
            let key = this.normalize(phrase, realmInfo)
            const realmIndex = this.realmIndices.get(realmInfo.pk)
            let pk = realmIndex?.get(key)
            if (pk == null) {
                reject(`the phrase ${phrase} is not stored in ${realmName}`)
            } else {
                let keyPair: KeyPair = [realmInfo.pk, pk]
                const data = this.cache.get(keyPair) // the phrase in question is necessarily cached
                if (data) {
                    const continuation = (other: NoteRecord) => {
                        // prepare other end of relation for storage
                        const reversedRelation = this.reverseRelation(realmInfo, relation)
                        if (reversedRelation) {
                            const storable: { [key: string]: any } = {}
                            storable[`${pair[0]}:${pair[1]}`] = other
                            // remove other end of relation from other's relations
                            let pairs2 = other.relations[reversedRelation] || []
                            const pairs22: KeyPair[] = []
                            for (const [r2, pk2] of pairs2) {
                                if (!(r2 === realmInfo.pk && pk2 === pk)) {
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
                            let pairs: KeyPair[] = data2.relations[relation] || []
                            pairs2 = []
                            for (const [r2, pk2] of pairs) {
                                if (!(r2 === pair[0] && pk2 === pair[1])) {
                                    pairs2.push([r2, pk2])
                                }
                            }
                            if (pairs2.length) {
                                data2.relations[relation] = pairs2
                            } else {
                                delete data2.relations[relation]
                            }
                            this.chrome.storage.local.set(storable, () => {
                                if (this.chrome.runtime.lastError) {
                                    reject(this.chrome.runtime.lastError)
                                } else {
                                    resolve()
                                }
                            })
                        } else {
                            reject(`could not find the reversed relation for ${relation} in ${realmName}`)
                        }
                    }
                    let other = this.cache.get(pair)
                    if (other) {
                        continuation(other)
                    } else {
                        this.chrome.storage.local.get([`${pair[0]}:${pair[1]}`], (found) => {
                            if (this.chrome.runtime.lastError) {
                                reject(this.chrome.runtime.lastError)
                            } else {
                                this.cache.set(pair, found)
                                continuation(found)
                            }
                        })
                    }
                } else {
                    reject("the phrase was not cached; this should be unreachable code")
                }
            }
        })
    }

    // how much memory do we have left?
    // useful for warning the user
    // success value of promise will be the number of bytes remaining
    memfree(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.chrome.storage.local.getBytesInUse(null, (bytes: number) => {
                if (this.chrome.runtime.lastError) {
                    reject(this.chrome.runtime.lastError)
                } else {
                    resolve(5242880 - bytes)
                }
            })
        })
    }
    // convert a realm in any representation, name, index, or info, into a [name, info] pair
    findRealm(realm: string | number | RealmInfo): [string, RealmInfo] {
        let realmInfo: RealmInfo
        switch (typeof realm) {
            case 'number':
                const r = this.reverseRealmIndex.get(realm)
                if (r) {
                    realm = r
                    const ri = this.realms.get(realm)
                    if (ri) {
                        return [r, ri]
                    } else {
                        return this.defaultRealm()
                    }
                } else {
                    return this.defaultRealm()
                }
            case 'string':
                const ri = this.realms.get(realm)
                if (ri) {
                    return [realm.toString(), ri]
                } else {
                    return this.defaultRealm()
                }
            case 'object':
                if (realm) {
                    realmInfo = realm
                    const r = this.reverseRealmIndex.get(realm.pk)
                    if (r) {
                        return [r, realmInfo]
                    } else {
                        return this.defaultRealm()
                    }
                } else {
                    return this.defaultRealm()
                }
            default:
                throw new Error("unreachable")
        }
    }
    defaultRealm(): [string, RealmInfo] {
        return ['', this.realms.get('') as RealmInfo]
    }
    // save a realm or create a new one
    // the optional callback receives an error message, if any
    saveRealm(
        {
            name,
            description = '[no description]',
            normalizer = '',
            relations = [["see also", "see also"]],
        }:
            {
                name: string,
                description: string,
                normalizer: string,
                relations: [string, string][],
            }
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            // whitespace normalization
            name = name.replace(/^\s+|\s+$/g, '').replace(/\s+/, ' ')
            description = description.replace(/^\s+|\s+$/g, '').replace(/\s+/, ' ')
            let pk: number
            const storable: { [key: string]: any } = {}
            if (this.realms.has(name)) {
                pk = (this.realms.get(name) as RealmInfo).pk
            } else {
                pk = 1
                for (const [, realmInfo] of this.realms) {
                    if (realmInfo.pk >= pk) {
                        pk = realmInfo.pk + 1
                    }
                }
                this.realmIndices.set(pk, new Map())
                this.reverseRealmIndex.set(pk, name)
                storable[pk.toString()] = []
            }
            const realm: RealmInfo = { pk, description, normalizer, relations }
            this.realms.set(name, realm)
            storable.realms = m2a(this.realms)
            this.chrome.storage.local.set(storable, () => {
                if (this.chrome.runtime.lastError) {
                    reject(this.chrome.runtime.lastError)
                } else {
                    resolve()
                }
            })
        })
    }
    removeRealm(realm: RealmIdentifier): Promise<void> {
        return new Promise((resolve, reject) => {
            // const [, realmInfo] = this.findRealm(realm)
            // const delenda = []
            // const memoranda = []
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
        })
    }
    // create the key a phrase should be stored under for a given realm
    key(phrase: string, realm: RealmIdentifier): string | null {
        const [, realmInfo] = this.findRealm(realm)
        const index = this.realmIndex(phrase, realmInfo)
        if (index != null) {
            return `${realmInfo.pk}:${index}`
        }
        return null
    }
    realmIndex(phrase: string, realm: string | number | RealmInfo): number | null {
        const [, realmInfo] = this.findRealm(realm)
        const idx = this.realmIndices.get(realmInfo.pk) as Map<string, number>
        const i = idx.get(this.normalize(phrase, realmInfo))
        if (i == null) {
            return null
        } else {
            return i
        }
    }
    // normalize phrase for use in retrieval and insertion
    normalize(phrase: string, realm: string | number | RealmInfo): string {
        let r: RealmInfo
        if (typeof realm === 'object') {
            r = realm
        } else {
            [realm, r] = this.findRealm(realm)
        }
        const normalizer = r ? r.normalizer : ""
        return normalizers[normalizer || ""].code(phrase)
    }
    defaultNormalize(phrase: string): string {
        return normalizers[""].code(phrase)
    }
    // clears *everything* from local storage; if promise fails error message is provided
    clear(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.chrome.storage.local.clear(() => {
                if (this.chrome.runtime.lastError) {
                    reject(this.chrome.runtime.lastError)
                } else {
                    this.cache.clear()
                    this.index.clear()
                    this.realmIndices.clear()
                    this.realms.clear()
                    this.reverseRealmIndex.clear()
                    this.tags.clear()
                    // restore the default realm
                    const realm: RealmInfo = { pk: 0, description: 'default', normalizer: "", relations: [["see also", "see also"]] }
                    this.realms.set('', realm)
                    this.realmIndices.set(0, new Map())
                    const storable = { realms: m2a(this.realms) }
                    this.chrome.storage.local.set(storable) // if this fails no harm done
                    resolve()
                }
            })
        })
    }
}

// get an API to handle all storage needs
export function getIndex(chrome: Chrome): Promise<Index> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['realms', 'index', 'tags'], (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
            } else {
                let { realms = [], index = [], tags = [] } = result || {}
                // now that we have the realm we can fetch the realm indices
                const indices: string[] = []
                for (const [, realmInfo] of realms) {
                    indices.push(realmInfo.pk.toString())
                }
                chrome.storage.local.get(indices, (result: { [realmPk: string]: [phrase: string, pk: number][] }) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError)
                    } else {
                        const realmIndices = new Map()
                        for (const [idx, ridx] of Object.entries(result)) {
                            realmIndices.set(Number.parseInt(idx), new Map(ridx))
                        }
                        resolve(new Index(chrome, new Map(realms), new Map(index), realmIndices, new Set(tags)))
                    }
                })
            }
        })
    })
}

function stripDiacrics(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, "")
}

// a collection of string normalization functions with metadata for use in display
const normalizers: { [key: string]: Normalizer } = {
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