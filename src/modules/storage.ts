import {
  anyDifference,
  deepClone,
  deepDecompress,
  deserialize,
  serialize,
} from "./clone"
import { trie } from "./trie"
import {
  Chrome,
  KeyPair,
  NoteRecord,
  ProjectInfo,
  ProjectIdentifier,
  Normalizer,
  Query,
  CitationRecord,
  Sorter,
  CardStack,
  Configuration,
  RelationPart,
} from "./types"
import {
  all,
  any,
  assertNever,
  buildEditDistanceMetric,
  none,
  notePhrase,
  rng,
  sameKey,
  sample,
  uniq,
} from "./util"

type FindResponse =
  | { type: "found"; match: NoteRecord }
  | { type: "ambiguous"; matches: NoteRecord[] }
  | { type: "none" }

// how to take a KeyPair and make a local storage/cache key
export function enkey(key: KeyPair): string {
  return `${key[0]}:${key[1]}`
}

// and how to go the other way
export function toKeyPair(key: string): KeyPair {
  return key.split(":").map((s) => Number.parseInt(s)) as KeyPair
}

type IndexConstructorParams = {
  chrome: Chrome
  projects: Map<string, ProjectInfo>
  currentProject: number
  projectIndices: Map<number, Map<string, number>>
  tags: Set<string>
  sorters: Map<number, Sorter>
  currentSorter: number
  stacks: Map<string, CardStack>
  config: Configuration
  compressor: { [key: string]: string }
}

// an interface between the app and the Chrome storage mechanism
export class Index {
  chrome: Chrome // the chrome API
  projects: Map<string, ProjectInfo> // an index from project names to ProjectInfo records
  currentProject: number // the primary key of the project the user set as the default (as opposed to the catch-all default project)
  projectIndices: Map<number, Map<string, number>> // an index from project primary keys to indices from phrases normalized by the respective project's normalizer to that phrase's primary key for the project
  tags: Set<string> // the set of all tags used in a phrase in any project
  reverseProjectIndex: Map<number, string> // an index from ProjectInfo primary keys to names
  cache: Map<string, NoteRecord> // a mechanism to avoid unnecessary calls to fetch things from chrome storage
  sorters: Map<number, Sorter> // all available sorters
  currentSorter: number // the index of the currently preferred sorter
  stacks: Map<string, CardStack> // the saved flashcard stacks
  config: Configuration // app configuration parameters
  splitters: Map<number, RegExp>
  compressor: { [key: string]: string }
  decompressor: { [key: string]: string }
  constructor({
    chrome,
    projects,
    currentProject,
    projectIndices,
    tags,
    sorters,
    currentSorter,
    stacks,
    config,
    compressor,
  }: IndexConstructorParams) {
    this.chrome = chrome
    this.projects = projects
    this.currentProject = currentProject
    this.projectIndices = projectIndices
    this.tags = tags
    this.sorters = sorters
    this.currentSorter = currentSorter
    this.stacks = stacks
    this.config = config
    this.compressor = compressor
    this.decompressor = {}
    for (const [k, v] of Object.entries(compressor)) this.decompressor[v] = k
    this.sanityCheck()
    this.reverseProjectIndex = new Map()
    this.projects.forEach((value, key) =>
      this.reverseProjectIndex.set(value.pk, key)
    )
    this.cache = new Map()
    this.splitters = new Map()
    this.heal()
  }

  refreshSplitter(i: number): Promise<RegExp> {
    this.splitters.delete(i)
    return this.getSplitter(i)
  }

  // get a splitter taking into account that it might not exist yet
  getSplitter(i: number): Promise<RegExp> {
    return new Promise((resolve, reject) => {
      let splitter = this.splitters.get(i)
      if (splitter) {
        resolve(splitter)
      } else {
        const index = this.projectIndices.get(i)
        if (index) {
          const keys: string[] = []
          index.forEach((v, _k, _m) => keys.push(`${i}:${v}`))
          const phrases: string[] = []
          const promises: Promise<void>[] = []
          while (keys.length) {
            const batch = keys.splice(0, 100)
            promises.push(
              this.getBatch(batch).then((records) => {
                Object.values(records).forEach((r) => {
                  for (const c of r.citations) {
                    phrases.push(c.phrase)
                  }
                })
              })
            )
          }
          Promise.all(promises).then(() => {
            const rx = trie(phrases, { capture: true })
            this.splitters.set(i, rx)
            console.log(
              `compiled splitter for ${this.reverseProjectIndex.get(i)}`
            )
            resolve(rx)
          })
        } else {
          reject(`there is no project ${i}; could not construct its splitter`)
        }
      }
    })
  }

  // some initialization that will only be necessary if the local storage
  // is absent
  sanityCheck() {
    if (this.projectIndices.size === 0) {
      const project = makeDefaultProject()
      this.projects.set(project.name, project)
      this.projectIndices.set(project.pk, new Map())
      const lev: Sorter = makeDefaultSorter()
      this.sorters.set(lev.pk, lev)
      const storable = { projects: this.projects, sorters: this.sorters }
      this.chrome.storage.local.set(
        serialize(storable, this.compressor, true),
        () => {
          if (this.chrome.runtime.lastError) {
            throw new Error(this.chrome.runtime.lastError)
          } else {
            this.checkCompressor().catch((e) => {
              throw new Error(e)
            })
          }
        }
      )
    }
  }

  // look for and fix broken things
  async heal() {
    this.fixLinks()
  }

