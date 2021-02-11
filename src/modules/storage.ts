import { deepClone } from './clone'
import { Chrome, KeyPair, NoteRecord, ProjectInfo, ProjectIdentifier, Normalizer, Query, CitationRecord } from './types'
import { all, any, none } from './util'

// do this to anything going into storage
// NOTE no cycles!
function serialize(obj: any): any {
    if (typeof obj === 'object') {
        if (obj == null) {
            return null
        } else if (obj instanceof Date) {
            return { __class__: 'Date', args: obj.getTime() }
        } else if (obj instanceof Set) {
            return { __class__: 'Set', args: Array.from(obj).map((v) => serialize(v)) }
        } else if (obj instanceof Map) {
            return { __class__: 'Map', args: Array.from(obj).map(([k, v]) => [serialize(k), serialize(v)]) }
        } else if (Array.isArray(obj)) {
            return obj.map((v) => serialize(v))
        } else {
            const rv: { [key: string]: any } = {}
            for (const [k, v] of Object.entries(obj)) {
                rv[k] = serialize(v)
            }
            return rv
        }
    } else {
        return obj
    }
}

// do this to anything coming out of storage
function deserialize(obj: any): any {
    if (typeof obj === 'object') {
        if (obj == null) {
            return null
        } else if (Array.isArray(obj)) {
            return obj.map((v) => deserialize(v))
        } else {
            switch (obj.__class__) {
                case 'Date':
                    return new Date(obj.args)
                case 'Set':
                    return new Set(deserialize(obj.args))
                case 'Map':
                    return new Map(deserialize(obj.args))
                default:
                    const rv: { [key: string]: any } = {}
                    for (const [k, v] of Object.entries(obj)) {
                        rv[k] = deserialize(v)
                    }
                    return rv
            }
        }
    } else {
        return obj
    }
}

type FindResponse =
    { type: "found", match: NoteRecord } |
    { type: "ambiguous", matches: NoteRecord[] } |
    { type: "none" }

// how to take a KeyPair and make a local storage/cache key
export function enkey(key: KeyPair): string {
    return `${key[0]}:${key[1]}`
}

// an interface between the app and the Chrome storage mechanism
export class Index {
    chrome: Chrome                                   // the chrome API
    projects: Map<string, ProjectInfo>               // an index from project names to ProjectInfo records
    currentProject: number                           // the primary key of the project the user set as the default (as opposed to the catch-all default project)
    projectIndices: Map<number, Map<string, number>> // an index from project primary keys to indices from phrases normalized by the respective project's normalizer to that phrase's primary key for the project
    tags: Set<string>                                // the set of all tags used in a phrase in any project
    reverseProjectIndex: Map<number, string>         // an index from ProjectInfo primary keys to names
    cache: Map<string, NoteRecord>                   // a mechanism to avoid unnecessary calls to fetch things from chrome storage
    constructor(chrome: Chrome, projects: Map<string, ProjectInfo>, currentProject: number, projectIndices: Map<number, Map<string, number>>, tags: Set<string>) {
        this.chrome = chrome
        this.projects = projects
        this.currentProject = currentProject
        this.projectIndices = projectIndices
        this.tags = tags
        if (this.projectIndices.size === 0) {
            // add the default project
            const project = this.makeDefaultProject()
            this.projects.set(project.name, project)
            this.projectIndices.set(project.pk, new Map())
            const storable = { projects: this.projects }
            this.chrome.storage.local.set(serialize(storable))
        }
        this.reverseProjectIndex = new Map()
        this.projects.forEach((value, key) => this.reverseProjectIndex.set(value.pk, key))
        this.cache = new Map()
    }

    makeDefaultProject(): ProjectInfo {
        return {
            pk: 0,
            name: '',
            description: 'A project for notes that have no project.',
            normalizer: '',
            relations: [["see also", "see also"]]
        }
    }

    // return the set of relations known to the project
    relationsForProject(project: ProjectIdentifier): Set<string> {
        const [, projectInfo]: [string, ProjectInfo] = this.findProject(project)
        const relations: Set<string> = new Set()
        for (const pair in projectInfo.relations) {
            relations.add(pair[0])
            relations.add(pair[1])
        }
        return relations
    }

