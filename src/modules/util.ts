import { NoteState } from "../Note"
import {
  CitationRecord,
  EditDistanceProperties,
  EssentialNoteBits,
  KeyPair,
  NoteRecord,
  ProjectInfo,
} from "./types"

// create a debounced version of a function
//   debounce()(() => this.setState({ foo: 1 }))
export function debounce(
  interval: number = 200
): (f: () => void) => () => void {
  let i: unknown
  return function (f: () => void) {
    return function () {
      if (i) {
        clearInterval(i as number)
      }
      i = setTimeout(f, interval)
    }
  }
}

// does predicate apply to any?
export function any<T>(things: T[], predicate: (arg: T) => boolean): boolean {
  for (const o of things) {
    if (predicate(o)) {
      return true
    }
  }
  return false
}

// does predicate apply to all?
export function all<T>(things: T[], predicate: (arg: T) => boolean): boolean {
  for (const o of things) {
    if (!predicate(o)) {
      return false
    }
  }
  return true
}

// does predicate apply to none?
export function none<T>(things: T[], predicate: (arg: T) => boolean): boolean {
  for (const o of things) {
    if (predicate(o)) {
      return false
    }
  }
  return true
}

// like ruby's flatten but can take any object as its parameter
export function flatten(val: any, ar: any[] = []): any[] {
  if (val.forEach) {
    val.forEach((v: any) => flatten(v, ar))
  } else {
    ar.push(val)
  }
  return ar
}

// find the least and greatest member of a list or set after flattening
export function minmax(
  val: any,
  comparator?: (a: any, b: any) => number
): [min: any, max: any] {
  const ar = flatten(val)
  if (ar.length > 1) {
    ar.sort(comparator)
  }
  return [ar[0], ar[ar.length - 1]]
}

// does this potential string contain some non-whitespace?
export const nws = (s: string | null | undefined) => /\S/.test(s || "")

export function squish(s: string): string {
  return s.replace(/^\s+|\s+$/g, "").replace(/\s+/, " ")
}

// convert a date into the format that date inputs expect -- there must be a better way
export function ymd(date: Date | null | undefined): string | undefined {
  if (date) {
    let y = date.getFullYear()
    let m = (date.getMonth() + 1).toString()
    while (m.length < 2) {
      m = "0" + m
    }
    let d = date.getDate().toString()
    while (d.length < 2) {
      d = "0" + d
    }
    return `${y}-${m}-${d}`
  }
}

// filters to the set of things which are unique according to the toString values of the members of the array
export function uniq<T extends { toString: () => string }>(
  ar: T[],
  by: (v: T) => string = (v) => v.toString()
): T[] {
  if (ar.length < 2) return ar
  const seen = new Set<string>()
  return ar.filter((v) => {
    if (seen.size === 0) {
      seen.add(by(v))
      return true
    } else {
      const s = by(v)
      if (seen.has(s)) {
        return false
      } else {
        seen.add(s)
        return true
      }
    }
  })
}

// how many things in ar past the test?
export function count<T>(ar: T[], test: (v: T) => boolean): number {
  let n = 0
  for (let i = 0, l = ar.length; i < l; i++) {
    if (test(ar[i])) n++
  }
  return n
}

// generate a random integer to use as a seed for a reproducible random number sequence
export const seed = () => Math.floor(Math.random() * 4294967296)

