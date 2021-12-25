export interface PhraseInContext {
  phrase: string // the text selected
  before: string // the context preceding the selection
  after: string // the context following the selection
}

export interface CitationRecord extends PhraseInContext {
  // some text extracted at the moment of selection
  // this is saved for display and summary and because if pages change Selection objects may cease to work
  note: string
  when: Date[] // the times that this selection was looked up *on the same page*
  selection: Selection // where the text was found on the page
  source: SourceRecord // the page where the text was found
}

// a representation of a selection
export interface Selection {
  path: string // somewhat optimized/generalized CSS selector to find the common parent node holding the anchor and focus
  anchor: Node // where the selection starts
  focus: Node // where the selection ends
}

// representing the anchor or focus of a selection
export interface Node {
  path: string // a CSS selector providing an *absolute* path (relative to a common parent) of the DOM node which is contains the relevant text node
  offset: number // the character offset from the beginning of the relevant text node
  parentOffset?: number // the index of the relevant text node among the children of the parent node -- absent of the point in question is not within a text node
}

export interface SourceRecord {
  url: string // the URL the selection was found on
  title: string // the chrome extension provides this, and it may be useful for display and summary
}

export type KeyPair = [projectKey: number, phraseKey: number]

export type CardStack = {
  name: string
  lastAccess: Date
  description: string | null
  query: AdHocQuery // every flashcard stack is based on a query
}

export type EssentialNoteBits = { key: KeyPair; citations: CitationRecord[] }

export interface NoteRecord {
  key: KeyPair // a convenient denormalization -- the project and phrase key identifying this note
  gist: string // essential notes about a phrase
  details: string // free-form notes on the phrase -- an elaboration on the gist
  tags: string[] // closed-class tags categorizing the phrase
  citations: CitationRecord[] // all the times this phrase has been looked up
  canonicalCitation?: number // the index of the canonical citation for the note
  relations: { [name: string]: KeyPair[] } // relations of this phrase to other phrases
  trials?: Trial[] // the result of a test of one's knowledge
  done?: boolean // whether the card should no longer be shown in flashcard stacks
}

export type Trial = {
  type: "g" | "p" // the part tested
  result: boolean // true means success
  when: Date
}

export interface ProjectInfo {
  pk: number // the primary key (unique identifier) of the project
  name: string // a human-readable primary key
  description: string // a description of the project's contents
  normalizer: string // the name of the Normalizer the project uses
  relations: [string, string][] // the relations the project recognizes
  sorter?: number // the primary key of one of the sorters; will default to 0
}

// describes one end of a relationship -- the phrase related and its role in the relation
export type RelationPart = {
  phrase: KeyPair
  role: string
}

export type ProjectIdentifier = string | number | ProjectInfo

export interface Normalizer {
  pk: number
  name: string
  description: string
  code: (phrase: string) => string
}

// the types of things chrome.storage.local can store
export type Chromeable =
  | string
  | number
  | boolean
  | null
  | Date
  | RegExp
  | Chromeable[]
  | { [key: string]: Chromeable }
// the sort of string-keyed object typically given as a parameter to chrome extension API methods
export type Payload = Record<string, Chromeable>

// a port for communication over the chrome extension API
export interface Port {
  onMessage: {
    addListener: (callback: (message: Payload) => void) => void
  }
  postMessage: (message: Payload) => void
}

// the Chrome extension API (the portion of it which we use)
export interface Chrome {
  storage: {
    local: {
      get: (key: string[], callback: (arg: Payload) => void) => void
      set: (vals: Payload, callback?: () => void) => void
      clear: (callback?: () => void) => void
      getBytesInUse: (arg: null, callback: (bytes: number) => void) => void
      remove: (delenda: string | string[], callback?: () => void) => void
    }
  }
  runtime: {
    connect: (params: { [key: string]: string }) => Port
    lastError: string
  }
}

export interface ContentSelection {
  phrase: string
  before: string
  after: string
  selection: Selection
}

export interface LookupQuery {
  type: "lookup"
  phrase: string
  project?: number
}

export const allPeriods: RelativePeriod[] = [
  "today",
  "the day before yesterday",
  "yesterday",
  "a week ago",
  "two weeks ago",
  "a month ago",
  "six months ago",
  "a year ago",
  "ever",
]

export type RelativePeriod =
  | "today"
  | "yesterday"
  | "the day before yesterday"
  | "a week ago"
  | "two weeks ago"
  | "a month ago"
  | "six months ago"
  | "a year ago"
  | "ever"

export type SearchStrictness = "exact" | "fuzzy" | "similar"
export interface AdHocQuery {
  type: "ad hoc"
  phrase?: string
  strictness?: SearchStrictness
  sorter?: number
  project?: number[]
  tags?: string[]
  relativeTime?: boolean
  relativeInterpretation?: "since" | "on"
  relativePeriod?: RelativePeriod
  after?: Date
  before?: Date
  url?: string
  seed?: number
  sample?: number
  sampleType?: SampleType
  limit?: number
}

// for looking up a collection of phrases in a particular project
// used only to generate crosslinks in context of a phrase
export interface BatchQuery {
  type: "batch"
  project: number
  phrases: string[]
}

export type SampleType = "random" | "hard" | "novel"

export interface EditDistanceProperties {
  prefix?: number // prefix length
  suffix?: number // suffix length
  insertables?: string // characters that can be cheaply inserted into or removed from a string
  similars?: string[] // sets of characters that can cheaply transform into each other
}

// an edit distance algorithm together with its name and description
// this is to be used to sort morphologically related words near each other
export interface Sorter extends EditDistanceProperties {
  pk: number
  name: string
  description: string
  metric: (w1: string, w2: string) => number
}

export type Query = LookupQuery | AdHocQuery | BatchQuery

// configuration hash for the app
// default values for the parameters are set by setConfigurationDefaults in storage
export type Configuration = {
  cards: {
    first: FirstCardSideParam
  }
  notes: {
    similarCount: number
  }
}

export type FirstCardSideParam = "gist" | "phrase"
