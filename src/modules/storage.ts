import { deepClone } from './clone'
import { Chrome, KeyPair, NoteRecord, RealmInfo, RealmIdentifier, Normalizer } from './types'

// utility function to convert maps into arrays for permanent storage
function m2a(map: Map<any, any>): [any, any][] {
    const ar = []
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
            this.realms.set('', { pk: 0, description: 'default', normalizer: "", relations: [["see also", "see also"]] })
            this.realmIndices.set(0, new Map())
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
            let key: string, realmInfo: RealmInfo, found: NoteRecord
            if (realm) {
                [, realmInfo] = this.findRealm(realm)
                const index = this.realmIndex(phrase, realmInfo)
                found = this.cache.get([realmInfo.pk, index])
                if (found) {
                    resolve({ state: "found", realm: realmInfo.pk, record: found })
                } else {
                    key = this.key(phrase, realm)
                    if (!key) {
                        resolve({ state: "none" })
                    } else {
                        this.chrome.storage.local.get([key], function (found) {
                            if (this.chrome.runtime.lastError) {
                                reject(this.chrome.runtime.lastError)
                            } else {
                                this.cache.set([realmInfo.pk, index], found)
                                resolve({ state: "found", realm: realmInfo.pk, record: found })
                            }
                        })
                    }
                }
            } else {
                const realms = this.index[this.defaultNormalize(phrase)]
                if (realms) {
                    if (realms.length === 1) {
                        [, realmInfo] = this.findRealm(realms[0])
                        this.chrome.storage.local.get([this.key(phrase, realmInfo)], function (found) {
                            if (this.chrome.runtime.lastError) {
                                reject(this.chrome.runtime.lastError)
                            } else {
                                const index = this.realmIndex(phrase, realmInfo)
                                this.cache.set([realmInfo.pk, index], found)
                                resolve({ state: "found", realm: realmInfo.pk, record: found })
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
            const keyPair: KeyPair = [realmInfo.pk, pk] // convert key to the 
            this.cache.set(keyPair, data)
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
            for (const [relation, pairs] of Object.entries(data.relations)) {
                let reversedRelation: string
                for (const pair of pairs) {
                    const other = this.cache.get(pair)
                    if (other) {
                        // other will necessarily be cached if a relation to it was added
                        reversedRelation ||= this.reverseRelation(realmInfo, relation)
                        outer: for (const [relation2, pairs2] of Object.entries(other.relations)) {
                            if (relation2 === reversedRelation) {
                                for (const key2 in pairs2) {
                                    if (key2[0] === key[0] && key2[1] === key[1]) {
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
            storable[`${key[0]}:${key[1]}`] = data
            this.chrome.storage.local.set(storable, () => {
                if (this.chrome.runtime.lastError) {
                    reject(this.chrome.runtime.lastError)
                } else {
                    resolve()
                }
            })
        })
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
    deleteRelation({ phrase, realm, relation, pair }): Promise<void> {
        return new Promise((resolve, reject) => {
            const [, realmInfo] = this.findRealm(realm)
            let key = this.normalize(phrase, realmInfo)
            const realmIndex = this.realmIndices.get(realmInfo.pk)
            let pk = realmIndex[key]
            let keyPair: KeyPair = [realmInfo.pk, pk]
            const data = this.cache.get(keyPair) // the phrase in question is necessarily cached
            const continuation = (other: NoteRecord) => {
                // prepare other end of relation for storage
                const reversedRelation = this.reverseRelation(realmInfo, relation), storable = {}
                storable[`${pair[0]}:${pair[1]}`] = other
                // remove other end of relation from other's relations
                let pairs2 = other.relations[reversedRelation] || []
                const pairs22 = []
                for (const [r2, pk2] of pairs2) {
                    if (!(r2 === pk[0] && pk2 === pk[1])) {
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
                        continuation(other)
                    }
                })
            }
        })
    }

    // how much memory do we have left?
    // useful for warning the user
    // success value of promise will be the number of bytes remaining
    memfree(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.chrome.storage.local.getBytesInUse(null, function (bytes: number) {
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
            return [realm.toString(), realmInfo]
        } else {
            // default realm
            return ['', this.realms.get('')]
        }
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
                pk = this.realms.get(name).pk
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
            this.realms[name] = realm
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
            const [, realmInfo] = this.findRealm(realm)
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
        })
    }
    // create the key a phrase should be stored under for a given realm
    key(phrase: string, realm: RealmIdentifier): string {
        const [, realmInfo] = this.findRealm(realm)
        const index = this.realmIndex(phrase, realmInfo)
        if (index != null) {
            return `${realmInfo.pk}:${index}`
        }
    }
    realmIndex(phrase: string, realm: string | number | RealmInfo): number {
        const [, realmInfo] = this.findRealm(realm)
        return this.realmIndices.get(realmInfo.pk).get(this.normalize(phrase, realmInfo))
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
}

// get an API to handle all storage needs
export function getIndex(chrome: Chrome): Promise<Index> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['realms', 'index', 'tags'], function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
            } else {
                let { realms = [], index = [], tags = [] } = result || {}
                // now that we have the realm we can fetch the realm indices
                const indices = []
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