  // fix things related to key pairs and linking
  async fixLinks() {
    this.scan((kp, n) => {
      const changes: string[] = []
      const phrase = notePhrase(n)
      const [project] = this.findProject(n.key[0])
      if (!sameKey(kp, n.key)) {
        changes.push(
          `fixed keypair of "${phrase}" in "${project}"; changed from ${enkey(
            n.key
          )} to ${enkey(kp)}`
        )
        n.key = kp
      }
      if (Object.keys(n.relations).length > 0) {
        Object.entries(n.relations).forEach(([id, pairs]) => {
          const other = this.reverseRelation(n.key[0], id)
          if (other === null) {
            changes.push(
              `could not find counterpart of relation "${id}" for "${phrase}" in project ${project}; removed`
            )
            delete n.relations[id]
          } else {
            if (pairs.length) {
              // remove duplicates
              const counts: Record<string, number> = {}
              for (const pair of pairs) {
                const k = enkey(pair)
                if (counts[k]) {
                  changes.push(
                    `removed duplicates of relation "${id}" for "${phrase}" in project ${project}`
                  )
                  n.relations[id] = uniq(n.relations[id]!, (kp) => enkey(kp))
                  break
                } else {
                  counts[k] = 1
                }
              }
              // make sure counterparts are also linked
              for (const pair of pairs) {
                const [otherProject] = this.findProject(pair[0])
                this.fetch(pair)
                  .catch((e) => {
                    console.error(
                      `could not fetch ${enkey(
                        pair
                      )} for "${phrase}" and relation "${id}" in ${otherProject}`,
                      e
                    )
                  })
                  .then((otherNote) => {
                    if (otherNote) {
                      const otherPhrase = notePhrase(otherNote)
                      const otherRelations = otherNote.relations[other]
                      let changed = false
                      if (otherRelations) {
                        if (
                          !otherRelations.some((kp, _i, _ar) =>
                            sameKey(kp, n.key)
                          )
                        ) {
                          changed = true
                          otherRelations.push(n.key)
                        }
                      } else {
                        changed = true
                        otherNote.relations[other] = [n.key]
                      }
                      if (changed) {
                        this.save(otherNote)
                          .catch((e) => {
                            console.error(
                              `could not save "${otherPhrase}" in ${otherProject}`,
                              e
                            )
                          })
                          .then(() =>
                            console.log(
                              `saved "${otherPhrase}" in ${otherProject}`
                            )
                          )
                      }
                    } else {
                      console.error(
                        `could not find ${enkey(
                          pair
                        )} for "${phrase}" and relation "${id}" in ${otherProject}; will attempt removal`
                      )
                      // because this is all asynchronous, we must refetch note and remove bad link
                      const msg = `attempt to fetch ${enkey(
                        n.key
                      )} to remove key ${enkey(
                        pair
                      )} from relation "${id}" in "${phrase}" in project ${project} failed`
                      this.fetch(n.key)
                        .catch((e) => console.error(msg, e))
                        .then((n) => {
                          if (n) {
                            const relations = n.relations[id].filter(
                              (k) => !sameKey(pair, k)
                            )
                            if (relations.length > 0) {
                              n.relations[id] = relations
                            } else {
                              delete n.relations[id]
                            }
                            this.save(n)
                              .catch((e) =>
                                console.error(
                                  `failed to save "${phrase}" in project ${project} after removing spurious link ${enkey(
                                    pair
                                  )}, relation "${id}"`,
                                  e
                                )
                              )
                              .then(() => {
                                console.log(
                                  `saved "${phrase}" in project ${project} after removing spurious link ${enkey(
                                    pair
                                  )}, relation "${id}"`
                                )
                              })
                          } else {
                            console.error(msg)
                          }
                        })
                    }
                  })
              }
            } else {
              // remove unused relation
              changes.push(
                `removed empty relation "${id}" from "${phrase}" in project ${project}`
              )
              delete n.relations[id]
            }
          }
        })
      }
      //here
      if (changes.length) {
        this.save(n)
          .catch((e) =>
            console.error(
              `could not save "${phrase}" in project ${project} when attempting to remove empty relations`,
              e
            )
          )
          .then(() => {
            for (const c of changes) {
              console.log(c)
            }
          })
      }
    })
  }