    // returns the other relation in a relation pair, e.g., "part" for "whole", "subtype" for "supertype", or "synonym" for "synonym"
    // the last is an example of a symmetric relation; the "see also" relation, the only relation available by default, is symmetric
    reverseRelation(project: ProjectIdentifier, relation: string): string | null {
        const [, projectInfo] = this.findProject(project)
        for (const pair in projectInfo.relations) {
            if (pair[0] === relation) {
                return pair[1]
            }
            if (pair[1] === relation) {
                return pair[0]
            }
        }
        return null
    }

    // returns the subset of the keypairs which are now missing from storage
    missing(maybeMissing: Set<string>): Promise<Set<string>> {
        // first get rid of the things in the cache
        const keys = Array.from(maybeMissing).filter((key) => !this.cache.has(key))
        return new Promise((resolve, reject) => {
            if (keys.length) {
                const missing = new Set(keys)
                const keyList = Array.from(keys)
                this.chrome.storage.local.get(keyList, (found) => {
                    if (this.chrome.runtime.lastError) {
                        reject(this.chrome.runtime.lastError)
                    } else {
                        for (const key of Object.keys(found)) {
                            missing.delete(key)
                        }
                        resolve(missing)
                    }
                })
            } else {
                resolve(new Set())
            }
        })
    }

    // get a batch of note records from their keys
    getBatch(keys: string[]): Promise<{ [key: string]: NoteRecord }> {
        return new Promise((resolve, reject) => {
            this.chrome.storage.local.get(keys, (found) => {
                if (this.chrome.runtime.lastError) {
                    reject(this.chrome.runtime.lastError)
                } else {
                    resolve(deserialize(found))
                }
            })
        })
    }

