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
  bogusCitation,
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
  SearchStrictness,
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
        {paginate && (
          <div className={classes.pagination}>
            <Pagination
              count={Math.ceil(results.length / 10)}
              size="small"
              page={page}
              siblingCount={0}
              onChange={(_e, p) => setPage(p)}
            />
          </div>
        )}
        {pagedResults.map((r) => (
          <Result note={r} app={app} setCurrentNote={setCurrentNote} />
        ))}
        {paginate && (
          <div className={classes.pagination}>
            <Pagination
              count={Math.ceil(results.length / 10)}
              size="small"
              page={page}
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
    <ResultsInfoWidget
      offset={offset}
      end={end}
      total={results.length}
      showSample={showSample}
      setShowSample={setShowSample}
      sample={sample}
      setSample={setSample}
      sampleType={sampleType}
      setSampleType={setSampleType}
      sampling={!!search.sample}
      doSample={() => {
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
      doShowAll={() => {
        const s: AdHocQuery = deepClone(search)
        delete s.sample
        delete s.sampleType
        delete s.seed
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
    />
  )
}

// factored out of ResultsInfo to facilitate discussing this in help text
const ResultsInfoWidget: React.FC<{
  offset: number
  end: number
  total: number
  doSample: () => void
  showSample: boolean
  setShowSample: (b: boolean) => void
  sampling: boolean
  doShowAll: () => void
  sample: number
  setSample: (n: number) => void
  sampleType: SampleType
  setSampleType: (t: SampleType) => void
}> = ({
  offset,
  end,
  total,
  doSample,
  showSample,
  setShowSample,
  sampling,
  doShowAll,
  sample,
  setSample,
  sampleType,
  setSampleType,
}) => {
  return (
    <>
      <Grid container justify="center" alignItems="center" spacing={2}>
        <Grid item>
          Notes {(offset + 1).toLocaleString()} <>&ndash;</>{" "}
          {end.toLocaleString()} of {total.toLocaleString()}
        </Grid>
        {sampling && (
          <Grid item>
            <IconButton size="small" onClick={doShowAll}>
              <TT msg="show all">
                <AllInclusive color="primary" fontSize="small" />
              </TT>
            </IconButton>
          </Grid>
        )}
        {!sampling && total > 10 && (
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
            <Button color="primary" variant="outlined" onClick={doSample}>
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
      <PhraseWidget
        defaultSorter={
          app.switchboard.index!.sorters.get(
            search.sorter ?? app.switchboard.index!.currentSorter
          )!
        }
        currentSorter={app.switchboard.index!.currentSorter}
        showSearchDetails={showSearchDetails}
        onStrictnessChange={(v) => {
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
        setShowSearchDetails={setShowSearchDetails}
        onPhraseChange={(event) => {
          if (nws(event.target.value)) {
            search.phrase = event.target.value
          } else {
            delete search.phrase
          }
          app.setState({ search })
        }}
        onSorterClick={(s) => {
          search.sorter = s.pk
          app.setState({ search })
        }}
        sorters={Array.from(app.switchboard.index!.sorters.values())}
        search={search}
        showSorter={showSorter}
      >
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
        <TimeWidget
          relativeTime={relativeTime}
          relativePeriod={relativePeriod}
          relativeInterpretation={relativeInterpretation}
          after={after}
          before={before}
          onChangeRelativeTime={() => {
            search.relativeTime = !relativeTime
            app.setState({ search })
          }}
          onChangeRelativeInterpretation={() => {
            search.relativeInterpretation =
              relativeInterpretation === "on" ? "since" : "on"
            app.setState({ search })
          }}
          onChangeRelativePeriod={(event) => {
            search.relativePeriod = event.target.value as RelativePeriod
            app.setState({ search })
          }}
          onChangeAfter={(e) => {
            search = deepClone(search)
            if (e.target.value) {
              search.after = new Date(e.target.value)
            } else {
              delete search.after
            }
            app.setState({ search })
          }}
          onChangeBefore={(e) => {
            search = deepClone(search)
            if (e.target.value) {
              search.before = new Date(e.target.value)
            } else {
              delete search.before
            }
            app.setState({ search })
          }}
        />
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
      </PhraseWidget>

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

// the bit of the search form showing time searching widgets
// factored out of the form so that it can be included in both the form and the help text
const TimeWidget: React.FC<{
  relativeTime: boolean
  onChangeRelativeTime: () => void
  relativeInterpretation: "on" | "since"
  relativePeriod: RelativePeriod
  onChangeRelativeInterpretation: () => void
  onChangeRelativePeriod: (
    e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => void
  after: Date | undefined
  before: Date | undefined
  onChangeAfter: (
    e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => void
  onChangeBefore: (
    e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => void
}> = ({
  relativeTime,
  onChangeRelativeTime,
  relativeInterpretation,
  relativePeriod,
  onChangeRelativeInterpretation,
  onChangeRelativePeriod,
  after,
  before,
  onChangeAfter,
  onChangeBefore,
}) => {
  const classes = formStyles()
  return (
    <>
      {" "}
      <Grid container justify="center" className={classes.time}>
        <Grid item>
          <Grid component="label" container alignItems="center" spacing={1}>
            <Grid item>Relative Time</Grid>
            <Grid item>
              <Switch checked={!relativeTime} onChange={onChangeRelativeTime} />
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
            <Grid component="label" container alignItems="center" spacing={1}>
              <Grid item>Since</Grid>
              <Grid item>
                <Switch
                  checked={relativeInterpretation === "on"}
                  disabled={
                    relativeInterpretation === "since" &&
                    relativePeriod === "ever"
                  }
                  onChange={onChangeRelativeInterpretation}
                />
              </Grid>
              <Grid item>On</Grid>
            </Grid>
          </Grid>
          <Grid item>
            <TextField
              onChange={onChangeRelativePeriod}
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
            InputLabelProps={{ shrink: true }} 
            value={ymd(after)}
            onChange={onChangeAfter}
          />
          <TextField
            id="before"
            label="Before"
            type="date"
            InputLabelProps={{ shrink: true }} 
            value={ymd(before)}
            onChange={onChangeBefore}
          />
        </Grid>
      )}
    </>
  )
}

// the bit of the search form showing the phrase, strictness radios, sorters, and further details
// factored out of the form so that it can be included in both the form and the help text
const PhraseWidget: React.FC<{
  showSearchDetails: boolean
  setShowSearchDetails: (v: boolean) => void
  onPhraseChange: (
    event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => void
  onStrictnessChange: (v: React.ChangeEvent<HTMLInputElement>) => void
  onSorterClick: (s: Sorter) => void
  search: AdHocQuery
  defaultSorter: Sorter
  currentSorter: number
  sorters: Sorter[]
  showSorter: boolean
  children: React.ReactNode
}> = ({
  defaultSorter,
  currentSorter,
  showSearchDetails,
  onStrictnessChange,
  setShowSearchDetails,
  onPhraseChange,
  onSorterClick,
  sorters,
  search,
  showSorter,
  children,
}) => {
  const classes = formStyles()
  const { phrase, strictness = "exact" } = search
  return (
    <>
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
            fullWidth
            value={phrase || ""}
            onChange={onPhraseChange}
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
                  onChange={onStrictnessChange}
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
                    label={`similar (${defaultSorter.name})`}
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
                  {sorters
                    .sort((a, b) => (a.name < b.name ? -1 : 1))
                    .map((s) => (
                      <MenuItem
                        key={s.pk}
                        selected={
                          search.sorter === s.pk ||
                          (search.sorter == null && currentSorter === s.pk)
                        }
                        dense
                        onClick={() => onSorterClick(s)}
                      >
                        {s.name}
                      </MenuItem>
                    ))}
                </TextField>
              )}
            </Grid>
          </Grid>
        </div>
      )}
      {showSearchDetails && children}
    </>
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

const noteDetailsStyles = makeStyles((theme) => ({
  dl: {
    "& dt": {
      fontWeight: theme.typography.fontWeightBold,
    },
  },
  done: {
    color: theme.palette.success.dark,
  },
}))

function SearchDetails({ app }: { app: App }) {
  const classes = noteDetailsStyles()
  const formClasses = formStyles()
  // some bogus stuff needed to show a demo phrase widget
  const [showSearchDetails, setShowSearchDetails] = useState(false)
  const [search, setSearch] = useState<AdHocQuery>({
    type: "ad hoc",
    phrase: "",
  })
  const [showSorter, setShowSorter] = useState(false)
  const demoSorters: Sorter[] = [
    {
      pk: -1,
      name: "foo",
      description: "",
      metric: (a: string, b: string) => 0,
    },
    {
      pk: -2,
      name: "bar",
      description: "",
      metric: (a: string, b: string) => 0,
    },
    {
      pk: -4,
      name: "baz",
      description: "",
      metric: (a: string, b: string) => 0,
    },
  ]
  // some bogus stuff needed to show the time widget
  const [after, setAfter] = useState<Date | undefined>(undefined)
  const [before, setBefore] = useState<Date | undefined>(undefined)
  const [relativeTime, setRelativeTime] = useState(true)
  const [relativeInterpretation, setRelativeInterpretation] = useState<
    "on" | "since"
  >("since")
  const [relativePeriod, setRelativePeriod] = useState<RelativePeriod>("ever")
  return (
    <>
      <p>The search tab allows one to find and link together notes.</p>
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
            <Box ml={2}>
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
          </Box>
        </Box>
        <LinkDown to="results" toc>
          Search Results
        </LinkDown>
        <Box ml={2}>
          <LinkDown to="sampling" toc>
            Sampling
          </LinkDown>
          <LinkDown to="card" toc>
            Result Card
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
      </Box>
      {/* END TOC */}
      <T id="overview" variant="h6">
        Search Overview <LinkUp />
      </T>
      <p>
        At its simplest, searching is just for finding notes: you find notes so
        you can review them. From this starting point, though, searching gets
        very complicated.
      </p>
      <ul>
        <li>
          You can <LinkDown to="saved">save searches</LinkDown> that you use
          frequently.
        </li>
        <li>
          You can use search results as a{" "}
          <TabLink app={app} tab="cards">
            flashcard stack
          </TabLink>
          .
        </li>
        <li>
          If you are already looking at a{" "}
          <TabLink app={app} tab="note">
            note
          </TabLink>
          , you can link results to this note.
        </li>
      </ul>
      <p>
        The principle parts of the search tab are the{" "}
        <LinkDown to="saved">saved search</LinkDown> selector, the{" "}
        <LinkDown to="form">search form</LinkDown>, and the{" "}
        <LinkDown to="results">search results</LinkDown>.
      </p>
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
        If you select a saved search this search will run and you will see the{" "}
        <LinkDown to="results">results</LinkDown> below. The chief intended use
        of saved searches is to facilitate creating{" "}
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
      <p>
        Because notes are complicated, having gists and URLs and tags and
        projects and so forth, the search form is necessarily complicated.
        However, to better manager limited space and reduce confusion only those
        parts of the farm which are possible to use are ever shown. If you have
        only one project, the projects section is not shown. If you have used no
        tags, you will not be allowed to search by tag. These portions of the
        form are not disabled but hidden altogether. This means that initially
        the search form will appear quite simple.
      </p>
      <strong id="phrase">
        Phrase <LinkUp />
      </strong>
      <Box m={2}>
        <PhraseWidget
          sorters={demoSorters}
          currentSorter={search.sorter ?? demoSorters[0].pk}
          defaultSorter={
            demoSorters.find((s) => s.pk === search.sorter) ?? demoSorters[0]
          }
          search={search}
          showSearchDetails={showSearchDetails}
          setShowSearchDetails={setShowSearchDetails}
          showSorter={showSorter}
          onSorterClick={(s) => {
            setSearch({ ...search, sorter: s.pk })
          }}
          onStrictnessChange={(e) => {
            const strictness = e.target.value as SearchStrictness
            setShowSorter(strictness === "similar")
            setSearch({ ...search, strictness })
          }}
          onPhraseChange={(e) => {
            setSearch({ ...search, phrase: e.target.value })
          }}
        >
          <Box mt={2}>
            Now you can tinker with further search{" "}
            <LinkDown to="details">details</LinkDown>
          </Box>
        </PhraseWidget>
      </Box>
      <p>
        The phrase field allows you to search for the citations notes are based
        around. If you enter text into this field you will see that there are
        three varieties of phrase search.
      </p>
      <dl className={classes.dl}>
        <dt>exact</dt>
        <dd>
          An exact search looks for an exact match to a{" "}
          <em>minimally normalized</em> version of the phrase sought: case and
          whitespace differences are ignored. If you search for <i>absicht</i>{" "}
          you may find a note on <i>Absicht</i>.
        </dd>
        <dt>fuzzy</dt>
        <dd>
          A fuzzy search looks for the letters you have typed in the order you
          have typed them in (after minimial normalization). If you do a fuzzy
          phrase search for <i>cat</i> you may get back <i>Caniatáu</i>.
        </dd>
        <dt>similar</dt>
        <dd>
          A similar search returns the notes found sorted by their similarity to
          the search phrase based on the{" "}
          <TabLink app={app} tab="sorters">
            sorter
          </TabLink>{" "}
          chosen.
        </dd>
      </dl>
      <strong id="details">
        Details <LinkUp />
      </strong>
      <p>
        The &ldquo;details&rdquo; are just further things one might search for
        besides the <LinkDown to="phrase">phrase</LinkDown>. They can be hidden
        to reduce the clutter and complexity of the search form. The details are
        just the <LinkDown to="projects">projects</LinkDown>,{" "}
        <LinkDown to="tags">tags</LinkDown>, <LinkDown to="time">time</LinkDown>
        , and <LinkDown to="url">URL</LinkDown>.
      </p>
      <strong id="projects">
        Projects <LinkUp />
      </strong>
      <p>
        If you have more than one{" "}
        <TabLink app={app} tab="projects">
          project
        </TabLink>
        , the search form <LinkDown to="details">details</LinkDown> will allow
        you to filter results by project. Otherwise, this section is hidden.
      </p>
      <strong id="tags">
        Tags <LinkUp />
      </strong>
      <p>
        If you have tagged any notes, the search form{" "}
        <LinkDown to="details">details</LinkDown> will allow you to filter
        results by tag. Otherwise, this section is hidden.
      </p>
      <strong id="time">
        Time <LinkUp />
      </strong>
      <Box m={2}>
        <TimeWidget
          after={after}
          before={before}
          relativeTime={relativeTime}
          relativePeriod={relativePeriod}
          relativeInterpretation={relativeInterpretation}
          onChangeRelativeTime={() => setRelativeTime(!relativeTime)}
          onChangeAfter={(e) => {
            if (e.target.value) {
              setAfter(new Date(e.target.value))
            } else {
              setAfter(undefined)
            }
          }}
          onChangeRelativeInterpretation={() =>
            setRelativeInterpretation(
              relativeInterpretation === "on" ? "since" : "on"
            )
          }
          onChangeBefore={(e) => {
            if (e.target.value) {
              setBefore(new Date(e.target.value))
            } else {
              setBefore(undefined)
            }
          }}
          onChangeRelativePeriod={(e) =>
            setRelativePeriod(e.target.value as RelativePeriod)
          }
        />
      </Box>
      <p>
        You can search for notes based on the time you added a citation. You can
        search either based on how recently the notes were taken relative to
        now&mdash;&ldquo;relative time&rdquo;&mdash;or based on the precise
        moment they were taken&mdash;&ldquo;absolute time&rdquo;.
      </p>
      <strong id="relative">
        relative time <LinkUp />
      </strong>
      <p>
        Relative time is the time relative to the moment of searching. If you
        are searching by relative time you must search within a fixed set of
        periods: yesterday, two days ago, within the last week, within the last
        month, etc. If you can't find the period you want in the list you will
        have to use an <LinkDown to="absolute">absolute time search</LinkDown>.
      </p>
      <p>
        With relative time searches you also have the choice of whether you are
        searching for something &ldquo;on&rdquo; the relative period or
        &ldquo;since&rdquo; the period. &ldquo;Since&rdquo; is straightforward.
        Searching for notes since yesterday is searching for notes with
        citations added since the first second of yesterday up to now.
        &ldquo;On&rdquo; requires some explanation. A note taken &ldquo;on
        yesterday&rdquo; is a note with a citation added sometime between the
        first second of yesterday and the last second of yesterday. Notes taken
        today are not included. So an &ldquo;on&rdquo; search has an implicit
        period in addition to the relative period you choose from the list. For
        most relative periods this is just a day. A search for notes taken a on
        a week ago is asking for notes taken in a period of a day where the
        first moment of that day is a week before the first moment of today. If
        the relative period is a month ago, though, the implicit period is a
        week. If it's longer than a month ago, if it's a year ago, the implicit
        period is a month.
      </p>
      <p>
        The default time search is a relative search since &ldquo;ever&rdquo;.
        This doesn't filter notes at all. Because you can't search &ldquo;on
        ever&rdquo;, because this doesn't make sense, you can't change the
        on&ndash;ever toggle to &ldquo;on&rdquo; as long as the period is
        &ldquo;ever&rdquo;. Likewise, if the toggle is on &ldquo;on&rdquo; you
        can't choose the period &ldquo;ever&rdquo;.
      </p>
      <strong id="absolute">
        absolute time <LinkUp />
      </strong>
      <p>
        Absolute time searches are searches for notes with citations added after
        a particular date, before a particular date, or between two dates.
      </p>
      <strong id="url">
        URL <LinkUp />
      </strong>
      <p>
        A URL search finds notes taken on a particular page. If you open up
        Amanuensis with no text highlighted, instead of opening up a note to
        edit Amanuensis will do a URL search for notes taken on the current
        page.
      </p>
      <p>
        For a URL search to match you only need the search term to be a
        substring of a page. For instance, if you are searching for notes taken
        on some BBC page it may suffice to put "bbc" in the URL field, since all
        BBC pages will have "bbc" in their URL.
      </p>
      <T id="results" variant="h6">
        Search Results <LinkUp />
      </T>
      <Box m={2}>
        <DemoResultsInfoWidgett />
        <Grid container item justify="center" alignItems="center">
          <i>pagination omitted</i>
        </Grid>
        <DocResult note={bogusNote({})} project={bogusProject({})} app={app} />
      </Box>
      <p>
        The search results are displayed below the search form as a list of
        <LinkDown to="card">&ldquo;cards&rdquo;</LinkDown> surrounded by some{" "}
        <LinkDown to="sampling">pagination information</LinkDown>.
      </p>
      <strong id="sampling">
        Sampling <LinkUp />
      </strong>
      <Box m={2}>
        <DemoResultsInfoWidgett />
      </Box>
      <p>
        For the most part the pagination of the results should be familiar.
        Because there can be many results, they are displayed in pages. There
        are widgets above and below the list of results that you can use to go
        from page to page. At the top there is some summary information: which
        notes the current page is showing and how many notes there are
        altogether. What will be unfamiliar is the sampling form you can find if
        you click the <CardGiftcard color="primary" fontSize="small" /> to the
        right of the summary information.
      </p>
      <p>
        The purpose of sampling is to facilitate turning search results into a{" "}
        <TabLink app={app} tab="cards">
          flash card stack
        </TabLink>
        . If there are many results, you can extract a sample of them to quiz
        yourself on. The sample can be random, &ldquo;hard&rdquo;, or
        &ldquo;novel&rdquo;. A random sample is just that: a random selection of
        the search results. A hard sample is made by sorting the cards by how
        frequently you successfully quizzed yourself on them and showing the
        ones you had least success with. A novel sample is a random sample of
        those cards you have never quizzed yourself on at all.
      </p>
      <p>
        The sampling form only appears when the search returns more results than
        will fit on a single page. Samples are always based on the original
        search results. If you take a random sample and then a hard sample, the
        second sample will not necessarily be a subset of the first. To return
        to the full search results you can click the{" "}
        <AllInclusive color="primary" fontSize="small" /> icon that appears
        beside the summary information when one is looking at a sample.
      </p>
      <strong id="card">
        Result Card <LinkUp />
      </strong>
      <Box m={2}>
        <DocResult note={bogusNote({})} project={bogusProject({})} app={app} />
      </Box>
      <p>
        A result card is meant to provide a summary of a note. The pieces are
        for the most part self-explanatory: phrase, gist, project, citation
        dates, citations, the citations being listed by title and URL. In order
        to keep the cards small these pieces may be truncated, but you will find
        if you click them that a popup appears containing the full text.
      </p>
      <p>
        The <Visibility color="secondary" fontSize="small" /> icon will take you
        to the{" "}
        <TabLink app={app} tab="note">
          note tab
        </TabLink>{" "}
        where the full note will be displayed.
      </p>
      <strong id="linking">
        Linking <LinkUp />
      </strong>
      <Box m={2}>
        <DocResult
          note={bogusNote({
            key: [0, 0],
            citations: [bogusCitation({ phrase: "cat" })],
          })}
          cn={bogusNote({
            key: [1, 1],
            citations: [bogusCitation({ phrase: "dog" })],
          })}
          project={bogusProject({})}
          app={app}
        />
      </Box>
      <p>
        The only place where you can create links between notes is in the search
        results. The links are alwys between whatever note is currently
        displayed in the{" "}
        <TabLink app={app} tab="note">
          note tab
        </TabLink>{" "}
        and other notes. To create a link you click the{" "}
        <Link color="primary" fontSize="small" /> icon. See the{" "}
        <TabLink app={app} tab="projects">
          project tab
        </TabLink>{" "}
        for how to create different relations with which to label these links.
      </p>
      <strong id="done">
        Done <LinkUp />
      </strong>
      <Box m={2}>
        <DocResult
          note={bogusNote({ done: true })}
          project={bogusProject({})}
          app={app}
        />
      </Box>
      <p>
        When using a{" "}
        <TabLink app={app} tab="cards">
          flashcard stack
        </TabLink>{" "}
        one has the opportunity to mark a card as &ldquo;done&rdquo;. This means
        the card should be excluded from future flashcard stacks because you
        have learned it by heart (or you simply don't want it to be included in
        flashcard stacks). The{" "}
        <Done fontSize="small" className={classes.done} /> icon marks notes that
        are done. If you click it you can reset their status, removing the mark.
      </p>
      <p></p>
      <AboutLink app={app} />
    </>
  )
}

function DemoResultsInfoWidgett() {
  const originalOffset = 100
  const originalEnd = 110
  const originalTotal = 3000
  const [offset, setOffset] = useState(originalOffset)
  const [end, setEnd] = useState(originalEnd)
  const [total, setTotal] = useState(originalTotal)
  const [sample, setSample] = useState(1)
  const [sampleType, setSampleType] = useState<SampleType>("random")
  const [showSample, setShowSample] = useState(false)
  const [sampling, setSampling] = useState(false)
  const doSample = () => {
    setOffset(0)
    setEnd(sample < 10 ? sample : 10)
    setTotal(sample)
    setSampling(true)
    setShowSample(false)
  }
  const doShowAll = () => {
    setOffset(originalOffset)
    setEnd(originalEnd)
    setTotal(originalTotal)
    setSampling(false)
    setShowSample(false)
  }
  return (
    <ResultsInfoWidget
      offset={offset}
      end={end}
      total={total}
      sample={sample}
      setSample={setSample}
      sampleType={sampleType}
      setSampleType={setSampleType}
      showSample={showSample}
      setShowSample={setShowSample}
      sampling={sampling}
      doSample={doSample}
      doShowAll={doShowAll}
    />
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