  // store any new keys added to the compressor
  checkCompressor(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (
        Object.keys(this.compressor).length ===
        Object.keys(this.decompressor).length
      ) {
        resolve()
      } else {
        this.decompressor = {}
        for (const [k, v] of Object.entries(this.compressor))
          this.decompressor[v] = k
        this.chrome.storage.local.set({ compressor: this.compressor }, () => {
          if (this.chrome.runtime.lastError) {
            reject(this.chrome.runtime.lastError)
          } else {
            resolve()
          }
        })
      }
    })
  }

  saveSorter(sorter: Sorter): Promise<number> {
    return new Promise((resolve, reject) => {
      sorter.name = sorter.name.replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ")
      try {
        if (this.sorters.has(sorter.pk)) {
          if (sorter.pk === 0) {
            throw new Error("the Levenshtein sorter cannot be changed")
          }
          // make sure the name is still unique
          this.sorters.forEach((k, v) => {
            if (v !== sorter.pk && k.name === sorter.name) {
              throw new Error(`the name ${k.name} is already in use`)
            }
          })
        } else {
          // find the next available primary key
          let pk = 1
          this.sorters.forEach((k, v) => {
            if (k.name === sorter.name)
              throw new Error(`the name ${k.name} is already in use`)
            if (v >= pk) pk = v + 1
          })
          sorter.pk = pk
        }
        sorter.metric = buildEditDistanceMetric(sorter)
        this.sorters.set(sorter.pk, sorter)
        this.chrome.storage.local.set(
          { sorters: serialize(this.sorters, this.compressor, false) },
          () => {
            if (this.chrome.runtime.lastError) {
              reject(this.chrome.runtime.lastError)
            } else {
              this.checkCompressor()
                .then(() => resolve(sorter.pk))
                .catch(reject)
            }
          }
        )
      } catch (e) {
        reject(e)
      }
    })
  }

  setDefaultSorter(pk: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.currentSorter === pk) {
        resolve()
      } else {
        this.chrome.storage.local.set({ currentSorter: pk }, () => {
          if (this.chrome.runtime.lastError) {
            reject(this.chrome.runtime.lastError)
          } else {
            resolve()
          }
        })
      }
    })
  }

  deleteSorter(sorter: Sorter): Promise<void> {
    return new Promise((resolve, reject) => {
      if (sorter.pk === 0) {
        throw new Error("the Levenshtein sorter cannot be deleted")
      }
      const storable: { [key: string]: any } = {}
      if (sorter.pk === this.currentSorter) {
        this.currentSorter = 0
        storable.currentSorter = 0
      }
      this.sorters.delete(sorter.pk)
      storable.sorters = serialize(this.sorters, this.compressor, false)
      this.chrome.storage.local.set(storable, () => {
        if (this.chrome.runtime.lastError) {
          reject(this.chrome.runtime.lastError)
        } else {
          this.checkCompressor().then(resolve).catch(reject)
        }
      })
    })
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
    for (const pair of projectInfo.relations) {
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
      const records: { [key: string]: NoteRecord } = {}
      for (let i = 0, l = keys.length; i < l; i++) {
        const k = keys[i]
        const r = this.cache.get(keys[i])
        if (r) {
          records[k] = r
          keys.splice(i, 1)
          i--
        }
      }
      if (!keys.length) {
        resolve(records)
      } else {
        this.chrome.storage.local.get(keys, (found) => {
          if (this.chrome.runtime.lastError) {
            reject(this.chrome.runtime.lastError)
          } else {
            const moreRecords: { [key: string]: NoteRecord } = deserialize(
              found,
              this.decompressor
            )
            resolve({ ...records, ...moreRecords })
          }
        })
      }
    })
  }

  // for looking up a bunch of words all in the same project
  async projectLookup(
    words: string[],
    project: number
  ): Promise<Map<string, NoteRecord>> {
    return new Promise((resolve, reject) => {
      const index = this.projectIndices.get(project)
      if (index) {
        const normMap = new Map<string, Set<string>>()
        const keyMap = new Map<string, string>()
        const rv = new Map<string, NoteRecord>()
        for (const w of words) {
          const norm = this.normalize(w, project)
          let set = normMap.get(norm)
          if (set === undefined) {
            set = new Set([w])
            normMap.set(norm, set)
            const key = index.get(norm)
            if (key !== undefined) {
              keyMap.set(`${project}:${key}`, norm)
            }
          } else {
            set.add(w)
          }
          if (normMap.get(norm)?.size) {
            normMap.get(norm)
          }
        }
        if (keyMap.size) {
          this.chrome.storage.local.get(
            Array.from(keyMap.keys()),
            (payload) => {
              if (this.chrome.runtime.lastError) {
                reject(this.chrome.runtime.lastError)
              } else {
                for (const [key, value] of Object.entries(payload)) {
                  const note = deserialize(
                    value,
                    this.decompressor
                  ) as NoteRecord
                  const norm = keyMap.get(key)!
                  normMap.get(norm)?.forEach((word) => rv.set(word, note))
                  resolve(rv)
                }
              }
            }
          )
        } else {
          resolve(rv)
        }
      } else {
        reject(`there is no project ${project}`)
      }
    })
  }

  // convenience method for getting the NoteRecord corresponding to a KeyPair
  async fetch(phrase: KeyPair): Promise<NoteRecord> {
    return new Promise((resolve, reject) => {
      const id = enkey(phrase)
      this.chrome.storage.local.get([id], (found) => {
        if (this.chrome.runtime.lastError) {
          reject(this.chrome.runtime.lastError)
        } else {
          const obj = found[id]
          if (obj) {
            resolve(
              deserialize(obj, this.decompressor) as unknown as NoteRecord
            )
          } else {
            reject(`could not find note for keypair ${id}`)
          }
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
                    const note = deserialize(found[key], this.decompressor)
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
          const {
            phrase,
            url,
            tags,
            before,
            after,
            strictness = "exact",
            relativeTime = true,
            relativeInterpretation = "since",
            relativePeriod = "ever",
          } = query
          let startTime: Date | undefined, endTime: Date | undefined
          if (
            (relativeTime && relativePeriod !== "ever") ||
            (!relativeTime && (before || after))
          ) {
            if (relativeTime) {
              // initially we set the start time
              // TODO fix date math here
              startTime = new Date()
              startTime.setHours(0)
              startTime.setMinutes(0)
              startTime.setMilliseconds(0)
              switch (relativePeriod) {
                case "today":
                  // startTime is already correctly set
                  break
                case "yesterday":
                  startTime.setTime(
                    startTime.getTime() - 24 * 60 * 60 * 1000 // retreat a day
                  )
                  break
                case "the day before yesterday":
                  startTime.setTime(
                    startTime.getTime() - 2 * 24 * 60 * 60 * 1000
                  )
                  break
                case "a week ago":
                  startTime.setTime(
                    startTime.getTime() - 7 * 24 * 60 * 60 * 1000
                  )
                  break
                case "two weeks ago":
                  startTime.setTime(
                    startTime.getTime() - 14 * 24 * 60 * 60 * 1000
                  )
                  break
                case "a month ago":
                  startTime.setTime(
                    startTime.getTime() - (365 * 24 * 60 * 60 * 1000) / 12 // a 12th of a typical year
                  )
                  break
                case "six months ago":
                  startTime.setTime(
                    startTime.getTime() - (365 * 24 * 60 * 60 * 1000) / 2 // half a typical year
                  )
                  break
                case "a year ago":
                  startTime.setTime(
                    startTime.getTime() - 365 * 24 * 60 * 60 * 1000 // a typical year
                  )
                  break
                case "ever":
                  // TODO confirm that this is sane
                  break
                default:
                  assertNever(relativePeriod)
              }
              if (relativeInterpretation === "on") {
                switch (relativePeriod) {
                  case "today":
                  case "yesterday":
                  case "the day before yesterday":
                  case "a week ago":
                  case "two weeks ago":
                    endTime = new Date(
                      startTime.getTime() + 24 * 60 * 60 * 1000
                    ) // just a day
                    break
                  case "a month ago":
                    endTime = new Date(
                      startTime.getTime() + 7 * 24 * 60 * 60 * 1000
                    ) // a whole week
                    break
                  case "six months ago":
                  case "a year ago":
                  case "ever":
                    endTime = new Date(
                      startTime.getTime() + 30 * 24 * 60 * 60 * 1000
                    ) // a whole month
                    break
                  default:
                    assertNever(relativePeriod)
                }
              }
            } else {
              startTime = after
              endTime = before
            }
          }
          const project = query.project?.length
            ? query.project
            : this.allProjects()
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
                  key
                    .split("")
                    .map((c) => c.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
                    .join(".*?")
                )
              )
            }
          }
          let candidates: NoteRecord[] = []
          const test = (note: NoteRecord): boolean => {
            // proceed from easy to hard
            if (phrase != null && query.strictness === "exact") {
              if (
                none(
                  note.citations,
                  (citation: CitationRecord) => citation.phrase === phrase
                )
              )
                return false
            }
            if (tags?.length) {
              if (any(tags, (t) => note.tags.indexOf(t) === -1)) return false
            }
            if (url != null) {
              if (all(note.citations, (c) => c.source.url.indexOf(url) === -1))
                return false
            }
            if (endTime) {
              if (all(note.citations, (c) => all(c.when, (w) => w > endTime!)))
                return false
            }
            if (startTime) {
              if (
                all(note.citations, (c) => all(c.when, (w) => w < startTime!))
              )
                return false
            }
            if (phrase != null) {
              const pk = note.key[0]
              let norm: string
              switch (strictness) {
                case "exact":
                  norm = normalized!.get(pk) || ""
                  if (
                    none(
                      note.citations,
                      (c: CitationRecord) =>
                        this.normalize(c.phrase, pk) === norm
                    )
                  )
                    return false
                  break
                case "fuzzy":
                  const matcher = fuzzyMatchers!.get(pk) || new RegExp("")
                  if (
                    none(note.citations, (c: CitationRecord) =>
                      matcher.test(this.normalize(c.phrase, pk))
                    )
                  )
                    return false
                  break
                case "similar":
                  // TODO confirm saneness
                  break
                default:
                  assertNever(strictness)
              }
            }
            return true
          }
          this.scan((_kp, note) => {
            if (test(note)) candidates.push(note)
          }, project)
            .then(() => {
              if (candidates.length) {
                if (candidates.length === 1) {
                  resolve({ type: "found", match: candidates[0] })
                } else {
                  const sortMap = new Map<string, string>()
                  // candidates sorted by project and then normalized phrase
                  const fallbackSort = (a: NoteRecord, b: NoteRecord) => {
                    const pkA = a.key[0],
                      pkB = b.key[0]
                    if (pkA === pkB) {
                      if (a.key[1] === b.key[1]) return 0 // should be unreachable
                      const aKey = enkey(a.key),
                        bKey = enkey(b.key)
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
                      if (aString < bString) return -1
                      else if (bString < aString) return 1
                      else return 0 // again, this should be unreachable
                    } else {
                      return pkA - pkB
                    }
                  }
                  if (
                    query.sorter !== undefined &&
                    this.sorters.has(query.sorter)
                  ) {
                    // sort by the chosen similarity metric applied to case- and whitespace-normalized strings
                    const sorter = this.sorters.get(query.sorter)!.metric
                    const normMap: Map<string, string> = new Map()
                    function norm(s: string): string {
                      let ns = normMap.get(s)
                      if (ns === undefined) {
                        ns = s
                          .toLowerCase()
                          .replace(/^\s+|\s+$/g, "")
                          .replace(/\s+/g, " ")
                        normMap.set(s, ns)
                      }
                      return ns
                    }
                    const simSortCache = new Map<string, number>()
                    const p = norm(phrase!)
                    // we combine levenshtein distance and inclusion
                    const simSort = (w: NoteRecord) => {
                      const n = norm(notePhrase(w))
                      let v = simSortCache.get(n)
                      if (v === undefined) v = sorter(p, n)
                      if (p.includes(n)) v -= n.length
                      else if (n.includes(p)) v -= p.length
                      return v
                    }
                    candidates.sort((a: NoteRecord, b: NoteRecord) => {
                      const delta = simSort(a) - simSort(b)
                      if (delta) return delta
                      return fallbackSort(a, b)
                    })
                  } else {
                    candidates.sort(fallbackSort)
                  }
                  if (query.sample) {
                    const m = new Map<number, NoteRecord[]>()
                    switch (query.sampleType) {
                      case "hard":
                        for (const n of candidates) {
                          const trials = n.trials
                          let ease = 0 // without further evidence a note is assumed to be hard
                          if (trials) {
                            for (const t of trials) {
                              if (t.result) ease++
                            }
                            ease = ease / trials.length
                          }
                          let batch = m.get(ease)
                          if (!batch) batch = []
                          batch.push(n)
                          m.set(ease, batch)
                        }
                        break
                      case "novel":
                        for (const n of candidates) {
                          const trials = n.trials
                          let experience = 0
                          if (trials) experience = trials.length
                          let batch = m.get(experience)
                          if (!batch) batch = []
                          batch.push(n)
                          m.set(experience, batch)
                        }
                        break
                      default:
                        m.set(0, candidates)
                      // can't use assertNever trick because this isn't a pure discriminated union
                    }
                    const keys = Array.from(m.keys()).sort()
                    let c: NoteRecord[] = []
                    while (keys.length && c.length < query.sample) {
                      const key = keys.shift()!
                      const batch = m.get(key)!
                      c = c.concat(batch)
                    }
                    candidates = sample(c, query.sample, rng(query.seed!))
                    candidates.sort(fallbackSort)
                  }
                  if (query.limit) {
                    candidates = candidates.slice(0, query.limit)
                  }
                  resolve({ type: "ambiguous", matches: candidates })
                }
              } else {
                resolve({ type: "none" })
              }
            })
            .catch((e) => reject(e))
        })
    }
  }

  // make sure the cached tag set contains only the known tags
  resetTags(): Promise<void> {
    this.tags.clear()
    return new Promise((resolve, reject) => {
      this.scan((_kp, note) => {
        for (const t of note.tags) {
          this.tags.add(t)
        }
      })
        .then(() => {
          this.chrome.storage.local.set(
            serialize({ tags: this.tags }, this.compressor, false),
            () => {
              if (this.chrome.runtime.lastError) {
                reject(`could not save tags: ${this.chrome.runtime.lastError}`)
              } else {
                this.checkCompressor().then(resolve).catch(reject)
              }
            }
          )
        })
        .catch(reject)
    })
  }

  // scan all stored notes, giving each to the visitor callback
  // no scan order is guaranteed
  scan(
    visitor: (key: KeyPair, note: NoteRecord) => void,
    onlyProjects?: number[]
  ): Promise<void> {
    const projects = new Set(onlyProjects || this.allProjects())
    const queue: string[] = []
    this.projectIndices.forEach((map, project, _indices) => {
      if (projects.has(project)) {
        map.forEach((pk, _norm, _index) => {
          const key = enkey([project, pk])
          const note = this.cache.get(key)
          if (note) {
            visitor([project, pk], note)
          } else {
            queue.push(key)
          }
        })
      }
    })
    return new Promise((resolve, reject) => {
      const visitBatch = () => {
        const batch = queue.splice(0, 100)
        if (batch.length) {
          this.chrome.storage.local.get(batch, (found) => {
            if (this.chrome.runtime.lastError) {
              reject(this.chrome.runtime.lastError)
            } else {
              for (const [key, note] of Object.entries(found)) {
                visitor(
                  toKeyPair(key),
                  deserialize(note, this.decompressor) as NoteRecord
                )
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
  add({
    phrase,
    project,
    data,
  }: {
    phrase: string
    project: number
    data: NoteRecord
  }): Promise<number> {
    return new Promise(async (resolve, reject) => {
      const storable: { [key: string]: any } = {}
      const [, projectInfo] = this.findProject(project)
      const key = this.normalize(phrase, projectInfo)
      let projectIndex = this.projectIndices.get(projectInfo.pk) || new Map()
      let pk: number = projectIndex.get(key) || 0
      let needNewSplitter = false
      if (pk) {
        const oldRecord = await this.fetch(data.key)
        needNewSplitter = anyDifference(
          uniq(oldRecord.citations.map((c) => c.phrase)),
          uniq(data.citations.map((c) => c.phrase))
        )
      } else {
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
        needNewSplitter = true
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
        let reversedRelation: string = ""
        for (const pair of pairs) {
          const other = this.cache.get(enkey(pair))
          if (other) {
            // other will necessarily be cached if a relation to it was added
            reversedRelation ||=
              this.reverseRelation(projectInfo, relation) || ""
            outer: for (const [relation2, pairs2] of Object.entries(
              other.relations
            )) {
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
      const compressed = serialize(
        storable,
        this.compressor,
        true,
        "unsavedContent",
        "unsavedCitation",
        "everSaved",
        "citationIndex",
        "similars"
      )
      this.chrome.storage.local.set(compressed, () => {
        if (this.chrome.runtime.lastError) {
          reject(this.chrome.runtime.lastError)
        } else {
          this.checkCompressor()
            .then(() => {
              if (needNewSplitter)
                this.refreshSplitter(project).then(() =>
                  console.log("refreshed splitter after save")
                )
              resolve(pk)
            })
            .catch(reject)
        }
      })
    })
  }

  // just save a particular note
  save(note: NoteRecord): Promise<number> {
    const phrase = note.citations[note.canonicalCitation || 0].phrase
    const project = note.key[0]
    return this.add({ phrase, project, data: note })
  }

  // establish a relation between two phrases
  // the return value contains the modified note records
  relate(
    head: RelationPart,
    dependent: RelationPart
  ): Promise<{ head: NoteRecord; dependent: NoteRecord }> {
    return new Promise((resolve, reject) => {
      const [, project] = this.findProject(head.phrase[0])
      if (
        project.relations.find(
          ([h, d]) => h === head.role && d === dependent.role
        )
      ) {
        if (
          head.phrase[0] !== dependent.phrase[0] &&
          head.role !== "see also"
        ) {
          reject(
            `these phrases are in different projects; the only relation allowed between phrases in different projects is "see also"`
          )
        } else {
          const headKey = enkey(head.phrase)
          const dependentKey = enkey(dependent.phrase)
          this.chrome.storage.local.get([headKey, dependentKey], (found) => {
            if (this.chrome.runtime.lastError) {
              reject(this.chrome.runtime.lastError)
            } else {
              const hn = found[headKey]
              const dn = found[dependentKey]
              if (hn && dn) {
                const headNote: NoteRecord = deserialize(hn, this.decompressor)
                const dependentNote: NoteRecord = deserialize(
                  dn,
                  this.decompressor
                )
                const headRelations = headNote.relations[head.role] || []
                const dependentRelations =
                  dependentNote.relations[dependent.role] || []
                if (
                  headRelations.find(
                    (k) => !anyDifference(k, dependent.phrase)
                  ) &&
                  dependentRelations.find((k) => !anyDifference(k, head.phrase))
                ) {
                  reject(
                    "this relation is already established between these two phrases"
                  )
                } else {
                  headRelations.push(deepClone(dependent.phrase))
                  dependentRelations.push(deepClone(head.phrase))
                  headNote.relations[head.role] = headRelations
                  dependentNote.relations[dependent.role] = dependentRelations
                  const storable: any = {}
                  storable[headKey] = headNote
                  storable[dependentKey] = dependentNote
                  this.chrome.storage.local.set(
                    serialize(storable, this.compressor, true),
                    () => {
                      if (this.chrome.runtime.lastError) {
                        reject(
                          `could not store phrases after establishing relation: ${this.chrome.runtime.lastError}`
                        )
                      } else {
                        this.checkCompressor()
                          .then(() => {
                            this.cache.set(headKey, headNote)
                            this.cache.set(dependentKey, dependentNote)
                            resolve({
                              head: headNote,
                              dependent: dependentNote,
                            })
                          })
                          .catch(reject)
                      }
                    }
                  )
                }
              } else if (hn) {
                reject("the dependent phrase has not been stored")
              } else if (dn) {
                reject("the head phrase has not been stored")
              } else {
                reject("neither phrase has been stored")
              }
            }
          })
        }
      } else {
        reject(
          `${project.name} does not contain the ${head.role}-${dependent.role} relation`
        )
      }
    })
  }

  // disestablish a relation between two phrases
  // the return value contains the modified note records
  unrelate(
    head: RelationPart,
    dependent: RelationPart
  ): Promise<{ head: NoteRecord; dependent: NoteRecord }> {
    return new Promise((resolve, reject) => {
      const headKey = enkey(head.phrase)
      const dependentKey = enkey(dependent.phrase)
      this.chrome.storage.local.get([headKey, dependentKey], (found) => {
        if (this.chrome.runtime.lastError) {
          reject(this.chrome.runtime.lastError)
        } else {
          const hn = found[headKey]
          const dn = found[dependentKey]
          if (hn && dn) {
            const headNote: NoteRecord = deserialize(hn, this.decompressor)
            const dependentNote: NoteRecord = deserialize(dn, this.decompressor)
            const headRelations = headNote.relations[head.role] || []
            const dependentRelations =
              dependentNote.relations[dependent.role] || []
            if (
              !(
                headRelations.find(
                  (k) => !anyDifference(k, dependent.phrase)
                ) &&
                dependentRelations.find((k) => !anyDifference(k, head.phrase))
              )
            ) {
              reject(
                "this relation is not currently established between these two phrases"
              )
            } else {
              headRelations.splice(headRelations.indexOf(head.phrase), 1)
              dependentRelations.splice(
                dependentRelations.indexOf(dependent.phrase),
                1
              )
              if (headRelations.length) {
                headNote.relations[head.role] = headRelations
              } else {
                delete headNote.relations[head.role]
              }
              if (dependentRelations.length) {
                dependentNote.relations[dependent.role] = dependentRelations
              } else {
                delete dependentNote.relations[dependent.role]
              }
              const storable: any = {}
              storable[headKey] = headNote
              storable[dependentKey] = dependentNote
              this.chrome.storage.local.set(
                serialize(storable, this.compressor, true),
                () => {
                  if (this.chrome.runtime.lastError) {
                    reject(
                      `could not store phrases after disestablishing relation: ${this.chrome.runtime.lastError}`
                    )
                  } else {
                    this.checkCompressor()
                      .then(() => {
                        this.cache.set(headKey, headNote)
                        this.cache.set(dependentKey, dependentNote)
                        resolve({
                          head: headNote,
                          dependent: dependentNote,
                        })
                      })
                      .catch(reject)
                  }
                }
              )
            }
          } else if (hn) {
            reject("the dependent phrase has not been stored")
          } else if (dn) {
            reject("the head phrase has not been stored")
          } else {
            reject("neither phrase has been stored")
          }
        }
      })
    })
  }

  // switch a note from one project to another
  // returns the changed note and whether other notes had to be changed
  switch(note: NoteRecord, project: number): Promise<NoteRecord> {
    const [, oldInfo] = this.findProject(note.key[0])
    const [newProjectName] = this.findProject(project)
    const { phrase } = note.citations[note.canonicalCitation || 0]
    return new Promise((resolve, reject) => {
      if (note.key[0] === project) {
        reject(`"${phrase}" is already in ${newProjectName}`) // no-op
      } else if (this.projectIndex(phrase, project)) {
        reject(`a note for "${phrase}" already exists in ${newProjectName}`)
      } else {
        const key = enkey(note.key)
        this.cache.delete(key)
        const keepable: KeyPair[] | undefined = note.relations["see also"]
        note.relations = {}
        this.delete({ phrase, project: oldInfo })
          .then((_othersChanged) => {
            note.key[0] = project
            this.add({ phrase, project, data: note })
              .then((pk) => {
                note.key = [project, pk]
                if (keepable) {
                  note.relations["see also"] = keepable
                  Promise.all(
                    keepable.map((kp) =>
                      this.relate(
                        { phrase: note.key, role: "see also" },
                        { phrase: kp, role: "see also" }
                      )
                    )
                  )
                    .then(() => {
                      this.cache.set(enkey(note.key), note)
                      resolve(note)
                    })
                    .catch((e) => reject(e))
                } else {
                  this.cache.set(enkey(note.key), note)
                  resolve(note)
                }
              })
              .catch((e) => reject(e))
          })
          .catch((e) => reject(e))
      }
    })
  }

  // boolean parameter of returned promise indicates whether other notes were modified when deleting this one
  delete({
    phrase,
    project,
  }: {
    phrase: string
    project: ProjectInfo
  }): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const key = this.key(phrase, project)
      if (key === null) {
        reject(`could not find "${phrase}" in project ${project.name}`)
      } else {
        const norm = this.normalize(phrase, project)
        const phrasePk = this.projectIndices.get(project.pk)?.get(norm)
        if (phrasePk === undefined) {
          reject(
            `the index for project ${project.name} does not contain the phrase "${phrase}"`
          )
        } else {
          const continuation1 = (note: NoteRecord) => {
            const memoranda: { [key: string]: NoteRecord } = {}
            const continuation2 = () => {
              this.chrome.storage.local.remove(key, () => {
                if (this.chrome.runtime.lastError) {
                  reject(
                    `failed to delete "${phrase}" from ${project.name}: ${this.chrome.runtime.lastError}`
                  )
                } else {
                  const finishUp = (others: boolean) => {
                    // save the altered index as well
                    const index = this.projectIndices.get(project.pk)!
                    index.delete(norm)
                    const m: any = {}
                    m[project.pk.toString()] = serialize(
                      index,
                      this.compressor,
                      false
                    )
                    this.chrome.storage.local.set(m, () => {
                      if (this.chrome.runtime.lastError) {
                        reject(this.chrome.runtime.lastError)
                      } else {
                        this.checkCompressor()
                          .then(() => {
                            if (note.tags.length) {
                              this.resetTags()
                                .then(() => resolve(others))
                                .catch(reject)
                            } else {
                              resolve(others)
                            }
                          })
                          .catch(reject)
                      }
                    })
                  }
                  if (memoranda.length) {
                    this.cache.clear() // Gordian knot solution
                    finishUp(true)
                  } else {
                    this.cache.delete(key)
                    finishUp(false)
                  }
                }
              })
            }
            // remove from any related notes the relations concerning this note
            const continuation3 = () => {
              if (Object.keys(memoranda).length) {
                this.chrome.storage.local.set(
                  serialize(memoranda, this.compressor, true),
                  () => {
                    if (this.chrome.runtime.lastError) {
                      reject(
                        `could not store changes to notes affected by the deletion of "${phrase}" from ${project.name}: ${this.chrome.runtime.lastError}`
                      )
                    } else {
                      this.checkCompressor().then(continuation2).catch(reject)
                    }
                  }
                )
              } else {
                continuation2()
              }
            }
            // now construct memoranda
            const sought: { [key: string]: [end: string, pair: KeyPair] } = {}
            const removeRelation = (
              end1: string,
              key: KeyPair,
              note: NoteRecord
            ) => {
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
              this.chrome.storage.local.get(
                Array.from(Object.keys(sought)),
                (found) => {
                  if (this.chrome.runtime.lastError) {
                    reject(
                      `could not obtain some objects whose relations needed to be modified after the deletion of "${phrase}" from project ${project.name}: ${this.chrome.runtime.lastError}`
                    )
                  } else {
                    for (let [key, note] of Object.entries(found)) {
                      note = deserialize(note, this.decompressor)
                      const [end, pair] = sought[key]
                      removeRelation(end, pair, note as unknown as NoteRecord)
                    }
                    continuation3()
                  }
                }
              )
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
                reject(
                  `could not retrieve note to be deleted for ${phrase} in ${project.name}: ${this.chrome.runtime.lastError}`
                )
              } else {
                note = deserialize(found[key], this.decompressor) as NoteRecord
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
  deleteRelation({
    phrase,
    project,
    relation,
    pair,
  }: {
    phrase: string
    project: ProjectInfo
    relation: string
    pair: KeyPair
  }): Promise<void> {
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
              this.chrome.storage.local.set(
                serialize(storable, this.compressor, true),
                () => {
                  if (this.chrome.runtime.lastError) {
                    reject(this.chrome.runtime.lastError)
                  } else {
                    this.checkCompressor().then(resolve).catch(reject)
                  }
                }
              )
            } else {
              reject(
                `could not find the reversed relation for ${relation} in ${projectName}`
              )
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
                other = deserialize(
                  found[otherKey],
                  this.decompressor
                ) as NoteRecord
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
  // success value of promise will be [bytes available, bytes used]
  memfree(): Promise<[number, number]> {
    return new Promise((resolve, reject) => {
      if (this.chrome.storage.local.getBytesInUse) {
        this.chrome.storage.local.getBytesInUse(null, (bytes: number) => {
          if (this.chrome.runtime.lastError) {
            reject(this.chrome.runtime.lastError)
          } else {
            resolve([5242880, bytes])
          }
        })
      } else {
        reject("cannot obtain bytes for this browser")
      }
    })
  }
  // retrieve the stack associated with the given query
  // if there is no stack, and it is not a lookup query, create an ad hoc stack
  stackForQuery(
    query: Query
  ): Promise<void | { stack: CardStack; notes: NoteRecord[] }> {
    return new Promise((resolve, reject) => {
      if (query.type === "lookup") {
        resolve()
      } else {
        const existingStack = Array.from(this.stacks.values()).find(
          (stack) => !anyDifference(query, stack.query)
        )
        const stack: CardStack = existingStack
          ? existingStack
          : {
              name: "",
              lastAccess: new Date(),
              description: "ad hoc",
              query,
            }
        const name = existingStack ? existingStack.name : ""
        this.stacks.set(name, stack)
        this.retrieveStack(name)
          .then((results) => resolve(results))
          .catch((e) => reject(e))
      }
    })
  }
  // retrieve the set of note records for a flashcard stack
  retrieveStack(
    name: string
  ): Promise<{ stack: CardStack; notes: NoteRecord[] }> {
    return new Promise((resolve, reject) => {
      const stack = this.stacks.get(name)
      if (stack) {
        this.find(stack.query)
          .then((result) => {
            let notes: NoteRecord[] = []
            switch (result.type) {
              case "ambiguous":
                notes = result.matches
                break
              case "found":
                notes = [result.match]
                break
              case "none":
                break
              default:
                assertNever(result)
            }
            resolve({ stack, notes })
          })
          .catch((e) => reject(e))
      } else {
        reject(
          name
            ? `there is no flashcard stack named "${name}"`
            : "there is no current flashcard stack"
        )
      }
    })
  }
  // save a particular stack
  saveStack(stack: CardStack): Promise<void> {
    return new Promise((resolve, reject) => {
      const newStacks: Map<string, CardStack> = deepClone(this.stacks)
      newStacks.set(stack.name, stack)
      // remove the ad hoc stack
      let adHoc: CardStack | undefined
      if (newStacks.has("")) {
        adHoc = newStacks.get("")
        newStacks.delete("")
      }
      const storable = { stacks: serialize(newStacks, this.compressor, false) }
      this.chrome.storage.local.set(storable, () => {
        if (this.chrome.runtime.lastError) {
          reject(this.chrome.runtime.lastError)
        } else {
          this.checkCompressor()
            .then(() => {
              this.stacks = newStacks
              // restore the ad hoc stack
              if (adHoc) newStacks.set("", adHoc)
              resolve()
            })
            .catch(reject)
        }
      })
    })
  }
  // delete a particular stack
  deleteStack(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.stacks.has(name)) {
        const newStacks: Map<string, CardStack> = deepClone(this.stacks)
        newStacks.delete(name)
        const storable = {
          stacks: serialize(newStacks, this.compressor, false),
        }
        this.chrome.storage.local.set(storable, () => {
          if (this.chrome.runtime.lastError) {
            reject(this.chrome.runtime.lastError)
          } else {
            this.checkCompressor()
              .then(() => {
                this.stacks = newStacks
                resolve()
              })
              .catch(reject)
          }
        })
      } else {
        reject(`there is no flashcard stack named "${name}"`)
      }
    })
  }
  // delete all saved searches
  clearStacks(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.chrome.storage.local.set(
        { stacks: serialize(new Map(), this.compressor, false) },
        () => {
          if (this.chrome.runtime.lastError) {
            reject(this.chrome.runtime.lastError)
          } else {
            this.checkCompressor().then(resolve).catch(reject)
          }
        }
      )
    })
  }
  // convert a project in any representation, name, index, or info, into a [name, info] pair
  findProject(project: string | number | ProjectInfo): [string, ProjectInfo] {
    let projectInfo: ProjectInfo
    switch (typeof project) {
      case "number":
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
      case "string":
        const ri = this.projects.get(project)
        if (ri) {
          return [project.toString(), ri]
        } else {
          return this.defaultProject()
        }
      case "object":
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
    return ["", this.projects.get("") as ProjectInfo]
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
    description = "[no description]",
    normalizer = "",
    sorter = 0,
    relations = [["see also", "see also"]],
  }: Partial<ProjectInfo> & { name: string }): Promise<number> {
    return new Promise((resolve, reject) => {
      // whitespace normalization
      name = name.replace(/^\s+|\s+$/g, "").replace(/\s+/, " ")
      description = description.replace(/^\s+|\s+$/g, "").replace(/\s+/, " ")
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
        storable[pk.toString()] = new Map()
      }
      const project: ProjectInfo = {
        pk,
        name,
        description,
        normalizer,
        sorter,
        relations,
      }
      this.projects.set(name, project)
      storable.projects = this.projects
      this.chrome.storage.local.set(
        serialize(storable, this.compressor, true),
        () => {
          if (this.chrome.runtime.lastError) {
            reject(this.chrome.runtime.lastError)
          } else {
            this.checkCompressor()
              .then(() => resolve(pk))
              .catch(reject)
          }
        }
      )
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
            const keepers = note.relations["see also"].filter(
              ([k, v]) => k !== projectInfo.pk
            )
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
              this.chrome.storage.local.set(
                serialize(memoranda, this.compressor, true),
                () => {
                  if (this.chrome.runtime.lastError) {
                    reject(
                      `all the notes in ${projectInfo.name} have been deleted, but some changes could not be saved: ${this.chrome.runtime.lastError}`
                    )
                  } else {
                    this.checkCompressor()
                      .then(() => {
                        for (const key of found) {
                          this.cache.delete(key)
                        }
                        this.resetTags()
                          .then(() => resolve())
                          .catch(reject)
                      })
                      .catch(reject)
                  }
                }
              )
            }
          })
        }
        for (const note of notes) {
          for (const [k, v] of (note.relations["see also"] || []).filter(
            ([k, v]) => k !== projectInfo.pk
          )) {
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
                adjustables.push([
                  key,
                  deserialize(note, this.decompressor) as NoteRecord,
                ])
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
              notes.push(deserialize(note, this.decompressor) as NoteRecord)
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
    if (typeof project === "object") {
      r = project
    } else {
      ;[project, r] = this.findProject(project)
    }
    const normalizer = r ? r.normalizer : ""
    return normalizers[normalizer || ""].code(phrase)
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
          const project = makeDefaultProject()
          this.projects.set(project.name, project)
          this.projectIndices.set(project.pk, new Map())
          this.stacks.clear()
          this.sorters.clear()
          const lev: Sorter = makeDefaultSorter()
          this.sorters.set(lev.pk, lev)
          this.compressor = {}
          this.decompressor = {}
          resolve()
        }
      })
    })
  }

  // save a configuration change
  saveConfiguration(config: Configuration): Promise<void> {
    return new Promise((resolve, reject) => {
      this.chrome.storage.local.set({ config: config }, () => {
        if (this.chrome.runtime.lastError) {
          reject(this.chrome.runtime.lastError)
        } else {
          this.config = config
          resolve()
        }
      })
    })
  }

  // load a new state onto disk; remember to reload the index after this
  load(state: { [key: string]: any }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.chrome.storage.local.set(state, () => {
        if (this.chrome.runtime.lastError) {
          reject(this.chrome.runtime.lastError)
        } else {
          resolve()
        }
      })
    })
  }

  // produce a JSON dump of everything in chrome.storage.local
  // NOTE keep this in sync with getIndex
  dump(readable = false): Promise<{ [key: string]: any }> {
    return new Promise((resolve, reject) => {
      // NOTE keep this in sync with getIndex
      const base = [
        "projects",
        "currentProject",
        "tags",
        "sorters",
        "currentSorter",
        "stacks",
        "config",
        "compressor",
      ]
      for (const [key, map] of this.projectIndices.entries()) {
        base.push(key.toString())
        for (const k2 of map.values()) {
          base.push(enkey([key, k2]))
        }
      }
      this.chrome.storage.local.get(base, (result) => {
        if (this.chrome.runtime.lastError) {
          reject(this.chrome.runtime.lastError)
        } else {
          if (readable) {
            result = deepDecompress(result, this.decompressor)
            delete result.compressor
          }
          resolve(result)
        }
      })
    })
  }

  // put everything back onto the disk, deleting spurious index entries and ensuring that everything is compressed
  clean(): Promise<void> {
    return this._clean_all_notes()
      .then(this._save_all_notes.bind(this))
      .then(this._save_non_notes.bind(this))
      .then(this.checkCompressor.bind(this))
  }

  _clean_all_notes(): Promise<void> {
    const queue: string[] = []
    this.projectIndices.forEach((map, project, _indices) => {
      map.forEach((pk, _norm, _index) => {
        const key = enkey([project, pk])
        const note = this.cache.get(key)
        if (!note) {
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
              for (const key of batch) {
                if (!found[key]) {
                  const [k1, k2] = toKeyPair(key)
                  const pi = this.projectIndices.get(k1)!
                  const [norm] = Array.from(pi.entries()).find(
                    (pair) => pair[1] === k2
                  )!
                  pi.delete(norm)
                }
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

  _save_all_notes(): Promise<void> {
    return this.scan((_kp, n) => this.save(n))
  }

  _save_non_notes(): Promise<void> {
    return new Promise((resolve, reject) => {
      const storable: { [key: string]: any } = {
        projects: this.projects,
        currentProject: this.currentProject,
        tags: this.tags,
        sorters: this.sorters,
        currentSorter: this.currentSorter,
        stacks: this.stacks,
        config: this.config,
      }
      for (const [pk, map] of this.projectIndices) {
        storable[pk.toString()] = map
      }
      this.chrome.storage.local.set(
        serialize(storable, this.compressor, true),
        () => {
          if (this.chrome.runtime.lastError) {
            reject(this.chrome.runtime.lastError)
          } else {
            resolve()
          }
        }
      )
    })
  }

  // remove all trial information from notes -- a garbage collection measure
  clearTrials(): Promise<string> {
    return new Promise((resolve, reject) => {
      const storable: { [key: string]: NoteRecord } = {}
      let changeCount = 0,
        notesWithTrials = 0,
        notesWithoutTrials = 0
      this.scan((_kp, n) => {
        if (n.trials) {
          changeCount += n.trials.length
          notesWithTrials++
          delete n.trials
          storable[enkey(n.key)] = n
        } else {
          notesWithoutTrials++
        }
      })
        .catch(reject)
        .then(() => {
          if (changeCount) {
            this.chrome.storage.local.set(
              serialize(storable, this.compressor, false),
              () => {
                if (this.chrome.runtime.lastError) {
                  reject(this.chrome.runtime.lastError)
                } else {
                  this.checkCompressor()
                    .catch(reject)
                    .then(() => {
                      this.cache.clear()
                      resolve(
                        `notes with trials: ${notesWithTrials}; notes without trials: ${notesWithoutTrials}; trials deleted: ${changeCount}`
                      )
                    })
                }
              }
            )
          } else {
            resolve(
              `no trials were deleted; notes without trials: ${notesWithoutTrials}`
            )
          }
        })
    })
  }
}

// get an API to handle all storage needs
export function getIndex(chrome: Chrome): Promise<Index> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["compressor"], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
      } else {
        const { compressor = {} } = result
        const decompressor: { [key: string]: string } = {}
        for (const [k, v] of Object.entries(compressor as Object))
          decompressor[v as string] = k
        chrome.storage.local.get(
          [
            "projects",
            "currentProject",
            "tags",
            "sorters",
            "currentSorter",
            "stacks",
            "config",
          ],
          (result) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              let {
                projects = new Map(),
                currentProject = 0,
                tags = new Set(),
                sorters = new Map(),
                currentSorter = 0,
                stacks = new Map(),
                config = {},
              } = deserialize(result, decompressor) || {}
              config = setConfigurationDefaults(config)
              for (const v of sorters.values()) {
                v.metric = buildEditDistanceMetric(v)
              }
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
                    projectIndices.set(
                      Number.parseInt(idx),
                      deserialize(ridx, decompressor)
                    )
                  }
                  resolve(
                    new Index({
                      chrome,
                      projects,
                      currentProject,
                      projectIndices,
                      tags,
                      sorters,
                      currentSorter,
                      stacks,
                      config,
                      compressor: compressor as unknown as any,
                    })
                  )
                }
              })
            }
          }
        )
      }
    })
  })
}

