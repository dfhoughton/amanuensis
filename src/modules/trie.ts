// holds code to make trie (non-backtracking) regexen from lists of words

import { all } from "./util"

export type TrieOpts = {
  noBoundary?: boolean
  capture?: boolean
}

export function trie(words: string[], opts: TrieOpts = {}): RegExp {
  const rx = condense(toSlices(words, !opts.noBoundary))
  return new RegExp(opts.capture ? `(${rx})` : rx, "iu")
}

type Slice = [string[], number, number]

function condense(slices: Slice[]): string {
  if (slices.length === 0) return "(?!)"
  const [slcs1, suffix] = extractSuffix(slices)
  // if this was everything, just return the suffix
  if (slcs1.length === 1 && sliceLength(slcs1[0]) === 0) return suffix
  const [slcs2, prefix] = extractPrefix(slcs1)
  const slcs3 = slcs2.filter((sl) => sliceLength(sl))
  const anyOptional = slcs3.length < slices.length ? "?" : ""
  const parts = groupByFirst(slcs3).map((slcs) => condense(slcs))
  parts.sort()
  const alternates = all(parts, (s) => /^\\?.$/.test(s))
    ? parts.length === 1
      ? parts[0]
      : `[${parts.join("").replace(/-/g, "\\-")}]`
    : `(?:${parts.join("|")})`
  return `${prefix}${alternates}${anyOptional}${suffix}`
}

// groups slices by first character
function groupByFirst(slices: Slice[]): Slice[][] {
  const groups: Record<string, Slice[]> = {}
  for (const sl of slices) {
    const ar = (groups[firstChar(sl)!] ??= [])
    ar.push(sl)
  }
  return Object.values(groups)
}

// extracts common prefix of all slices, if any
function extractPrefix(slices: Slice[]): [Slice[], string] {
  if (slices.length === 1) {
    const sl = slices[0]
    const prefix = sl[0].slice(sl[1], sl[2])
    sl[1] = sl[2]
    return [[sl], reduceDuplicates(prefix)]
  }
  let c = firstChar(slices[0])
  const prefix = []
  outer: while (c) {
    for (const sl of slices) {
      if (sliceLength(sl) === 0) break outer
      if (firstChar(sl) !== c) break outer
    }
    for (const sl of slices) sl[1]++
    prefix.push(c)
    c = firstChar(slices[0])
  }
  return [slices, reduceDuplicates(prefix)]
}

// extracts common suffix of all slices, if any
function extractSuffix(slices: Slice[]): [Slice[], string] {
  if (slices.length === 1) {
    const sl = slices[0]
    const suffix = sl[0].slice(sl[1], sl[2])
    sl[2] = sl[1]
    return [[sl], reduceDuplicates(suffix)]
  }
  let c = lastChar(slices[0])
  const suffix = []
  outer: while (c) {
    for (const sl of slices) {
      if (sliceLength(sl) === 0) break outer
      if (lastChar(sl) !== c) break outer
    }
    for (const sl of slices) sl[2]--
    suffix.push(c)
    c = lastChar(slices[0])
  }
  return [slices, reduceDuplicates(suffix.reverse())]
}

// look for repeating characters and maybe use a repetition count -- a{5}, e.g.
function reduceDuplicates(sequence: string[]): string {
  if (sequence.length === 0) return ""
  let dupCount = 1
  let unit = sequence[0]
  let reduced = ""
  for (let i = 1; i < sequence.length; i++) {
    const p = sequence[i]
    if (p === unit) {
      dupCount += 1
    } else {
      reduced += maybeReduce(dupCount, unit)
      unit = p
      dupCount = 1
    }
  }
  reduced += maybeReduce(dupCount, unit)
  return reduced
}

// converts aaaaa into a{5}, etc.
// cannot return a pattern longer than the input sequence
function maybeReduce(dc: number, unit: string): string {
  return dc === 1
    ? unit
    : dc * unit.length > unit.length + 3
    ? `${unit}{${dc}}`
    : Array(dc).fill(unit).join("")
}

function firstChar(slice: Slice): string | undefined {
  return sliceLength(slice) > 0 ? slice[0][slice[1]] : undefined
}

function lastChar(slice: Slice): string | undefined {
  return sliceLength(slice) > 0 ? slice[0][slice[2] - 1] : undefined
}

function sliceLength(slice: Slice) {
  return slice[2] - slice[1]
}

// dedups the word list, normalizes case, trims and normalizes whitespace, finds word boundaries, and escapes metacharacters
function toSlices(words: string[], boundarize: boolean): Slice[] {
  return Array.from(
    new Set(
      words
        .map((w) => w.toLowerCase().trim().replace(/\s+/g, " "))
        .filter((w) => w.length)
    )
  )
    .map((s) => s.split("").map((c) => quotemeta(c)))
    .map((ar) => {
      // handle word boundaries
      if (boundarize) {
        if (needsBoundary(ar[0])) ar.unshift("(?<=\\P{L}|^)") // left unicode word boundary
        if (needsBoundary(ar[ar.length - 1])) ar.push("(?=\\P{L}|$)") // right unicode word boundary
      }
      return ar
    })
    .map((ar) => [ar, 0, ar.length])
}

function needsBoundary(c: string): boolean {
  return c.length === 1 && /\p{L}/u.test(c)
}

function quotemeta(s: string): string {
  if (/[/\\^$*+?.()|[\]{}]/.test(s)) return `\\${s}`
  if (s === " ") return "\\s+"
  return s
}