    // a general purpose method for finding notes
    find(query: Query): Promise<FindResponse> {
        switch (query.type) {
            case "lookup":
                const { phrase, project } = query
                const projects = project == null ? this.allProjects() : [project]
                return new Promise((resolve, reject) => {
                    const keys: [project: number, note: number][] = []
                    for (const pk of projects) {
                        const i = this.projectIndex(phrase, pk)
                        if (i != null) {
                            keys.push([pk, i])
                        }
                    }
                    if (keys.length) {
                        const stringKeys = keys.map((pair) => enkey(pair))
                        const rv: NoteRecord[] = []
                        const continuation = () => {
                            if (rv.length > 1) {
                                resolve({ type: "ambiguous", matches: rv })
                            } else {
                                resolve({ type: "found", match: rv[0] })
                            }
                        }
                        // first search the cache
                        for (let i = keys.length - 1; i >= 0; i--) {
                            const key = stringKeys[i]
                            const note = this.cache.get(key)
                            if (note != null) {
                                rv.push(note)
                                keys.splice(i, 1)
                                stringKeys.splice(i, 1)
                            }
                        }
                        if (keys.length) {
                            // we have to get some out of storage as well
                            this.chrome.storage.local.get(stringKeys, (found) => {
                                if (this.chrome.runtime.lastError) {
                                    reject(this.chrome.runtime.lastError)
                                } else {
                                    for (let i = 0; i < keys.length; i++) {
                                        const key = stringKeys[i]
                                        const note = deserialize(found[key])
                                        this.cache.set(key, deepClone(note)) // cache it so we don't have to look it up next time
                                        rv.push(note)
                                    }
                                    continuation()
                                }
                            })
                        } else {
                            continuation()
                        }
                    } else {
                        resolve({ type: "none" })
                    }
                })
            case "ad hoc":
                return new Promise((resolve, reject) => {
                    const { phrase, starred, url, tags, before, after } = query
                    const strictness = query.strictness || "fuzzy"
                    const [project, allProjects] = query.project?.length ?
                        [query.project, query.project.length == this.allProjects().length] :
                        [this.allProjects(), true]
                    let normalized: Map<number, string> | undefined
                    let fuzzyMatchers: Map<number, RegExp> | undefined
                    if (query.phrase != null) {
                        normalized = new Map()
                        if (query.strictness == null || query.strictness === "fuzzy") {
                            fuzzyMatchers = new Map()
                        }
                        for (const pk of project) {
                            const key = this.normalize(query.phrase, pk)
                            normalized.set(pk, key)
                            fuzzyMatchers?.set(
                                pk,
                                new RegExp(
                                    key.split('').map((c) => c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join(".*?")
                                )
                            )
                        }
                    }
                    let candidates: NoteRecord[] = []
                    const test = (note: NoteRecord): boolean => {
                        // proceed from easy to hard
                        if (starred != null) {
                            if (starred) {
                                if (!note.starred) return false
                            } else {
                                if (note.starred) return false
                            }
                        }
                        if (!allProjects) {
                            if (none(project, (pk: number) => note.key[0] === pk)) return false
                        }
                        if (phrase != null && query.strictness === "exact") {
                            if (none(note.citations, (citation: CitationRecord) => citation.phrase === phrase)) return false
                        }
                        if (tags?.length) {
                            if (any(tags, (t) => note.tags.indexOf(t) === -1)) return false
                        }
                        if (url != null) {
                            if (all(note.citations, (c) => c.source.url.indexOf(url) === -1)) return false
                        }
                        if (before != null) {
                            if (all(note.citations, (c) => all(c.when, (w) => w > before))) return false
                        }
                        if (after != null) {
                            if (all(note.citations, (c) => all(c.when, (w) => w < after))) return false
                        }
                        if (phrase != null) {
                            const pk = note.key[0]
                            let norm: string
                            switch (strictness) {
                                case "exact":
                                    norm = normalized!.get(pk) || ''
                                    if (none(note.citations, (c: CitationRecord) => this.normalize(c.phrase, pk) === norm)) return false
                                    break
                                case "fuzzy":
                                    const matcher = fuzzyMatchers!.get(pk) || new RegExp('')
                                    if (none(note.citations, (c: CitationRecord) => matcher.test(this.normalize(c.phrase, pk)))) return false
                                    break
                                case "substring":
                                    norm = normalized!.get(pk) || ''
                                    if (none(note.citations, (c: CitationRecord) => this.normalize(c.phrase, pk).indexOf(norm) > -1)) return false
                                    break
                            }
                        }
                        return true
                    }
                    this.scan((note) => {
                        if (test(note)) candidates.push(note)
                    })
                        .then(() => {
                            if (candidates.length) {
                                if (candidates.length === 1) {
                                    resolve({ type: "found", match: candidates[0] })
                                } else {
                                    // return candidates sorted by project and then normalized phrase
                                    const sortMap = new Map<string, string>()
                                    candidates.sort((a, b) => {
                                        const pkA = a.key[0], pkB = b.key[0]
                                        if (pkA === pkB) {
                                            if (a.key[1] === b.key[1]) return 0 // should be unreachable
                                            const aKey = enkey(a.key), bKey = enkey(b.key)
                                            let aString = sortMap.get(aKey)
                                            if (aString === undefined) {
                                                aString = this.normalize(a.citations[0].phrase, pkA)
                                                sortMap.set(aKey, aString)
                                            }
                                            let bString = sortMap.get(bKey)
                                            if (bString === undefined) {
                                                bString = this.normalize(b.citations[0].phrase, pkA)
                                                sortMap.set(bKey, bString)
                                            }
                                            if (aString < bString)
                                                return -1
                                            else if (bString < aString)
                                                return 1
                                            else return 0 // again, this should be unreachable
                                        } else {
                                            return pkA - pkB
                                        }
                                    })
                                    resolve({ type: "ambiguous", matches: candidates })
                                }
                            } else {
                                resolve({ type: "none" })
                            }
                        })
                        .catch(e => reject(e))
                })
        }
    }

    // make sure the cached tag set contains only the known tags
    resetTags(): Promise<void> {
        this.tags.clear()
        return new Promise((resolve, reject) => {
            this.scan((note) => {
                for (const t of note.tags) {
                    this.tags.add(t)
                }
            })
                .then(() => {
                    this.chrome.storage.local.set(serialize({ tags: this.tags }), () => {
                        if (this.chrome.runtime.lastError) {
                            reject(`could not save tags: ${this.chrome.runtime.lastError}`)
                        } else {
                            resolve()
                        }
                    })
                })
                .catch(e => reject(e))
        })
    }

    // scan all stored notes, giving each to the visitor callback
    // no scan order is guaranteed
    scan(visitor: (note: NoteRecord) => void): Promise<void> {
        const queue: string[] = []
        this.projectIndices.forEach((map, project, _indices) => {
            map.forEach((pk, _norm, _index) => {
                const key = enkey([project, pk])
                const note = this.cache.get(key)
                if (note) {
                    visitor(note)
                } else {
                    queue.push(key)
                }
            })
        })
        return new Promise((resolve, reject) => {
            const visitBatch = () => {
                const batch = queue.splice(0, 100)
                if (batch.length) {
                    this.chrome.storage.local.get(batch, (found) => {
                        if (this.chrome.runtime.lastError) {
                            reject(this.chrome.runtime.lastError)
                        } else {
                            for (const note of Object.values(found)) {
                                visitor(deserialize(note) as NoteRecord)
                            }
                            visitBatch()
                        }
                    })
                } else {
                    resolve()
                }
            }
            visitBatch()
        })
    }

    allProjects(): number[] {
        return Array.from(this.projectIndices.keys())
    }

    // save a phrase, all the data associated with the phrase should be packed into data
    add({ phrase, project, data }: { phrase: string, project: number, data: NoteRecord }): Promise<number> {
        return new Promise((resolve, reject) => {
            const storable: { [key: string]: any } = {}
            const [, projectInfo] = this.findProject(project)
            const key = this.normalize(phrase, projectInfo)
            let projectIndex = this.projectIndices.get(projectInfo.pk) || new Map()
            let pk: number = projectIndex.get(key) || 0
            if (!pk) {
                // this is necessarily in neither the index nor the project index
                // we will have to generate a primary key for this phrase and store both indices
                pk = 1
                projectIndex.forEach(function (v, k) {
                    if (v >= pk) {
                        pk = v + 1
                    }
                })
                projectIndex.set(key, pk)
                data.key[1] = pk
                storable[projectInfo.pk.toString()] = projectIndex
            }
            const keyPair: KeyPair = [projectInfo.pk, pk] // convert key to the 
            this.cache.set(enkey(keyPair), data)
            // check for any new tags
            const l = this.tags.size
            for (const tag of data.tags) {
                this.tags.add(tag)
            }
            if (this.tags.size > l) {
                storable.tags = this.tags
            }
            // modify any phrases newly tied to this by a relation
            // NOTE any relation *deleted* in editing will need to be handled separately
            for (const [relation, pairs] of Object.entries(data.relations)) {
                let reversedRelation: string = ''
                for (const pair of pairs) {
                    const other = this.cache.get(enkey(pair))
                    if (other) {
                        // other will necessarily be cached if a relation to it was added
                        reversedRelation ||= this.reverseRelation(projectInfo, relation) || ''
                        outer: for (const [relation2, pairs2] of Object.entries(other.relations)) {
                            if (relation2 === reversedRelation) {
                                for (const key2 of pairs2) {
                                    if (key2[0] === keyPair[0] && key2[1] === keyPair[1]) {
                                        break outer
                                    }
                                }
                                // this is a new relation for other, so we'll need to store other
                                pairs2.push(keyPair)
                                storable[enkey(pair)] = other
                                break // we found the reversed relation, so we're done with this pair/relation
                            }
                        }
                    }
                }
            }
            // store the phrase itself
            storable[enkey(keyPair)] = data
            this.chrome.storage.local.set(serialize(storable), () => { // FIXME
                if (this.chrome.runtime.lastError) {
                    reject(this.chrome.runtime.lastError)
                } else {
                    resolve(pk)
                }
            })
        })
    }

    // boolean parameter of returned promise indicates whether other notes were modified when deleting this one
    delete({ phrase, project }: { phrase: string, project: ProjectInfo }): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const key = this.key(phrase, project)
            if (key === null) {
                reject(`could not find "${phrase}" in project ${project.name}`)
            } else {
                const norm = this.normalize(phrase, project)
                const phrasePk = this.projectIndices.get(project.pk)?.get(norm)
                if (phrasePk === undefined) {
                    reject(`the index for project ${project.name} does not contain the phrase "${phrase}"`)
                } else {
                    const continuation1 = (note: NoteRecord) => {
                        const memoranda: { [key: string]: NoteRecord } = {}
                        const continuation2 = () => {
                            this.chrome.storage.local.remove(key, () => {
                                if (this.chrome.runtime.lastError) {
                                    reject(`failed to delete "${phrase}" from ${project.name}: ${this.chrome.runtime.lastError}`)
                                } else {
                                    this.projectIndices.get(project.pk)?.delete(norm)
                                    if (memoranda.length) {
                                        this.cache.clear() // Gordian knot solution
                                        if (note.tags.length) {
                                            this.resetTags()
                                                .then(() => resolve(true))
                                                .catch(e => reject(e))
                                        } else {
                                            resolve(true)
                                        }
                                    } else {
                                        this.cache.delete(key)
                                        if (note.tags.length) {
                                            this.resetTags()
                                                .then(() => resolve(false))
                                                .catch(e => reject(e))
                                        } else {
                                            resolve(false)
                                        }
                                    }
                                }
                            })
                        }
                        // remove from any related notes the relations concerning this note
                        const continuation3 = () => {
                            if (Object.keys(memoranda).length) {
                                this.chrome.storage.local.set(serialize(memoranda), () => {
                                    if (this.chrome.runtime.lastError) {
                                        reject(`could not store changes to notes affected by the deletion of "${phrase}" from ${project.name}: ${this.chrome.runtime.lastError}`)
                                    } else {
                                        continuation2()
                                    }
                                })
                            } else {
                                continuation2()
                            }
                        }
                        // now construct memoranda
                        const sought: { [key: string]: [end: string, pair: KeyPair] } = {}
                        const removeRelation = (end1: string, key: KeyPair, note: NoteRecord) => {
                            const end2 = this.reverseRelation(project, end1)
                            if (end2 !== null) {
                                const pairs = note.relations[end2]
                                for (let i = pairs.length - 1; i >= 0; i--) {
                                    const p = pairs[i]
                                    if (p[0] === project.pk && p[1] === phrasePk) {
                                        pairs.splice(i, 1)
                                        break // keypair is necessarily unique in the relation for the given note
                                    }
                                }
                                if (!pairs.length) {
                                    delete note.relations[end2]
                                }
                                memoranda[enkey(key)] = note
                            }
                        }
                        for (const [end1, pairs] of Object.entries(note.relations)) {
                            for (const pair of pairs) {
                                const key = enkey(pair)
                                const note = this.cache.get(key)
                                if (note === undefined) {
                                    sought[key] = [end1, pair]
                                } else {
                                    removeRelation(end1, pair, note)
                                }
                            }
                        }
                        if (Object.keys(sought).length) {
                            this.chrome.storage.local.get(Array.from(Object.keys(sought)), (found) => {
                                if (this.chrome.runtime.lastError) {
                                    reject(`could not obtain some objects whose relations needed to be modified after the deletion of "${phrase}" from project ${project.name}: ${this.chrome.runtime.lastError}`)
                                } else {
                                    for (let [key, note] of found) {
                                        note = deserialize(note)
                                        const [end, pair] = sought[key]
                                        removeRelation(end, pair, note)
                                    }
                                    continuation3()
                                }
                            })
                        } else {
                            continuation3()
                        }
                    }
                    let note = this.cache.get(key)
                    if (note) {
                        continuation1(note)
                    } else {
                        this.chrome.storage.local.get([key], (found) => {
                            if (this.chrome.runtime.lastError) {
                                reject(`could not retrieve note to be deleted for ${phrase} in ${project.name}: ${this.chrome.runtime.lastError}`)
                            } else {
                                note = deserialize(found[key]) as NoteRecord
                                continuation1(note)
                            }
                        })
                    }
                }
            }
        })
    }

    // delete a particular relation between two phrases
    // these two phrases will necessarily both already be saved
    deleteRelation({ phrase, project, relation, pair }: { phrase: string, project: ProjectInfo, relation: string, pair: KeyPair }): Promise<void> {
        return new Promise((resolve, reject) => {
            const [projectName, projectInfo] = this.findProject(project)
            let key = this.normalize(phrase, projectInfo)
            const projectIndex = this.projectIndices.get(projectInfo.pk)
            let pk = projectIndex?.get(key)
            if (pk == null) {
                reject(`the phrase ${phrase} is not stored in ${projectName}`)
            } else {
                const nearKey = enkey([projectInfo.pk, pk])
                const data = this.cache.get(nearKey) // the phrase in question is necessarily cached
                if (data) {
                    const continuation = (other: NoteRecord) => {
                        // prepare other end of relation for storage
                        const reversedRelation = this.reverseRelation(projectInfo, relation)
                        if (reversedRelation) {
                            const storable: { [key: string]: any } = {}
                            storable[enkey(pair)] = other
                            // remove other end of relation from other's relations
                            let pairs2 = other.relations[reversedRelation] || []
                            const pairs22: KeyPair[] = []
                            for (const [r2, pk2] of pairs2) {
                                if (!(r2 === projectInfo.pk && pk2 === pk)) {
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
                            storable[nearKey] = data2
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
                            this.chrome.storage.local.set(serialize(storable), () => {
                                if (this.chrome.runtime.lastError) {
                                    reject(this.chrome.runtime.lastError)
                                } else {
                                    resolve()
                                }
                            })
                        } else {
                            reject(`could not find the reversed relation for ${relation} in ${projectName}`)
                        }
                    }
                    const otherKey = enkey(pair)
                    let other = this.cache.get(otherKey)
                    if (other) {
                        continuation(other)
                    } else {
                        this.chrome.storage.local.get([otherKey], (found) => {
                            if (this.chrome.runtime.lastError) {
                                reject(this.chrome.runtime.lastError)
                            } else {
                                other = deserialize(found[otherKey]) as NoteRecord
                                this.cache.set(otherKey, other)
                                continuation(other)
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
    // convert a project in any representation, name, index, or info, into a [name, info] pair
    findProject(project: string | number | ProjectInfo): [string, ProjectInfo] {
        let projectInfo: ProjectInfo
        switch (typeof project) {
            case 'number':
                const r = this.reverseProjectIndex.get(project)
                if (r) {
                    project = r
                    const ri = this.projects.get(project)
                    if (ri) {
                        return [r, ri]
                    } else {
                        return this.defaultProject()
                    }
                } else {
                    return this.defaultProject()
                }
            case 'string':
                const ri = this.projects.get(project)
                if (ri) {
                    return [project.toString(), ri]
                } else {
                    return this.defaultProject()
                }
            case 'object':
                if (project) {
                    projectInfo = project
                    const r = this.reverseProjectIndex.get(project.pk)
                    if (r) {
                        return [r, projectInfo]
                    } else {
                        return this.defaultProject()
                    }
                } else {
                    return this.defaultProject()
                }
            default:
                throw new Error("unreachable")
        }
    }
    defaultProject(): [string, ProjectInfo] {
        return ['', this.projects.get('') as ProjectInfo]
    }
    setCurrentProject(pk: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.reverseProjectIndex.get(pk) != null) {
                this.chrome.storage.local.set({ currentProject: pk }, () => {
                    if (this.chrome.runtime.lastError) {
                        reject(this.chrome.runtime.lastError)
                    } else {
                        this.currentProject = pk
                        resolve()
                    }
                })
            } else {
                reject(`${pk} is not the primary key of a known project`)
            }
        })
    }
    // save a project or create a new one
    // the optional callback receives an error message, if any
    saveProject({
        name,
        description = '[no description]',
        normalizer = '',
        relations = [["see also", "see also"]],
    }: ProjectInfo): Promise<number> {
        return new Promise((resolve, reject) => {
            // whitespace normalization
            // TODO detect normalizer changes AND RENORMALIZE AND RE-INSERT EVERYTHING!!!
            name = name.replace(/^\s+|\s+$/g, '').replace(/\s+/, ' ')
            description = description.replace(/^\s+|\s+$/g, '').replace(/\s+/, ' ')
            let pk: number
            const storable: { [key: string]: any } = {}
            if (this.projects.has(name)) {
                pk = (this.projects.get(name) as ProjectInfo).pk
            } else {
                pk = 1
                for (const [, projectInfo] of this.projects) {
                    if (projectInfo.pk >= pk) {
                        pk = projectInfo.pk + 1
                    }
                }
                this.projectIndices.set(pk, new Map())
                this.reverseProjectIndex.set(pk, name)
                storable[pk.toString()] = []
            }
            const project: ProjectInfo = { pk, name, description, normalizer, relations }
            this.projects.set(name, project)
            storable.projects = this.projects
            this.chrome.storage.local.set(serialize(storable), () => {
                if (this.chrome.runtime.lastError) {
                    reject(this.chrome.runtime.lastError)
                } else {
                    resolve(pk)
                }
            })
        })
    }
    removeProject(project: ProjectIdentifier): Promise<void> {
        return new Promise((resolve, reject) => {
            const [, projectInfo] = this.findProject(project)
            const delenda: string[] = []
            const memoranda: { [name: string]: any } = {}
            const notes: NoteRecord[] = []
            const missing: string[] = []
            const found: string[] = []
            for (const pk of this.projectIndices.get(projectInfo.pk)!.values()) {
                const key = enkey([projectInfo.pk, pk])
                const note = this.cache.get(key)
                if (note) {
                    notes.push(note)
                    found.push(key)
                } else {
                    missing.push(key)
                }
                delenda.push(key)
            }
            // continuation that handles notes in other projects that need adjustment
            const continuation1 = () => {
                const adjustanda: string[] = []
                const adjustables: [key: string, note: NoteRecord][] = []
                // continuation that takes the adjustables and adjusts them
                const continuation2 = () => {
                    for (const [key, note] of adjustables) {
                        const keepers = note.relations["see also"].filter(([k, v]) => k !== projectInfo.pk)
                        if (keepers.length) {
                            note.relations["see also"] = keepers
                        } else {
                            delete note.relations["see also"]
                        }
                        memoranda[key] = note
                    }
                    delenda.push(projectInfo.pk.toString())
                    // now we've queued up everything that needs deletion and almost everything that needs to be saved with changes
                    this.chrome.storage.local.remove(delenda, () => {
                        if (this.chrome.runtime.lastError) {
                            reject(this.chrome.runtime.lastError)
                        } else {
                            this.projects.delete(projectInfo.name)
                            this.reverseProjectIndex.delete(projectInfo.pk)
                            if (this.currentProject === projectInfo.pk) {
                                this.currentProject = 0
                                memoranda.currentProject = 0
                            }
                            memoranda.projects = this.projects
                            // now we need to save the changes
                            this.chrome.storage.local.set(serialize(memoranda), () => {
                                if (this.chrome.runtime.lastError) {
                                    reject(`all the notes in ${projectInfo.name} have been deleted, but some changes could not be saved: ${this.chrome.runtime.lastError}`)
                                } else {
                                    for (const key of found) {
                                        this.cache.delete(key)
                                    }
                                    this.resetTags()
                                        .then(() => resolve())
                                        .catch(e => reject(e))
                                }
                            })
                        }
                    })
                }
                for (const note of notes) {
                    for (const [k, v] of (note.relations["see also"] || []).filter(([k, v]) => k !== projectInfo.pk)) {
                        const key = enkey([k, v])
                        const adjustable = this.cache.get(key)
                        if (adjustable) {
                            adjustables.push([key, adjustable])
                        } else {
                            adjustanda.push(key)
                        }
                    }
                }
                if (adjustanda.length) {
                    this.chrome.storage.local.get(adjustanda, (found) => {
                        if (this.chrome.runtime.lastError) {
                            reject(this.chrome.runtime.lastError)
                        } else {
                            for (const [key, note] of Object.entries(found)) {
                                adjustables.push([key, deserialize(note) as NoteRecord])
                            }
                            continuation2()
                        }
                    })
                } else {
                    continuation2()
                }
            }
            if (missing.length) {
                this.chrome.storage.local.get(missing, (found) => {
                    if (this.chrome.runtime.lastError) {
                        reject(this.chrome.runtime.lastError)
                    } else {
                        for (const note of Object.values(found)) {
                            notes.push(deserialize(note) as NoteRecord)
                        }
                        continuation1()
                    }
                })
            } else {
                continuation1()
            }
        })
    }
    // create the key a phrase should be stored under for a given project
    key(phrase: string, project: ProjectIdentifier): string | null {
        const [, projectInfo] = this.findProject(project)
        const index = this.projectIndex(phrase, projectInfo)
        if (index != null) {
            return enkey([projectInfo.pk, index])
        }
        return null
    }
    // return the pk, if any, of a phrase within a project
    projectIndex(phrase: string, project: ProjectIdentifier): number | null {
        const [, projectInfo] = this.findProject(project)
        const idx = this.projectIndices.get(projectInfo.pk) as Map<string, number>
        const i = idx.get(this.normalize(phrase, projectInfo))
        if (i == null) {
            return null
        } else {
            return i
        }
    }
    // normalize phrase for use in retrieval and insertion
    normalize(phrase: string, project: ProjectIdentifier): string {
        let r: ProjectInfo
        if (typeof project === 'object') {
            r = project
        } else {
            [project, r] = this.findProject(project)
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
                    this.projectIndices.clear()
                    this.projects.clear()
                    this.reverseProjectIndex.clear()
                    this.tags.clear()
                    // restore the default project
                    const project = this.makeDefaultProject()
                    this.projects.set(project.name, project)
                    this.projectIndices.set(project.pk, new Map())
                    this.chrome.storage.local.set(serialize({ projects: this.projects })) // if this fails no harm done
                    resolve()
                }
            })
        })
    }
}

// get an API to handle all storage needs
export function getIndex(chrome: Chrome): Promise<Index> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['projects', 'currentProject', 'tags'], (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
            } else {
                let { projects = new Map(), currentProject = 0, tags = new Set() } = deserialize(result) || {}
                // now that we have the project we can fetch the project indices
                const indices: string[] = []
                for (const [, projectInfo] of projects) {
                    indices.push(projectInfo.pk.toString())
                }
                chrome.storage.local.get(indices, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError)
                    } else {
                        const projectIndices = new Map()
                        for (const [idx, ridx] of Object.entries(result)) {
                            projectIndices.set(Number.parseInt(idx), deserialize(ridx))
                        }
                        resolve(new Index(chrome, projects, currentProject, projectIndices, tags))
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
export const normalizers: { [key: string]: Normalizer } = {
    "": {
        pk: 0,
        name: 'default', // by default the name of a normalizer will be its key
        description: `
            Strips marginal whitespace, replaces any internal spaces with a singe whitespace,
            strips diacritics, removes non-word ( a-z, 0-9, and _) characters, converts to lowercase.
        `,
        code: function (phrase) {
            return stripDiacrics(phrase.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ')).replace(/[^\p{L}\p{N} _'-]+/ug, '').toLowerCase()
        }
    },
    "German": {
        pk: 1,
        name: 'German',
        description: `
            Identical to the default normalizer but it also converts ß, ä, ö, and ü to ss, ae, oe, and ue, respectively.
        `,
        code: function (phrase) {
            phrase = phrase.replace(/^\s+|\s+$/g, '')
                .replace(/\s+/g, ' ')
                .toLocaleLowerCase()
                .replace(/ß/g, 'ss')
                .replace(/ä/g, 'ae')
                .replace(/ö/g, 'oe')
                .replace(/ü/g, 'ue')
            return stripDiacrics(phrase).replace(/[^\p{L}\p{N} _'-]+/ug, '')
        }
    },
}