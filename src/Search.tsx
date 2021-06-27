import React, { useState } from "react"

import { App, Section, Visit } from "./App"
import {
  flatten,
  sameNote,
  uniq,
  ymd,
  any,
  nws,
  seed,
  notePhrase,
  nameRelation,
  bogusNote,
  bogusProject,
} from "./modules/util"
import {
  Details,
  TT,
  formatDates as fd,
  Expando,
  AboutLink,
  LinkDown,
  LinkUp,
  TabLink,
} from "./modules/components"
import {
  AdHocQuery,
  allPeriods,
  CardStack,
  CitationRecord,
  NoteRecord,
  ProjectInfo,
  RelativePeriod,
  SampleType,
  Sorter,
} from "./modules/types"
import { enkey } from "./modules/storage"
import { anyDifference, deepClone } from "./modules/clone"

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  makeStyles,
  MenuItem,
  Radio,
  RadioGroup,
  Switch,
  TextField,
  Typography as T,
} from "@material-ui/core"
import { Autocomplete, Pagination } from "@material-ui/lab"
import {
  Search as SearchIcon,
  Visibility,
  Link,
  School,
  Save,
  Delete,
  Done,
  AllInclusive,
  CardGiftcard,
  Clear,
  ExpandMore,
  ChevronRight,
} from "@material-ui/icons"
import { NoteState } from "./Note"

interface SearchProps {
  app: App
}

const searchStyles = makeStyles((theme) => ({
  message: {
    display: "table",
    margin: "0 auto",
    fontStyle: "italic",
  },
  pagination: {
    display: "table",
    margin: "0 auto",
    marginTop: theme.spacing(2),
  },
}))

function Search({ app }: SearchProps) {
  const classes = searchStyles()
  const results = app.state.searchResults
  const paginate = results.length > 10
  const [page, setPage] = useState<number>(1)
  const [showSample, setShowSample] = useState<boolean>(false)
  const [relation, setRelation] = useState("see also")
  const [currentNote, setCurrentNote] = useState<NoteRecord | null>(null)
  const offset = (page - 1) * 10
  let end = offset + 10
  if (end > results.length) end = results.length
  const pagedResults = paginate ? results.slice(offset, end) : results
  return (
    <>
      <Details header="Search">
        <SearchDetails app={app} />
      </Details>
      <Form app={app} resetter={() => setPage(1)} />
      <Box marginTop={3}>
        {!!results.length && (
          <ResultsInfo
            app={app}
            offset={offset}
            end={end}
            results={results}
            showSample={showSample}
            setShowSample={setShowSample}
          />
        )}
        {!results.length && (
          <div className={classes.message}>no notes found</div>
        )}
        {pagedResults.map((r) => (
          <Result note={r} app={app} setCurrentNote={setCurrentNote} />
        ))}
        {paginate && (
          <div className={classes.pagination}>
            <Pagination
              count={Math.ceil(results.length / 10)}
              size="small"
              defaultPage={page}
              siblingCount={0}
              onChange={(_e, p) => setPage(p)}
            />
          </div>
        )}
      </Box>
      <RelationModal
        app={app}
        currentNote={currentNote}
        setCurrentNote={setCurrentNote}
        relation={relation}
        setRelation={setRelation}
      />
    </>
  )
}

export default Search