// this is basically the config constructor
export function setConfigurationDefaults(obj: {
  [key: string]: any
}): Configuration {
  if (obj?.cards?.first == null) {
    obj.cards ??= {}
    obj.cards.first = "phrase"
  }
  if (obj?.notes?.similarCount == null) {
    obj.notes ??= {}
    obj.notes.similarCount = 5
  }
  return obj as Configuration
}

function makeDefaultProject(): ProjectInfo {
  return {
    pk: 0,
    name: "",
    description: "A project for notes that have no project.",
    normalizer: "",
    relations: [["see also", "see also"]],
  }
}

function makeDefaultSorter(): Sorter {
  return {
    pk: 0,
    name: "Levenshtein",
    description: "A language-agnostic sorter.",
    metric: buildEditDistanceMetric({}),
  }
}

function stripDiacrics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

// a collection of string normalization functions with metadata for use in display
export const normalizers: { [key: string]: Normalizer } = {
  "": {
    pk: 0,
    name: "default", // by default the name of a normalizer will be its key
    description: `
            Strips marginal whitespace, replaces any internal spaces with a singe whitespace,
            strips diacritics, removes non-word ( a-z, 0-9, and _) characters, converts to lowercase.
        `,
    code: function (phrase) {
      return stripDiacrics(
        phrase.replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ")
      )
        .replace(/[^\p{L}\p{N} _'-]+/gu, "")
        .toLowerCase()
    },
  },
  German: {
    pk: 1,
    name: "German",
    description: `
            Identical to the default normalizer but it also converts ß, ä, ö, and ü to ss, ae, oe, and ue, respectively.
        `,
    code: function (phrase) {
      phrase = phrase
        .replace(/^\s+|\s+$/g, "")
        .replace(/\s+/g, " ")
        .toLocaleLowerCase()
        .replace(/ß/g, "ss")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
      return stripDiacrics(phrase).replace(/[^\p{L}\p{N} _'-]+/gu, "")
    },
  },
}
