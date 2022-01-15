import { App } from "./App"
import { any, nws, squish } from "./modules/util"
import {
  AboutLink,
  Details,
  LinkAway,
  LinkDown,
  LinkUp,
  Mark,
  TabLink,
  TT,
} from "./modules/components"
import {
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  makeStyles,
  TextField,
  Typography as T,
} from "@material-ui/core"
import { useState } from "react"
import { Sorter } from "./modules/types"
import { AddBoxRounded, Clear, Edit, FilterList } from "@material-ui/icons"
import { Autocomplete } from "@material-ui/lab"
import { deepClone } from "./modules/clone"

interface SortingProps {
  app: App
}

const sortingStyles = makeStyles((theme) => ({
  root: {},
  results: {
    marginTop: theme.spacing(3),
  },
  text: {
    width: "100%",
  },
  adfixes: {
    marginTop: theme.spacing(1),
  },
  noNotes: {
    display: "table",
    margin: "0 auto",
    fontStyle: "italic",
  },
}))

const nullSorter: Sorter = {
  pk: -1,
  name: "",
  description: "",
  metric: (a, b) => 0,
}

function Sorting({ app }: SortingProps) {
  const classes = sortingStyles()
  const knownSorters = deepClone(
    Array.from(app.switchboard.index!.sorters.values())
  ).sort((a: Sorter, b: Sorter) => a.pk - b.pk)
  const [sorts, setSorts] = useState<Sorter[]>(knownSorters)
  const [editedSort, setEditedSort] = useState<Sorter | null>(null)
  const [df, setDf] = useState(app.switchboard.index!.currentSorter)

  const nameError: string = (function () {
    if (editedSort === null) return ""
    if (!nws(editedSort.name)) return "required"
    const n = squish(editedSort.name)
    if (any(sorts, (s: Sorter) => s.pk !== editedSort.pk && s.name === n))
      return "not unique"
    return ""
  })()
  return (
    <div className={classes.root}>
      <SortingDetails app={app} />
      {sorts.map((s) => (
        <SorterCard
          app={app}
          sorter={s}
          defaultSorter={df}
          setDefaultSorter={setDf}
          sorts={sorts}
          setSorts={setSorts}
          setEditedSorter={setEditedSort}
        />
      ))}
      <T align="right">
        <IconButton
          color="primary"
          onClick={() => setEditedSort(deepClone(nullSorter))}
        >
          <TT msg="create a new sorter">
            <AddBoxRounded fontSize="large" />
          </TT>
        </IconButton>
      </T>
      <Dialog open={!!editedSort}>
        <DialogTitle>
          {editedSort === null
            ? ""
            : editedSort.pk === -1
            ? "Create a new sorter"
            : `Edit sorter ${editedSort.name}`}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            placeholder="A unique identifier"
            className={classes.text}
            value={editedSort?.name || undefined}
            error={!!nameError}
            helperText={nameError}
            onChange={(e) => {
              const es: Sorter = deepClone(editedSort!)
              es.name = e.target.value
              setEditedSort(es)
            }}
          />
          <TextField
            label="Description"
            placeholder="What is this for?"
            className={classes.text}
            value={editedSort?.description || undefined}
            onChange={(e) => {
              const es: Sorter = deepClone(editedSort!)
              es.description = e.target.value
              setEditedSort(es)
            }}
          />
          <Grid container spacing={2} className={classes.adfixes}>
            <Grid container item xs>
              <TextField
                label="Prefix"
                type="number"
                InputLabelProps={{ shrink: true }}
                InputProps={{ inputProps: { min: 0, step: 1 } }}
                value={editedSort?.prefix || 0}
                onChange={(e) => {
                  const es: Sorter = deepClone(editedSort!)
                  const prefix = e.target.value
                    ? Number.parseInt(e.target.value)
                    : 0
                  es.prefix = prefix
                  setEditedSort(es)
                }}
              />
            </Grid>
            <Grid container item xs>
              <TextField
                label="Suffix"
                type="number"
                InputLabelProps={{ shrink: true }}
                InputProps={{ inputProps: { min: 0, step: 1 } }}
                value={editedSort?.suffix || 0}
                onChange={(e) => {
                  const es: Sorter = deepClone(editedSort!)
                  const suffix = e.target.value
                    ? Number.parseInt(e.target.value)
                    : 0
                  es.suffix = suffix
                  setEditedSort(es)
                }}
              />
            </Grid>
          </Grid>
          <TextField
            label="Insertables"
            className={classes.text}
            value={editedSort?.insertables || ""}
            onChange={(e) => {
              const es: Sorter = deepClone(editedSort!)
              es.insertables = e.target.value
              setEditedSort(es)
            }}
          />
          <Autocomplete
            value={editedSort?.similars || []}
            options={editedSort?.similars || []}
            onChange={(_event, choices) => {
              const es: Sorter = deepClone(editedSort!)
              es.similars = choices
              setEditedSort(es)
            }}
            multiple
            freeSolo
            autoComplete
            renderInput={(params) => (
              <TextField
                {...params}
                label="Convertibles"
                placeholder="letters that change into each other"
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((obj, index) => (
                <Chip
                  variant="outlined"
                  size="small"
                  label={obj}
                  {...getTagProps({ index })}
                />
              ))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditedSort(null)}>Cancel</Button>
          <Button
            color="primary"
            autoFocus
            disabled={!!nameError}
            onClick={() => {
              if (editedSort!.pk === -1) {
                app.switchboard
                  .index!.saveSorter(editedSort!)
                  .then((pk) => {
                    editedSort!.pk = pk
                    const newSorts: Sorter[] = deepClone(sorts)
                    newSorts.push(editedSort!)
                    setSorts(newSorts)
                    app.success(`Created sorter ${editedSort!.name}`)
                    setEditedSort(null)
                  })
                  .catch((e) => app.error(e))
              } else {
                app.switchboard
                  .index!.saveSorter(editedSort!)
                  .then((pk) => {
                    const newSorts: Sorter[] = deepClone(sorts)
                    const i = newSorts.findIndex((s: Sorter) => s.pk === pk)
                    newSorts[i] = editedSort!
                    setSorts(newSorts)
                    app.success(`Edited sorter ${editedSort!.name}`)
                    setEditedSort(null)
                  })
                  .catch((e) => app.error(e))
              }
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}

export default Sorting

const sorterStyles = makeStyles((theme) => ({
  root: {
    marginTop: theme.spacing(1),
    "&:first-child": {
      marginTop: 0,
    },
  },
  title: {
    fontSize: 14,
  },
  description: {
    margin: theme.spacing(1),
  },
  actions: {
    marginTop: theme.spacing(1),
    flexDirection: "row-reverse",
  },
  insertables: {
    width: "100%",
  },
}))

type SorterCardProps = {
  app: App
  sorter: Sorter
  defaultSorter: number
  setDefaultSorter: (pk: number) => void
  sorts: Sorter[]
  setSorts: (props: Sorter[]) => void
  setEditedSorter: (s: Sorter) => void
}
function SorterCard({
  app,
  sorter,
  defaultSorter,
  setDefaultSorter,
  sorts,
  setSorts,
  setEditedSorter,
}: SorterCardProps) {
  const classes = sorterStyles()
  const isDefaultSorter = sorter.pk === 0
  const handleStarClick = () => {
    if (sorter.pk !== defaultSorter) {
      app.switchboard
        .index!.setDefaultSorter(sorter.pk)
        .then(() => setDefaultSorter(sorter.pk))
    }
  }
  return (
    <Grid item xs={12} key={sorter.pk} className={classes.root}>
      <Card variant="outlined">
        <CardContent style={{ paddingBottom: 0 }}>
          <Grid container spacing={1}>
            <Grid container item xs>
              <T className={classes?.title} component="h2">
                {sorter.name}
              </T>
            </Grid>
            <Grid container item xs>
              <T align="right" style={{ width: "100%" }}>
                <TT
                  wrap
                  msg={
                    sorter.pk === defaultSorter
                      ? "default sorter"
                      : "make default sorter"
                  }
                >
                  <Mark
                    starred={sorter.pk === defaultSorter}
                    onClick={handleStarClick}
                  />
                </TT>
              </T>
            </Grid>
          </Grid>
          <T variant="body2" className={classes.description} gutterBottom>
            {sorter.description}
          </T>
          <Grid container spacing={2}>
            <Grid container item xs={3}>
              <TextField
                label="Prefix"
                type="number"
                disabled
                InputLabelProps={{ shrink: true }}
                value={sorter.prefix || 0}
              />
            </Grid>
            <Grid container item xs={3}>
              <TextField
                label="Suffix"
                type="number"
                disabled
                InputLabelProps={{ shrink: true }}
                value={sorter.suffix || 0}
              />
            </Grid>
            <Grid container item xs={6}>
              <TextField
                label="Insertables"
                className={classes.insertables}
                InputLabelProps={{ shrink: !!sorter.insertables }}
                disabled
                value={sorter.insertables}
              />
            </Grid>
          </Grid>
          <Autocomplete
            value={sorter.similars || []}
            options={sorter.similars || []}
            onChange={(_event, choices) => {}}
            disabled
            multiple
            freeSolo
            autoComplete
            renderInput={(params) => (
              <TextField
                {...params}
                label="Convertibles"
                placeholder="letters that change into each other"
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((obj, index) => (
                <Chip
                  variant="outlined"
                  size="small"
                  label={obj}
                  {...getTagProps({ index })}
                />
              ))
            }
          />
        </CardContent>
        <CardActions className={classes.actions}>
          {!isDefaultSorter && (
            <>
              <Button
                size="small"
                onClick={() => {
                  app.confirm({
                    title: `Delete Sorter ${sorter.name}`,
                    ok: "Delete",
                    text: `Are you sure you wish to delete the ${sorter.name} sorter? This cannot be undone.`,
                    callback: () => {
                      return new Promise((resolve, reject) => {
                        app.switchboard
                          .index!.deleteSorter(sorter)
                          .then(() => {
                            const newSorters: Sorter[] = deepClone(sorts)
                            const i = newSorters.findIndex(
                              (s: Sorter) => s.pk === sorter.pk
                            )
                            newSorters.splice(i, 1)
                            setSorts(newSorters)
                            if (
                              app.state.search.type === "ad hoc" &&
                              app.state.search.sorter === sorter.pk
                            ) {
                              // fix saved search or we'll get explosions
                              const search = deepClone(app.state.search)
                              search.sorter =
                                app.switchboard.index!.currentSorter
                              app.setState({ search })
                            }
                            if (sorter.pk === defaultSorter) {
                              setDefaultSorter(
                                app.switchboard.index!.currentSorter
                              )
                            }
                            resolve(`Sorter ${sorter.name} deleted`)
                          })
                          .catch((e) => reject(e))
                      })
                    },
                  })
                }}
              >
                <Clear />
              </Button>
              <Button
                size="small"
                onClick={() => setEditedSorter(deepClone(sorter))}
              >
                <Edit />
              </Button>
            </>
          )}
        </CardActions>
      </Card>
    </Grid>
  )
}

function SortingDetails({ app }: { app: App }) {
  return (
    <Details header="Sorting">
      <p>
        The Sorting tab is for defining &ldquo;sorters&rdquo;. Sorters allow one
        to sort phrases by their linguistic similarity so that, ideally, one can
        find notes about phrases related linguistically to the phrase one is
        interested in. For example, if one is looking at <i>sing</i> one would
        like to find a note on <i>sang</i> more than a note on <i>sink</i>. If
        one is looking at <i>cat</i> one is more interested in finding a note on{" "}
        <i>cats</i> than a note on <i>can</i>. Having found similar notes, one
        can link them together via a{" "}
        <TabLink app={app} tab="projects">
          relation
        </TabLink>
        . You will chiefly use sorters via the{" "}
        <FilterList fontSize="small" color="primary" /> widget in the{" "}
        <TabLink tab="note" app={app}>
          notes
        </TabLink>{" "}
        tab.
      </p>
      <p>
        Sorters work by measuring the{" "}
        <LinkAway app={app} url="https://en.wikipedia.org/wiki/Edit_distance">
          edit distance
        </LinkAway>{" "}
        between two phrases: basically, how many changes one needs to make to
        turn one phrase into the other. To turn <i>cat</i> into <i>cats</i>, for
        instance, one simply needs to add an <i>s</i>. That might be an edit
        distance of one, so these two words should sort next to each other. In
        fact, the default sorter works exactly this way. It uses the{" "}
        <LinkAway
          app={app}
          url="https://en.wikipedia.org/wiki/Levenshtein_distance"
        >
          Levenshtein distance
        </LinkAway>{" "}
        to sort words, where adding one letter gives us an edit distance of one.
        Ideally, though, one would like to weight these edits by their{" "}
        <em>linguistic significance</em>. In English, <i>cat</i> and <i>cats</i>{" "}
        are more linguistically similar than <i>cat</i> and <i>scat</i>. The
        first two are different forms of the same word. The last two are
        different words altogether. This is because in English we add an{" "}
        <i>s</i> to the end of words to make plurals <em>of the same word</em>,
        but adding things to the beginnings of words makes different words. It
        isn't something the grammar of English &ldquo;expects&rdquo;.
      </p>
      <p>
        To define a sorter, then, one needs to know what sorts of things a
        language can do to a word to make another variant of the same word. In
        English you can add <i>s</i> or <i>ed</i> and so forth to the end. In
        some languages these{" "}
        <LinkAway app={app} url="https://en.wikipedia.org/wiki/Inflection">
          inflectional
        </LinkAway>{" "}
        changes can be considerably more complex. Amanuensis lets you define
        sorters that can handle the simplest sorts of changes. In particular, it
        lets you set a sorter's
      </p>
      <ul id="toc">
        <li>
          <LinkDown to="prefix">prefix length</LinkDown>
        </li>
        <li>
          <LinkDown to="suffix">suffix length</LinkDown>
        </li>
        <li>
          <LinkDown to="insertables">insertable letters</LinkDown>
        </li>
        <li>
          <LinkDown to="convertibles">convertible letters</LinkDown>
        </li>
      </ul>
      <h2>Note</h2>
      <p>
        If you find the discussion up to this point and below confusing, you
        should be aware that tinkering with sorters doesn't tend to make a huge
        difference unless you have thousands of notes, and even then the
        difference may be hard to perceive. Just using the Levenshtein sorter
        for everything is probably fine.
      </p>
      <h3 id="prefix">
        Prefix <LinkUp />
      </h3>
      <p>
        A sorter's &ldquo;prefix&rdquo; is the number of characters at the
        beginning of a word that might just be inflectional. A sorter for
        English wants no prefix, because English words don't do anything
        grammatically at the front. In Swahili, though, <i>mtu</i> and{" "}
        <i>watu</i> are different forms of the same word, so a Swahili sorter
        might do well to have a defined prefix.
      </p>
      <p>
        When defining a prefix, aim for the number of characters words in your
        language <em>typically</em> have at their beginning which are purely
        inflectional. This number is used to downweight changes at the front of
        a word when measuring similarity. If it's too long, it will downweight
        changes that are likely to be making a different word altogether.
      </p>
      <h3 id="suffix">
        Suffix <LinkUp />
      </h3>
      <p>
        The <i>s</i> at the end of <i>cats</i> is an inflectional suffix. It
        turns singular <i>cat</i> into its plural form. Inflectional suffixes
        are much more common than inflectional prefixes. English has several
        inflectional suffixes &mdash; <i>s</i>, <i>ed</i>, <i>ing</i> &mdash; so
        an English sorter might want a suffix length of 2, say.
      </p>
      <h3 id="insertables">
        Insertables <LinkUp />
      </h3>
      <p>
        In some languages inflectional processes can pop letters into the middle
        of words or take them away. For instance, the Welsh verbal noun{" "}
        <i>cyrraedd</i> has the forms <i>chyrraedd</i> and <i>cyrhaeddodd</i>,
        where <i>h</i> pops into the middle. The verbal noun <i>ateb</i> has the
        form <i>hateb</i>, where <i>h</i> pops in at the beginning. A Welsh
        sorter might want to list <i>h</i> as an insertable character. Two words
        that differ by the insertion or deletion of an insertable character are
        considered more similar than words that differ by the insertion or
        deletion of a non-insertable character.
      </p>
      <h3 id="convertibles">
        Convertibles <LinkUp />
      </h3>
      <p>
        In some languages inflectional processes can change one letter into
        another. For instance, in Welsh <i>brawd</i>, <i>mrawd</i>, and{" "}
        <i>frawd</i> are all forms of the same word. For a Welsh sorter you
        might want to list <i>b</i>, <i>m</i>, and <i>f</i> as a convertible
        set. Changes which involve conversion of one of these letters to another
        would then count for little.
      </p>
      <p>
        When editing a sorter one adds convertible letters as pairs. The order
        of the letters in the pair doesn't matter.
      </p>
      <h2>Compound Words</h2>
      <p>
        Another source of interesting word similarity aside from{" "}
        <LinkAway app={app} url="https://en.wikipedia.org/wiki/Inflection">
          inflection
        </LinkAway>{" "}
        is{" "}
        <LinkAway
          app={app}
          url="https://en.wikipedia.org/wiki/Compound_(linguistics)"
        >
          compounding
        </LinkAway>
        , when one word includes another word in it, an example is <i>baby</i>{" "}
        and <i>sitter</i> in <i>babysitter</i>. Sorters worry about inflectional
        similarity. To handle compounding Amanuensis regards one word as more
        similar to another if one contains the other in it. It first calculates
        the inflectional similarity of two words and then, if one of the words
        cmntains the other, it subtracts a compounding bonus. The bonus is just
        the length of the word contained. The Levenshtein distance between{" "}
        <i>baby</i> and <i>babysitter</i> is 4, the number of characters you
        must add to <i>sitter</i> to get <i>babysitter</i>. But since{" "}
        <i>baby</i> is contained in <i>babysitter</i>, Amanuensis subtracts 4
        out again from the similarity measure, leaving 0, so if you are creating
        a note on <i>babysitter</i> Amanuensis will suggest <i>baby</i> and{" "}
        <i>sitter</i> as extremely similar notes that you might want to link the{" "}
        <i>babysitter</i> note to.
      </p>
      <AboutLink app={app} />
    </Details>
  )
}