type ResultsInfoProps = {
  app: App
  offset: number
  end: number
  results: NoteRecord[]
  showSample: boolean
  setShowSample: (v: boolean) => void
}
function ResultsInfo({
  app,
  offset,
  end,
  results,
  showSample,
  setShowSample,
}: ResultsInfoProps) {
  const search = app.state.search as AdHocQuery
  const [sample, setSample] = useState<number>(1)
  const [sampleType, setSampleType] = useState<SampleType>("random")
  return (
    <>
      <Grid container justify="center" alignItems="center" spacing={2}>
        <Grid item>
          Notes {offset + 1} <>&ndash;</> {end} of {results.length}
        </Grid>
        {!!search.sample && (
          <Grid item>
            <IconButton
              size="small"
              onClick={() => {
                const s: AdHocQuery = deepClone(search)
                delete s.sample
                app.switchboard
                  .index!.find(s)
                  .then((results) => {
                    let searchResults: NoteRecord[]
                    switch (results.type) {
                      case "ambiguous":
                        searchResults = results.matches
                        break
                      case "none":
                        searchResults = []
                        break
                      case "found":
                        searchResults = [results.match]
                        break
                    }
                    setShowSample(false)
                    app.setState({ search: s, searchResults })
                  })
                  .catch((e) => app.error(e))
              }}
            >
              <TT msg="show all">
                <AllInclusive color="primary" fontSize="small" />
              </TT>
            </IconButton>
          </Grid>
        )}
        {!search.sample && results.length > 10 && (
          <Grid item>
            <IconButton size="small" onClick={() => setShowSample(!showSample)}>
              <TT msg="choose a random sample">
                <CardGiftcard color="primary" fontSize="small" />
              </TT>
            </IconButton>
          </Grid>
        )}
      </Grid>
      <Collapse in={showSample}>
        <Grid container justify="center" alignItems="center" spacing={2}>
          <Grid item xs={3}>
            <TextField
              label="Sample size"
              type="number"
              InputLabelProps={{ shrink: true }}
              InputProps={{ inputProps: { min: 1, step: 1 } }}
              value={sample}
              onChange={(e) => {
                const v = e.target.value ? Number.parseInt(e.target.value) : 0
                if (v) {
                  setSample(v)
                }
              }}
            />
          </Grid>
          <Grid item xs={3}>
            <TextField
              label="Sample type"
              select
              value={sampleType}
              style={{ width: "100%" }}
              onChange={(e) => setSampleType(e.target.value as SampleType)}
            >
              {["random", "hard", "novel"].map((s) => (
                <MenuItem dense key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item>
            <Button
              color="primary"
              variant="outlined"
              onClick={() => {
                const s: AdHocQuery = deepClone(search)
                s.sample = sample
                s.sampleType = sampleType
                s.seed = seed()
                app.switchboard
                  .index!.find(s)
                  .then((results) => {
                    let searchResults: NoteRecord[]
                    switch (results.type) {
                      case "ambiguous":
                        searchResults = results.matches
                        break
                      case "none":
                        searchResults = []
                        break
                      case "found":
                        searchResults = [results.match]
                        break
                    }
                    setShowSample(false)
                    app.setState({ search: s, searchResults })
                  })
                  .catch((e) => app.error(e))
              }}
            >
              Sample
            </Button>
          </Grid>
          <Grid item>
            <Button
              color="secondary"
              variant="outlined"
              onClick={() => setShowSample(false)}
            >
              Cancel
            </Button>
          </Grid>
        </Grid>
      </Collapse>
    </>
  )
}

const formStyles = makeStyles((theme) => ({
  root: {},
  item: {
    width: "100%",
    marginTop: theme.spacing(1),
    "&:first-child": {
      marginTop: 0,
    },
  },
  centered: {
    marginTop: theme.spacing(1),
    display: "table",
    margin: "0 auto",
  },
  inCentered: {
    marginLeft: theme.spacing(2),
    "&:first-child": {
      marginLeft: 0,
    },
  },
  sorter: {
    minWidth: "5rem",
  },
  time: {
    marginTop: theme.spacing(1),
  },
  saveSearchForm: {
    margin: theme.spacing(3),
    marginTop: theme.spacing(0),
    marginBottom: theme.spacing(2),
  },
  discard: {
    color: theme.palette.error.dark,
  },
}))

function Form({ app, resetter }: { app: App; resetter: () => void }) {
  const classes = formStyles()
  let search: AdHocQuery
  switch (app.state.search.type) {
    case "lookup":
      // convert the lookup search into an ad hoc search
      search = { type: "ad hoc", phrase: app.state.search.phrase }
      app.setState({ search })
      break
    default:
      search = deepClone(app.state.search)
      break
  }
  const findSearch = () =>
    Array.from(app.switchboard.index!.stacks.values()).find(
      (s) => !anyDifference(s.query, search)
    )
  const [savedSearch, setSavedSearch] = useState<CardStack | undefined>(
    findSearch()
  )
  const {
    phrase,
    after,
    before,
    url,
    tags: tagRequired,
    project = [],
    relativeTime = true,
    relativeInterpretation = "since",
    relativePeriod = "ever",
    strictness = "exact",
  } = search
  const showSorter = !!(
    phrase &&
    strictness === "similar" &&
    app.switchboard.index!.sorters.size > 1
  )
  const projects = Array.from(app.switchboard.index!.reverseProjectIndex.keys())
  const tags = Array.from(app.switchboard.index!.tags).sort()
  const [showSaveSearchForm, setShowSaveSearchForm] = useState<boolean>(false)
  const [searchName, setSearchName] = useState<string | undefined>(
    savedSearch?.name
  )
  const detailToSee = (search: AdHocQuery) =>
    !!(
      search.after ||
      search.before ||
      search.project?.length ||
      search.tags?.length ||
      search.relativePeriod ||
      search.url
    )
  const [showSearchDetails, setShowSearchDetails] = useState<boolean>(
    detailToSee(search)
  )
  const maybeShowDetails = (search: AdHocQuery) =>
    setShowSearchDetails(showSearchDetails || detailToSee(search))
  const [searchDescription, setSearchDescription] = useState<string | null>(
    savedSearch?.description || null
  )
  const reset = (s: AdHocQuery, ss?: CardStack | undefined) => {
    setSavedSearch(ss || findSearch())
    search = s
    resetter()
    setShowSaveSearchForm(false)
    setSearchName((ss || savedSearch)?.name)
    setSearchDescription((ss || savedSearch)?.description || null)
  }
  const anyResults = !!app.state.searchResults.length
  const clear = () => {
    search = { type: "ad hoc" }
    setShowSaveSearchForm(false)
    setSearchName(undefined)
    setSearchDescription(null)
    app.setState({ search, searchResults: [] }, () => {
      const found = findSearch()
      setSavedSearch(found)
      setSearchName(found?.name)
    })
  }
  let searchNameError
  if (nws(searchName || "")) {
    if (
      !savedSearch &&
      any(
        Array.from(app.switchboard.index!.stacks.values()),
        (s: CardStack) => s.name === searchName
      )
    ) {
      searchNameError = "this is already the name of a different search"
    }
  } else {
    searchNameError = "saved searches must be named"
  }
  const savedSearchNames = Array.from(
    app.switchboard.index!.stacks.keys()
  ).sort()
  return (
    <div className={classes.root}>
      {!!app.switchboard.index!.stacks.size && (
        <TextField
          label="Saved Searches"
          select
          className={classes.item}
          value={savedSearch?.name}
          onChange={(e) => {
            const stack = app.switchboard.index!.stacks.get(e.target.value)!
            app.switchboard
              .index!.find(stack.query)
              .then((results) => {
                let searchResults: NoteRecord[]
                switch (results.type) {
                  case "none":
                    searchResults = []
                    break
                  case "found":
                    searchResults = [results.match]
                    break
                  case "ambiguous":
                    searchResults = results.matches
                    break
                }
                const newState = {
                  searchResults,
                  stack: e.target.value,
                  search: stack.query,
                }
                app.setState(newState, () => {
                  reset(stack.query, stack)
                  maybeShowDetails(stack.query)
                })
              })
              .catch((e) => app.error(e))
          }}
        >
          {savedSearchNames.map((n) => (
            <MenuItem dense key={n} value={n}>
              {n}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Grid
        container
        spacing={1}
        alignContent="space-between"
        className={classes.item}
      >
        <Grid item xs={11}>
          <TextField
            id="phrase"
            label="Phrase"
            // className={classes.item}
            fullWidth
            value={phrase || ""}
            onChange={(event) => {
              if (nws(event.target.value)) {
                search.phrase = event.target.value
              } else {
                delete search.phrase
              }
              app.setState({ search })
            }}
          />
        </Grid>
        <Grid item container xs={1} alignContent="center">
          <IconButton
            size="small"
            onClick={() => setShowSearchDetails(!showSearchDetails)}
          >
            {showSearchDetails ? <ExpandMore /> : <ChevronRight />}
          </IconButton>
        </Grid>
      </Grid>
      {phrase && nws(phrase) && (
        <div className={classes.centered}>
          <Grid container justify="space-between">
            <Grid item>
              <FormControl component="fieldset">
                <RadioGroup
                  row
                  value={strictness}
                  onChange={(v) => {
                    switch (v.target.value) {
                      case "exact":
                      case "fuzzy":
                        search.strictness = v.target.value
                        delete search.sorter
                        app.setState({ search })
                        break
                      case "similar":
                        search.strictness = v.target.value
                        search.sorter = app.switchboard.index!.currentSorter
                        app.setState({ search })
                        break
                    }
                  }}
                >
                  <FormControlLabel
                    value="exact"
                    disabled={!phrase}
                    control={<Radio />}
                    label="exact"
                  />
                  <FormControlLabel
                    value="fuzzy"
                    disabled={!phrase}
                    control={<Radio />}
                    label="fuzzy"
                  />
                  <FormControlLabel
                    label={`similar (${
                      app.switchboard.index!.sorters.get(
                        search.sorter ?? app.switchboard.index!.currentSorter
                      )!.name
                    })`}
                    value="similar"
                    disabled={!phrase}
                    control={<Radio />}
                  />
                </RadioGroup>
              </FormControl>
              {showSorter && (
                <TextField
                  label="Sorter"
                  select
                  className={classes.sorter}
                  size="small"
                >
                  {Array.from(app.switchboard.index!.sorters.values())
                    .sort((a, b) => (a.name < b.name ? -1 : 1))
                    .map((s) => (
                      <SorterOption app={app} search={search} sorter={s} />
                    ))}
                </TextField>
              )}
            </Grid>
          </Grid>
        </div>
      )}
      {showSearchDetails && (
        <>
          {projects.length > 1 && (
            <Autocomplete
              id="project"
              className={classes.item}
              options={projects}
              value={project}
              multiple
              autoComplete
              getOptionLabel={(option) =>
                app.switchboard.index!.reverseProjectIndex.get(option) ||
                "default"
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Projects"
                  placeholder="project name"
                />
              )}
              onChange={(_event, project) => {
                search = deepClone(search)
                search.project = project as number[]
                app.setState({ search })
              }}
              renderTags={(value, getTagProps) => {
                // not sure why this needs flattening; maybe some day I will be wiser...
                const chips = value.map((obj, i) => (
                  <Chip
                    variant="outlined"
                    size="small"
                    label={
                      app.switchboard.index!.reverseProjectIndex.get(obj) ||
                      "default"
                    }
                    {...getTagProps({ index: i })}
                  />
                ))
                return chips
              }}
            />
          )}
          {!!tags.length && (
            <Autocomplete
              id="tags-required"
              className={classes.item}
              options={tags}
              value={tagRequired || []}
              multiple
              autoComplete
              renderInput={(params) => (
                <TextField {...params} label="Tags" placeholder="tag" />
              )}
              onChange={(_event, newTags) => {
                search = deepClone(search)
                if (newTags.length) {
                  search.tags = newTags
                } else {
                  delete search.tags
                }
                app.setState({ search })
              }}
              renderTags={(value, getTagProps) =>
                value.map((obj, i) => (
                  <Chip
                    variant="outlined"
                    size="small"
                    label={obj}
                    {...getTagProps({ index: i })}
                  />
                ))
              }
            />
          )}
          <Grid container justify="center" className={classes.time}>
            <Grid item>
              <Grid component="label" container alignItems="center" spacing={1}>
                <Grid item>Relative Time</Grid>
                <Grid item>
                  <Switch
                    checked={!relativeTime}
                    onChange={() => {
                      search.relativeTime = !relativeTime
                      app.setState({ search })
                    }}
                  />
                </Grid>
                <Grid item>Absolute Time</Grid>
              </Grid>
            </Grid>
          </Grid>
          {relativeTime && (
            <Grid
              container
              alignItems="center"
              justify="space-evenly"
              className={classes.item}
            >
              <Grid item>
                <Grid
                  component="label"
                  container
                  alignItems="center"
                  spacing={1}
                >
                  <Grid item>Since</Grid>
                  <Grid item>
                    <Switch
                      checked={relativeInterpretation === "on"}
                      disabled={
                        relativeInterpretation === "since" &&
                        relativePeriod === "ever"
                      }
                      onChange={() => {
                        search.relativeInterpretation =
                          relativeInterpretation === "on" ? "since" : "on"
                        app.setState({ search })
                      }}
                    />
                  </Grid>
                  <Grid item>On</Grid>
                </Grid>
              </Grid>
              <Grid item>
                <TextField
                  onChange={(event) => {
                    search.relativePeriod = event.target.value as RelativePeriod
                    app.setState({ search })
                  }}
                  value={relativePeriod}
                  select
                >
                  {allPeriods.map((p) => (
                    <MenuItem
                      key={p}
                      value={p}
                      dense
                      disabled={p === "ever" && relativeInterpretation === "on"}
                    >
                      {p}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          )}
          {!relativeTime && (
            <Grid container justify="space-between" className={classes.item}>
              <TextField
                id="after"
                label="After"
                type="date"
                value={ymd(after)}
                onChange={(e) => {
                  search = deepClone(search)
                  if (e.target.value) {
                    search.after = new Date(e.target.value)
                  } else {
                    delete search.after
                  }
                  app.setState({ search })
                }}
                InputLabelProps={{
                  shrink: true,
                }}
              />
              <TextField
                id="before"
                label="Before"
                type="date"
                value={ymd(before)}
                onChange={(e) => {
                  search = deepClone(search)
                  if (e.target.value) {
                    search.before = new Date(e.target.value)
                  } else {
                    delete search.before
                  }
                  app.setState({ search })
                }}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
          )}
          <Box mt={relativeTime ? 0 : 2}>
            <Grid container spacing={1} alignContent="space-between">
              <Grid item xs={search.url ? 11 : 12}>
                <TextField
                  id="url"
                  label="URL"
                  fullWidth
                  value={url || ""}
                  onChange={(event) => {
                    search = deepClone(search)
                    if (nws(event.target.value)) {
                      search.url = event.target.value
                    } else {
                      delete search.url
                    }
                    app.setState({ search })
                  }}
                />
              </Grid>
              {!!search.url && (
                <Grid item container xs={1} alignContent="center">
                  <IconButton
                    size="small"
                    onClick={() => {
                      delete search.url
                      app.setState({ search })
                    }}
                  >
                    <Clear />
                  </IconButton>
                </Grid>
              )}
            </Grid>
          </Box>
        </>
      )}
      <Box mt={1}>
        <div className={classes.centered}>
          <Grid container justify="space-evenly" className={classes.item}>
            {anyResults && !search.sample && (
              <IconButton
                hidden={!anyResults || !!search.sample}
                className={classes.inCentered}
                onClick={() => setShowSaveSearchForm(!showSaveSearchForm)}
              >
                <TT msg="save search">
                  <Save color={showSaveSearchForm ? "secondary" : "primary"} />
                </TT>
              </IconButton>
            )}
            <Button
              color="primary"
              className={classes.inCentered}
              variant="contained"
              endIcon={<SearchIcon />}
              onClick={() => {
                app.switchboard
                  .index!.find(search)
                  .then((found) => {
                    switch (found.type) {
                      case "none":
                        app.setState({ searchResults: [] }, () => reset(search))
                        break
                      case "ambiguous":
                        app.setState({ searchResults: found.matches }, () =>
                          reset(search)
                        )
                        break
                      case "found":
                        app.setState({ searchResults: [found.match] }, () =>
                          reset(search)
                        )
                    }
                  })
                  .catch((e) => app.error(e))
              }}
            >
              Search
            </Button>
            <Button
              color="secondary"
              className={classes.inCentered}
              variant="contained"
              onClick={clear}
            >
              Clear
            </Button>
            {anyResults && (
              <IconButton
                className={classes.inCentered}
                onClick={() => {
                  if (
                    savedSearch &&
                    !anyDifference(savedSearch.query, search)
                  ) {
                    app.setState({
                      tab: Section.cards,
                      stack: savedSearch.name,
                    })
                  } else {
                    // install a new ad hoc flashcard stack
                    const adHoc: CardStack = {
                      name: "",
                      description: "",
                      lastAccess: new Date(),
                      query: search,
                    }
                    app.switchboard.index!.stacks.set("", adHoc)
                    app.setState({
                      tab: Section.cards,
                      stack: "",
                      flashcards: undefined,
                    })
                  }
                }}
              >
                <TT msg="make search results into flash card stack">
                  <School color="primary" />
                </TT>
              </IconButton>
            )}
          </Grid>
        </div>
      </Box>
      <Collapse in={showSaveSearchForm} className={classes.saveSearchForm}>
        <div className={classes.centered}>
          <h3>Save This Search</h3>
        </div>
        <TextField
          label="Name"
          value={searchName}
          InputLabelProps={{ shrink: nws(searchName || "") }}
          className={classes.item}
          error={!!searchNameError}
          helperText={searchNameError}
          onChange={(e) => setSearchName(e.target.value)}
        />
        <TextField
          label="Description"
          value={searchDescription}
          InputLabelProps={{ shrink: nws(searchDescription || "") }}
          className={classes.item}
          onChange={(e) => setSearchDescription(e.target.value)}
        />
        <div className={classes.centered}>
          <Button
            color="primary"
            variant="contained"
            className={classes.inCentered}
            disabled={!!searchNameError}
            onClick={() => {
              const name = searchName!
                .replace(/^\s+|\s+$/g, "")
                .replace(/\s+/g, " ")
              app.switchboard
                .index!.saveStack({
                  name,
                  description: searchDescription,
                  lastAccess: new Date(),
                  query: search,
                })
                .then(() => {
                  setSearchName(name)
                  app.setState({ stack: name }, () => {
                    app.success(`saved search "${name}"`)
                    setShowSaveSearchForm(false)
                  })
                })
                .catch((e) => app.error(e))
            }}
          >
            Save
          </Button>
          <Button
            color="secondary"
            variant="contained"
            className={classes.inCentered}
            onClick={() => setShowSaveSearchForm(false)}
          >
            Cancel
          </Button>
          {!!savedSearch && (
            <TT msg="remove this from the saved searches">
              <IconButton
                className={`${classes.inCentered} ${classes.discard}`}
                onClick={() => {
                  app.switchboard
                    .index!.deleteStack(savedSearch!.name)
                    .then(() => {
                      if (app.state.stack === savedSearch!.name) {
                        app.setState({ stack: undefined })
                      }
                      app.success(
                        `discarded saved search "${savedSearch!.name}"`
                      )
                      setShowSaveSearchForm(false)
                    })
                    .catch((e) => app.error(e))
                }}
              >
                <Delete />
              </IconButton>
            </TT>
          )}
        </div>
      </Collapse>
    </div>
  )
}

const resultStyles = makeStyles((theme) => ({
  root: {
    marginTop: theme.spacing(2),
    "&:first-child": {
      marginTop: 0,
    },
  },
  phrase: {
    fontWeight: "bold",
  },
  navlinker: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  project: {
    textAlign: "right",
    fontWeight: "bold",
    color: theme.palette.grey[500],
  },
  star: {
    textAlign: "right",
    lineHeight: "1rem",
  },
  dates: {
    fontSize: "smaller",
    color: theme.palette.grey[500],
    marginLeft: "1rem",
  },
  tags: {
    display: "flex",
    flexDirection: "row-reverse",
    fontSize: "smaller",
  },
  urls: {},
}))

type ResultOps = {
  note: NoteRecord
  app: App
  setCurrentNote: (n: NoteRecord | null) => void
  // some options to facilitate documentation
  cn?: NoteState | undefined
  linkHandler?: () => void
  visHandler?: () => void
  doneHandler?: () => void
  getProject?: () => ProjectInfo | undefined
}

// draw a single result card (and wire it up with callbacks)
export function Result({
  note,
  app,
  setCurrentNote,
  getProject,
  ...docOpts
}: ResultOps) {
  const classes = resultStyles()
  getProject ??= () =>
    app.switchboard.index!.projects.get(
      app.switchboard.index!.reverseProjectIndex.get(note.key[0]) || ""
    )
  const project = getProject()
  const key = enkey(note.key)
  return (
    <Card className={classes.root} key={key}>
      <CardContent>
        <Grid container spacing={1}>
          <Grid item xs={5} className={classes.phrase}>
            {notePhrase(note)}
          </Grid>
          <Grid item xs={3} className={classes.navlinker}>
            <NavLinker
              note={note}
              app={app}
              setCurrentNote={setCurrentNote}
              {...docOpts}
            />
          </Grid>
          <Grid item xs={4} className={classes.project}>
            {project!.name}
          </Grid>
          <Grid item xs={5} className={classes.dates}>
            {formatDates(note)}
          </Grid>
          <Grid item xs={6} className={classes.tags}>
            {formatTags(note)}
          </Grid>
          <Grid item xs={12}>
            <Expando id={`${key}-gist`} text={note.gist} />
          </Grid>
          <Grid item xs={12} className={classes.urls}>
            {formatUrls(note, key)}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

// facilitates creating a mock note in the documentation
function DocResult({
  project,
  ...opts
}: {
  note: NoteState
  cn?: NoteState
  app: App
  project: ProjectInfo
}) {
  const { app } = opts
  return (
    <Result
      {...opts}
      setCurrentNote={(_n) => {}}
      getProject={() => project}
      linkHandler={() =>
        app.success(
          <>
            Create a link between this note and the current note, whatever is
            currently shown in the{" "}
            <TabLink app={app} tab="note">
              note tab
            </TabLink>
            .
          </>
        )
      }
      visHandler={() =>
        app.success(
          <>
            Show this note in the{" "}
            <TabLink app={app} tab="note">
              note tab
            </TabLink>
            .
          </>
        )
      }
      doneHandler={() =>
        app.success(<>Remove the &ldquo;done&rdquo; status from this note.</>)
      }
    />
  )
}

const linkerStyles = makeStyles((theme) => ({
  link: {
    marginLeft: theme.spacing(1),
    cursor: "pointer",
  },
  goto: {
    cursor: "pointer",
  },
  done: {
    cursor: "pointer",
    color: theme.palette.success.dark,
  },
}))

type NavLinkerOps = {
  note: NoteRecord
  app: App
  setCurrentNote: (n: NoteRecord | null) => void
  // some options to facilitate documentation
  cn?: NoteState | undefined
  linkHandler?: () => void
  visHandler?: () => void
  doneHandler?: () => void
}
function NavLinker({
  note,
  app,
  setCurrentNote,
  // documentation opts
  cn,
  linkHandler,
  visHandler,
  doneHandler,
}: NavLinkerOps): React.ReactElement {
  const classes = linkerStyles()
  cn ??= app.currentNote()
  linkHandler ??= () => setCurrentNote(note)
  visHandler ??= () => app.goto(note)
  doneHandler ??= () => {
    const r: NoteRecord[] = deepClone(app.state.searchResults)
    const n = r.find((n) => sameNote(n, note))!
    delete n.done
    app.switchboard
      .index!.save(n)
      .then(() => {
        app.setState({ searchResults: r })
      })
      .catch((e) => app.error(e))
  }
  let link
  if (cn && cn.citations.length && !sameNote(cn, note)) {
    const message = `link "${notePhrase(note)}" to "${notePhrase(cn)}"`
    link = (
      <TT msg={message}>
        <Link
          color="primary"
          fontSize="small"
          className={classes.link}
          onClick={linkHandler}
        />
      </TT>
    )
  }
  return (
    <div>
      <TT msg={`go to "${notePhrase(note)}"`}>
        <Visibility
          color="secondary"
          fontSize="small"
          className={classes.goto}
          onClick={visHandler}
        />
      </TT>
      {link}
      {!!note.done && (
        <TT msg="Note has been removed from flashcards stacks. Click to restore.">
          <Done className={classes.done} onClick={doneHandler} />
        </TT>
      )}
    </div>
  )
}

function formatDates(note: NoteRecord): string | React.ReactElement {
  let ar: Date[] = flatten(note.citations.map((c) => c.when))
  return fd(ar)
}

function formatTags(note: NoteRecord): string {
  return note.tags.sort().join(", ")
}

function formatUrls(note: NoteRecord, key: string): React.ReactElement[] {
  return uniq(note.citations, (c: CitationRecord) => c.source.url)
    .sort((a, b) => (a.source.url < b.source.url ? -1 : 1))
    .map((c: CitationRecord, i) => <Url c={c} i={i} key={key} />)
}

const urlStyles = makeStyles((theme) => ({
  root: {
    fontSize: "smaller",
    marginTop: theme.spacing(0.2),
    marginLeft: theme.spacing(1),
  },
  url: {
    color: theme.palette.grey[500],
  },
}))

function Url({ c, i, key }: { c: CitationRecord; i: number; key: string }) {
  const classes = urlStyles()
  return (
    <Grid container key={i} spacing={1} className={classes.root}>
      <Grid item xs={6}>
        <Expando text={c.source.title} id={`${key}:${i}-title`} />
      </Grid>
      <Grid item xs={6} className={classes.url}>
        <Expando text={c.source.url} id={`${key}:${i}-url`} />
      </Grid>
    </Grid>
  )
}

function SorterOption({
  app,
  sorter,
  search,
}: {
  app: App
  sorter: Sorter
  search: AdHocQuery
}) {
  const selected =
    search.sorter === sorter.pk ||
    (search.sorter == null &&
      app.switchboard.index!.currentSorter === sorter.pk)
  return (
    <MenuItem
      key={sorter.pk}
      selected={selected}
      dense
      onClick={() => {
        search.sorter = sorter.pk
        app.setState({ search })
      }}
    >
      {sorter.name}
    </MenuItem>
  )
}

const noteDetailsStyles = makeStyles((theme) => ({}))

function SearchDetails({ app }: { app: App }) {
  const classes = noteDetailsStyles()
  const formClasses = formStyles()
  return (
    <>
      <T variant="h6" id="toc">
        Table of Contents
      </T>
      <Box m={2} ml={4}>
        <LinkDown to="overview" toc>
          Search Overview
        </LinkDown>
        <LinkDown to="saved" toc>
          Saved Searches
        </LinkDown>
        <LinkDown to="form" toc>
          The Search Form
        </LinkDown>
        <Box ml={2}>
          <LinkDown to="phrase" toc>
            Phrase
          </LinkDown>
          <Box ml={2}>
            <LinkDown to="details" toc>
              Details
            </LinkDown>
          </Box>
          <LinkDown to="projects" toc>
            Projects
          </LinkDown>
          <LinkDown to="tags" toc>
            Tags
          </LinkDown>
          <LinkDown to="time" toc>
            Time
          </LinkDown>
          <Box ml={2}>
            <LinkDown to="relative" toc>
              Relative
            </LinkDown>
            <LinkDown to="absolute" toc>
              Absolute
            </LinkDown>
          </Box>
          <LinkDown to="url" toc>
            URL
          </LinkDown>
        </Box>
        <LinkDown to="results" toc>
          Search Results
        </LinkDown>
        <Box ml={2}>
          <LinkDown to="linking" toc>
            Linking
          </LinkDown>
          <LinkDown to="done" toc>
            Done
          </LinkDown>
        </Box>
      </Box>
      {/* END TOC */}
      <T id="overview" variant="h6">
        Search Overview <LinkUp />
      </T>
      <p>Overview of the various parts of the search tab.</p>
      <T id="saved" variant="h6">
        Saved Searches <LinkUp />
      </T>
      <Box m={2}>
        <TextField label="Saved Searches" select fullWidth>
          {["Welsh", "yesterday", "last week"].map((n) => (
            <MenuItem dense key={n} value={n}>
              {n}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <p>
        The first widget you see on the search tab,{" "}
        <em>if you have any saved searches</em>, is the saved search dropdown.
        If you select a saved search this search will run and you will see the
        results below. The chief intended use of saved searches is to facilitate
        creating{" "}
        <TabLink tab="cards" app={app}>
          flashcard stacks
        </TabLink>{" "}
        with which you can quiz yourself.
      </p>
      <p>
        If you run a search <em>and you find something</em> two new icons will
        appear beside the search and clear buttons:
      </p>
      <Box mt={1} mb={1}>
        <Grid container justify="center">
          <IconButton className={formClasses.inCentered}>
            <TT msg="save search">
              <Save color="primary" />
            </TT>
          </IconButton>
          <Button
            color="primary"
            className={formClasses.inCentered}
            variant="contained"
            endIcon={<SearchIcon />}
          >
            Search
          </Button>
          <Button
            color="secondary"
            className={formClasses.inCentered}
            variant="contained"
          >
            Clear
          </Button>
          <IconButton className={formClasses.inCentered}>
            <TT msg="make search results into flash card stack">
              <School color="primary" />
            </TT>
          </IconButton>
        </Grid>
      </Box>
      <p>
        The first of these, <Save color="primary" fontSize="small" />, allows
        you to save the search. The second,{" "}
        <School color="primary" fontSize="small" />, takes you to the flashcard
        stack built from this search.
      </p>
      <T id="form" variant="h6">
        The Search Form <LinkUp />
      </T>
      <p>etc.</p>
      <strong id="phrase">
        Phrase <LinkUp />
      </strong>
      <p></p>
      <strong id="details">
        Details <LinkUp />
      </strong>
      <p></p>
      <strong id="projects">
        Projects <LinkUp />
      </strong>
      <p></p>
      <strong id="tags">
        Tags <LinkUp />
      </strong>
      <p></p>
      <strong id="time">
        Time <LinkUp />
      </strong>
      <p></p>
      <strong id="relative">
        relative time <LinkUp />
      </strong>
      <p></p>
      <strong id="absolute">
        absolute time <LinkUp />
      </strong>
      <p></p>
      <strong id="url">
        URL <LinkUp />
      </strong>
      <p></p>
      <T id="results" variant="h6">
        Search Results <LinkUp />
      </T>
      <DocResult note={bogusNote({})} project={bogusProject({})} app={app}/>
      <strong id="linking">
        Linking <LinkUp />
      </strong>
      <p></p>
      <strong id="done">
        Done <LinkUp />
      </strong>
      <p></p>
      <AboutLink app={app} />
    </>
  )
}

function RelationModal({
  app,
  currentNote,
  setCurrentNote,
  relation,
  setRelation,
}: {
  app: App
  currentNote: NoteRecord | null
  setCurrentNote: (n: NoteRecord | null) => void
  relation: string
  setRelation: (r: string) => void
}) {
  if (!currentNote) return <></>
  const cn = app.currentNote()!
  const note = currentNote
  // maybe not the most efficient, but easy to conceptualize;
  const parseRelation = (
    r: string
  ): {
    headRole: string
    dependentRole: string
    reversed: boolean
  } | null => {
    const [left, right] = r.split("-")
    const relations = app.switchboard.index!.findProject(note.key[0])![1]
      .relations
    for (const [headRole, dependentRole] of relations) {
      if (headRole === left && dependentRole === (right || left)) {
        return { headRole, dependentRole, reversed: false }
      } else if (dependentRole === left) {
        return { headRole, dependentRole, reversed: true }
      }
    }
    return null
  }
  const parsedRelation = parseRelation(relation)!
  console.log(parsedRelation)
  const message = `link "${notePhrase(note)}" to "${notePhrase(cn)}"`
  const [r1, r2] = parsedRelation.reversed
    ? [parsedRelation.dependentRole, parsedRelation.headRole]
    : [parsedRelation.headRole, parsedRelation.dependentRole]
  const relationMap = new Map<
    string,
    { headRole: string; dependentRole: string; reversed: boolean }
  >()
  app.switchboard
    .index!.findProject(note.key[0])![1]
    .relations.forEach(([headRole, dependentRole]) => {
      relationMap.set(nameRelation(headRole, dependentRole), {
        headRole,
        dependentRole,
        reversed: false,
      })
      if (headRole !== dependentRole) {
        relationMap.set(nameRelation(dependentRole, headRole), {
          headRole,
          dependentRole,
          reversed: true,
        })
      }
    })
  const relate = () => {
    const [n1, n2] = parsedRelation.reversed ? [cn, note] : [note, cn]
    app.switchboard.index
      ?.relate(
        { phrase: n1.key, role: parsedRelation.headRole },
        { phrase: n2.key, role: parsedRelation.dependentRole }
      )
      .then(({ head }) => {
        const history: Visit[] = deepClone(app.state.history)
        const { current } = history[app.state.historyIndex]!
        current.relations = head.relations
        app.setState({ history }, () => {
          app.cleanSearch()
          app.cleanHistory(true)
          app.success(
            `linked ${notePhrase(note)} to ${notePhrase(
              cn
            )} via relation ${nameRelation(r1, r2)}`
          )
          setCurrentNote(null)
        })
      })
      .catch((e) => app.error(e))
  }
  return (
    <>
      <Dialog
        open={!!currentNote}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <DialogTitle id="confirm-dialog-title">{message}</DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-dialog-description">
            <p>
              What is the relation of "{notePhrase(note)}" to "{notePhrase(cn)}
              "?
            </p>
            <TextField
              select
              label="Relation"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              fullWidth
            >
              {Array.from(relationMap.keys()).map((n) => (
                <MenuItem dense value={n} key={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCurrentNote(null)}>Cancel</Button>
          <Button onClick={relate} color="primary" autoFocus>
            Ok
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