// return a generator of a reproducible random number sequence
// gotten from https://stackoverflow.com/a/47593316/15060051 -- this is Mulberry32
export function rng(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// pick a random number between 0 and n - 1
export const rando = (n: number, rng: () => number): number =>
  Math.floor(rng() * n)

// pick a random member of an array
export const pick = <T extends unknown>(ar: T[], rng: () => number) =>
  ar[rando(ar.length, rng)]

// extract a random sample of up to n members from the list
// NOTE: these are the things themselves, not copies
export function sample<T>(list: T[], n: number, rng: () => number): T[] {
  if (!list.length) return []
  if (n >= list.length) return list
  const indices = []
  for (let i = 0; i < list.length; i++) indices.push(i)
  const sample = []
  for (let i = 0; indices.length && i < n; i++) {
    const idx = rando(indices.length, rng)
    sample.push(list[indices[idx]!]!)
    indices.splice(idx, 1)
  }
  return sample
}

// determine note identity by comparing keypairs
export const sameNote = (
  n1: EssentialNoteBits,
  n2: EssentialNoteBits
): boolean => sameKey(n1.key, n2.key)

export const sameKey = (k1: KeyPair, k2: KeyPair): boolean =>
  k1[0] === k2[0] && k1[1] === k2[1]

// generate a modified Levenshtein distance calculator that optionally discounts modifications to the edges of words and
// substitutions of particular characters, e.g., a vowel for a vowel, so the distance between "woman" and "women" is less than
// that between "woman" and "wodan"
export function buildEditDistanceMetric({
  prefix = 0,
  suffix = 0,
  insertables = "",
  similars = [],
}: EditDistanceProperties): (w1: string, w2: string) => number {
  const cheapos = new Map<string, Set<string>>()
  for (const group of similars) {
    for (let i = 0, l = group.length; i < l; i++) {
      const c = group.charAt(i)
      let set = cheapos.get(c)
      if (!set) {
        set = new Set()
        cheapos.set(c, set)
      }
      for (let j = 0; j < l; j++) {
        const c2 = group.charAt(j)
        if (c2 !== c) {
          set.add(c2)
        }
      }
    }
  }
  const intruders = new Set<String>()
  for (let i = 0, l = insertables.length; i < l; i++) {
    intruders.add(insertables.charAt(i))
  }
  function max(v1: number, v2: number): number {
    return v1 < v2 ? v2 : v1
  }
  function min(v1: number, v2: number, v3: number): number {
    return v1 < v2 ? (v1 < v3 ? v1 : v3) : v2 < v3 ? v2 : v3
  }
  // at this point are we in a suffix or prefix?
  function marginal(i1: number, i2: number, w1: string, w2: string): boolean {
    return max(i1, i2) < prefix || max(w1.length - i1, w2.length - i2) <= suffix
  }
  // the cost of adding or subtracting a character at this position
  function insertionCost(
    i1: number,
    i2: number,
    w1: string,
    w2: string
  ): number {
    let w = 1
    if (intruders.size && Math.abs(i1 - i2) === 1) {
      const c = i1 < i2 ? w2[i2] : w1[i1]
      w = intruders.has(c) ? 0.5 : 1
    }
    return w * (marginal(i1, i2, w1, w2) ? 0.5 : 1)
  }
  // the cost of substituting one character for another at this position
  function substitutionCost(
    i1: number,
    i2: number,
    w1: string,
    w2: string
  ): number {
    const c1 = w1.charAt(i1),
      c2 = w2.charAt(i2)
    if (c1 === c2) return 0
    let weight = marginal(i1, i2, w1, w2) ? 0.5 : 1
    if (cheapos.size && cheapos.get(c1)?.has(c2)) weight *= 0.5
    return weight
  }
  return function (w1: string, w2: string): number {
    const matrix: number[][] = []
    for (let i1 = 0, l = w1.length; i1 <= l; i1++) {
      const row: number[] = []
      matrix.push(row)
      for (let i2 = 0, l2 = w2.length; i2 <= l2; i2++) {
        let other
        if (!(i1 && i2)) {
          // we are in either the first row or the first column
          if (!(i1 || i2)) {
            // we are in cell [0, 0]
            row.push(0)
          } else {
            // the cost of pure deletion or insertion in the first column or row
            other = i1 ? matrix[i1 - 1][0] : row[i2 - 1]
            row.push(other + insertionCost(i1 - 1, i2 - 1, w1, w2))
          }
        } else {
          other = min(
            matrix[i1][i2 - 1] + insertionCost(i1 - 1, i2 - 1, w1, w2),
            matrix[i1 - 1][i2 - 1] + substitutionCost(i1 - 1, i2 - 1, w1, w2),
            matrix[i1 - 1][i2] + insertionCost(i1 - 1, i2 - 1, w1, w2)
          )
          row.push(other)
        }
      }
    }
    return matrix[w1.length][w2.length]
  }
}

// converts 1000 into 1,000 and -2000.5 into -2,001
export const formatNumber = (n: number) =>
  ((n < 0 ? -1 : 1) * Math.round(Math.abs(n))).toLocaleString()

// if NoteRecords were objects, this would be one of their methods: returns canonical citation for note
export function canonicalCitation(n: NoteRecord): CitationRecord {
  return n.citations[n.canonicalCitation || 0]
}

// if NoteRecords were objects, this would be one of their methods: returns canonical phrase for note
export function notePhrase(n: NoteRecord): string {
  return canonicalCitation(n).phrase
}

// canonical way to convert a head role and dependent role into a relation name
export const nameRelation = (head: string, dependent: string): string =>
  head === dependent ? head : `${head}-${dependent}`

// some things useful for documentation

export const bogusNote = ({
  gist,
  citations,
  tags,
  key,
  done,
}: {
  gist?: string
  citations?: CitationRecord[]
  tags?: string[]
  key?: KeyPair
  done?: boolean
}): NoteState => ({
  unsavedContent: false,
  everSaved: true,
  unsavedCitation: false,
  gist: gist ?? "my take on this",
  details: "",
  tags: tags ?? [],
  citationIndex: 0,
  key: key ?? [-1, 0],
  citations: citations ?? [bogusCitation({})],
  relations: {},
  done: done,
})

export const bogusCitation = ({
  phrase,
  url,
  title,
  when,
  before,
  after,
}: {
  phrase?: string
  url?: string
  title?: string
  when?: Date[]
  before?: string
  after?: string
}): CitationRecord => ({
  before: before ?? "",
  phrase: phrase ?? "phrase",
  after: after ?? "",
  note: "",
  when: when ?? [new Date()],
  selection: {
    path: "",
    anchor: { path: "", offset: 0 },
    focus: { path: "", offset: 0 },
  },
  source: {
    url: url ?? "https://where.i.found.it.com",
    title: title ?? "Page Title",
  },
})

export const bogusProject = ({
  name,
  pk,
}: {
  name?: string
  pk?: number
}): ProjectInfo => ({
  pk: pk ?? -1,
  name: name ?? "Project",
  description: "",
  normalizer: "",
  relations: [["see also", "see also"]],
})

// for use in discriminated union exhaustiveness checking
export function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}