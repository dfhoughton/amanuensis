import React, { useState } from "react"

import { App } from "./App"
import {
  AboutLink,
  Details,
  InfoBox,
  InfoSpinner,
  LinkAway,
  TabLink,
  TitleBox,
} from "./modules/components"
import { Configuration } from "./modules/types"
import { deepClone } from "./modules/clone"

import {
  Box,
  Checkbox,
  FormControlLabel,
  Grid,
  IconButton,
  LinearProgress,
  makeStyles,
  Switch,
  TextField,
  Typography as T,
} from "@material-ui/core"
import { Delete, FilterList, GetApp, Publish } from "@material-ui/icons"
import { formatNumber } from "./modules/util"

interface ConfigProps {
  app: App
}

type ConfigState = {
  initialized: boolean
  amountMemoryUsed: number
  amountMemoryAvailable: number
  initializedMemory: boolean
}

class Config extends React.Component<ConfigProps, ConfigState> {
  app: App
  constructor(props: Readonly<ConfigProps>) {
    super(props)
    this.app = props.app
    this.state = {
      initialized: false,
      amountMemoryUsed: 0,
      amountMemoryAvailable: 100,
      initializedMemory: false,
    }
    this.app.switchboard
      .index!.memfree()
      .then(([a, u]) =>
        this.setState({
          amountMemoryUsed: u,
          amountMemoryAvailable: a,
          initializedMemory: true,
        })
      )
      .catch((e) => this.app.error(e))
  }

  componentDidMount() {
    this.app.switchboard.then(() => this.setState({ initialized: true }))
  }

  render() {
    return (
      <div className="config" style={{ minHeight: 400 }}>
        <Details header="Configuration">
          <p>
            This is a collection of controls that affect all your notes and
            projects. Most information you need about particular configuration
            sections will be provided by the <InfoSpinner /> icons.
          </p>
          <AboutLink app={this.app} />
        </Details>
        <Params config={this} />
        <Clear config={this} />
        <Stats config={this} />
        <DownloadUpload config={this} />
      </div>
    )
  }
}

export default Config

const paramStyles = makeStyles((theme) => ({
  label: {
    color: theme.palette.grey[700],
    fontWeight: 700,
  },
  danger: {
    color: theme.palette.error.dark,
  },
  abstract: {
    fontStyle: "italic",
  },
}))

function Params({ config }: { config: Config }) {
  const conf = config.app.state.config
  const [firstInfo, setFirstInfo] = useState<boolean>(false)
  const [secondInfo, setSecondInfo] = useState<boolean>(false)
  const classes = paramStyles()
  const configError = (e: unknown) =>
    config.app.error(`could not save configuration change: ${e}`)
  return (
    <TitleBox title="Parameters" mt={3}>
      <strong>Notes</strong>
      <Grid container alignItems="center" spacing={2}>
        <Grid item xs={4} container justify="flex-end">
          <span className={classes.label}>similars count</span>
        </Grid>
        <Grid item>
          <TextField
            value={conf.notes.similarCount}
            inputProps={{
              type: "number",
              min: 1,
              max: 10,
              step: 1,
              size: 2,
              style: { textAlign: "right" },
            }}
            onChange={(e) => {
              const newConf: Configuration = deepClone(conf)
              const similarCount = Number.parseInt(e.target.value)
              newConf.notes.similarCount = similarCount
              config.app.switchboard
                .index!.saveConfiguration(newConf)
                .then(() => {
                  config.app.setState({ config: newConf })
                })
                .catch(configError)
            }}
          />
        </Grid>
        <Grid item>
          <InfoSpinner
            flipped={secondInfo}
            setFlipped={setSecondInfo}
            fontSize="small"
          />
        </Grid>
      </Grid>
      <InfoBox shown={secondInfo}>
        The similars count is the maximum number of similar phrases shown by the{" "}
        <FilterList color="primary" fontSize="small" /> widget of a{" "}
        <TabLink tab="note" app={config.app}>
          note
        </TabLink>
        .
      </InfoBox>
      <strong>Flashcards</strong>
      <Grid container alignItems="center" spacing={2}>
        <Grid item xs={4} container justify="flex-end">
          <span className={classes.label}>initial card side</span>
        </Grid>
        <Grid item>
          <Grid component="label" container alignItems="center" spacing={1}>
            <Grid item direction="column" alignContent="center">
              gist
            </Grid>
            <Grid item>
              <Switch
                checked={conf.cards.first === "phrase"}
                onChange={() => {
                  const newConf: Configuration = deepClone(conf)
                  newConf.cards.first =
                    conf.cards.first === "gist" ? "phrase" : "gist"
                  config.app.switchboard
                    .index!.saveConfiguration(newConf)
                    .then(() => {
                      config.app.setState({ config: newConf })
                    })
                    .catch(configError)
                }}
              />
            </Grid>
            <Grid item>phrase</Grid>
          </Grid>
        </Grid>
        <Grid item>
          <InfoSpinner
            flipped={firstInfo}
            setFlipped={setFirstInfo}
            fontSize="small"
          />
        </Grid>
      </Grid>
      <InfoBox shown={firstInfo}>
        The side of flashcards that is shown first. Typically it is easier to
        start with the phrase.
      </InfoBox>
    </TitleBox>
  )
}

function DownloadUpload({ config }: { config: Config }) {
  const [showDownloadInfo, setShowDownloadInfo] = useState<boolean>(false)
  const [showUploadInfo, setShowUploadInfo] = useState<boolean>(false)
  const [compressedDownload, setCompressedDownload] = useState<boolean>(true)
  const classes = paramStyles()
  if (!config.state.initialized) return null

  const downloadHandler = () => {
    config.app.switchboard.then(() => {
      config.app.switchboard
        .index!.dump(!compressedDownload)
        .then((json) => {
          const text = JSON.stringify(json)
          const e = document.createElement("a")
          e.setAttribute(
            "href",
            "data:application/json;charset=utf-8," + encodeURIComponent(text)
          )
          e.setAttribute("download", "amanuensis.json")
          e.style.display = "none"
          document.body.appendChild(e)
          e.click()
          document.body.removeChild(e)
        })
        .catch((e) => config.app.error(`could not obtain JSON: ${e}`))
    })
  }
  const uploadHandler = (e: any) => {
    const element = document.getElementById(
      "uploaded-state"
    )! as HTMLInputElement
    if (element.files?.length) {
      const f = element.files[0]
      if (f.type === "application/json") {
        const reader = new FileReader()
        reader.readAsText(f)
        reader.onload = (e) => {
          const text = e.target?.result
          if (text) {
            try {
              const data = JSON.parse(text.toString())
              config.app.confirm({
                title: `Replace current state with that saved in ${f.name}?`,
                text: (
                  <>
                    <p>
                      This action will destroy any notes, projects, saved
                      searches, or anything else you have done in Amanuensis in
                      this browser. If this is your intention, continue.
                    </p>
                    <p>
                      You may want to download the current state first into a
                      different file as a backup in case there is a problem with{" "}
                      {f.name} and the restoration from file does not go
                      smoothly.
                    </p>
                  </>
                ),
                callback: () =>
                  new Promise((resolve, reject) => {
                    // swap out the compressor/decompressor -- the new blob may have different ones
                    const { compressor } = data
                    const decompressor: Record<string, string> = {}
                    for (const [k, v] of Object.entries(compressor as Record<string, string>)) {
                      decompressor[v] = k
                    }
                    config.app.switchboard.index!.decompressor = decompressor
                    config.app.switchboard.index!.compressor = compressor

                    config.app.switchboard
                      .index!.load(data)
                      .then(() => {
                        config.app.switchboard.rebootIndex().then(() => {
                          config.app.clear()
                          resolve("")
                        })
                      })
                      .catch((e) => {
                        console.error(e)
                        reject(
                          `could not store state in ${f.name} on disk: ${e}`
                        )
                      }
                      )
                  }),
              })
            } catch (e) {
              config.app.error(
                `the text in ${f.name} is not parsable as JSON: ${e}`
              )
            }
          }
        }
      } else {
        config.app.error(`the uploaded file, ${f.name}, is not JSON`)
      }
    }
  }

  return (
    <TitleBox title="Upload/Download" mt={3}>
      <Grid container alignItems="center" spacing={2}>
        <Grid
          item
          xs={4}
          className={classes.label}
          container
          justify="flex-end"
        >
          download
        </Grid>
        <Grid item>
          <IconButton onClick={downloadHandler}>
            <GetApp color="primary" />
          </IconButton>
        </Grid>
        <Grid item>
          <FormControlLabel
            control={
              <Checkbox
                checked={compressedDownload}
                onChange={() => setCompressedDownload(!compressedDownload)}
              />
            }
            label="Compressed"
          />
        </Grid>
        <Grid item>
          <InfoSpinner
            flipped={showDownloadInfo}
            setFlipped={setShowDownloadInfo}
          />
        </Grid>
      </Grid>
      <InfoBox shown={showDownloadInfo}>
        <Box mb={1}>
          Downloading Amanuensis state will give you a{" "}
          <LinkAway app={config.app} url="https://en.wikipedia.org/wiki/JSON">
            JSON
          </LinkAway>{" "}
          file containing everything Amanuensis has stored locally. This is is
          useful if you wish to back Amanuensis up or transfer your notes to a
          different browser or machine.
        </Box>
        <Box>
          The compressed version of the data represents the data as it is
          actually stored on your computer. The decompressed version is easier
          to read and make use of. Either can be uploaded to restore Amanuensis.
        </Box>
      </InfoBox>
      <Grid container alignItems="center" spacing={2}>
        <Grid
          item
          xs={4}
          className={classes.label}
          container
          justify="flex-end"
        >
          upload
        </Grid>
        <Grid item>
          <IconButton
            onClick={() => document.getElementById("uploaded-state")!.click()}
          >
            <Publish color="primary" />
            <input
              id="uploaded-state"
              type="file"
              onChange={uploadHandler}
              hidden
            />
          </IconButton>
        </Grid>
        <Grid item>
          <InfoSpinner
            flipped={showUploadInfo}
            setFlipped={setShowUploadInfo}
          />
        </Grid>
      </Grid>
      <InfoBox shown={showUploadInfo}>
        <Box mb={1}>Restore Amanuensis from a downloaded file.</Box>
        <Box>
          <strong>Note:</strong> restoring Amanuensis from a downloaded JSON
          file will obliterate its current state. Any notes, projects, or
          anything else you may have created will be replaced with whatever was
          in the JSON file.
        </Box>
      </InfoBox>
    </TitleBox>
  )
}

function Stats({ config }: { config: Config }) {
  const classes = paramStyles()
  const [showMemoryInfo, setShowMemoryInfo] = useState<boolean>(false)
  const maybeHide = config.state.initializedMemory ? {} : { display: "none" }
  const { amountMemoryUsed: used, amountMemoryAvailable: available } =
    config.state
  const value = Math.round((100 * used) / available)
  return (
    <TitleBox title="Statistics" mt={3} style={maybeHide}>
      <Grid container alignItems="center" spacing={2}>
        <Grid
          item
          xs={4}
          className={classes.label}
          container
          justify="flex-end"
        >
          storage
        </Grid>
        <Grid item xs={7}>
          <Box display="flex" alignItems="center">
            <Box width="100%" mr={1}>
              <LinearProgress variant="determinate" value={value} />
            </Box>
            <Box minWidth={35}>
              <T variant="body2" color="textSecondary">{`${value}%`}</T>
            </Box>
          </Box>
        </Grid>
        <Grid item xs={1}>
          <InfoSpinner
            flipped={showMemoryInfo}
            setFlipped={setShowMemoryInfo}
          />
        </Grid>
      </Grid>
      <InfoBox shown={showMemoryInfo}>
        <Box mb={1}>
          The percentage of disk storage alloted to Amanuensis by the browser
          that it has filled.
        </Box>
        <Box>
          So far {formatNumber(used)} bytes of {formatNumber(available)} have
          been used.
        </Box>
      </InfoBox>
      <Box mt={1}>
        <Grid container alignItems="flex-start" spacing={2}>
          <Grid
            item
            xs={4}
            className={classes.label}
            container
            justify="flex-end"
          >
            notes per project
          </Grid>
          <Grid item container xs={8}>
            {Array.from(
              config.app.switchboard.index!.projectIndices.entries()
            ).map(([i, map], _n) => (
              <Grid
                item
                container
                spacing={1}
                xs={12}
                style={{ fontSize: "smaller" }}
                direction="row"
                justifyContent="flex-start"
                alignItems="flex-start"
              >
                <Grid
                  item
                  container
                  xs={4}
                  className={classes.label}
                  justifyContent="flex-end"
                >
                  {config.app.switchboard.index?.reverseProjectIndex.get(i) || (
                    <i>default</i>
                  )}
                </Grid>
                <Grid item xs={2} style={{ textAlign: "right" }}>
                  {formatNumber(map.size)}
                </Grid>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Box>
    </TitleBox>
  )
}

// generates the clear all button portion of the config panel
function Clear({ config }: { config: Config }) {
  const classes = paramStyles()
  const [everythingInfo, setEverythingInfo] = useState<boolean>(false)
  const [savedSearchInfo, setSavedSearchInfo] = useState<boolean>(false)
  const [trialInfo, setTrialInfo] = useState<boolean>(false)
  const maybeHide = config.state.initialized ? {} : { display: "none" }
  return (
    <TitleBox title="Clear Records" mt={3} style={maybeHide}>
      <p className={classes.abstract}>
        Delete all records of particular types.
      </p>
      <Grid container alignItems="center" spacing={2}>
        <Grid
          item
          xs={4}
          className={classes.label}
          container
          justify="flex-end"
        >
          everything
        </Grid>
        <Grid item>
          <IconButton
            onClick={() =>
              config.app.confirm({
                title: "Clear all stored notes?",
                text: `Clear all saved information from Amanuensis.
                                This means all notes, all tags, all relations, all projects, all
                                sorters, and all saved searches will be
                                irretrievably gone.`,
                callback: () =>
                  new Promise((resolve, reject) => {
                    config.app.switchboard
                      .index!.clear()
                      .then(() => {
                        config.app.setState({ defaultProject: 0 })
                        resolve("everything is gone")
                      })
                      .catch((e) => reject(e))
                  }),
              })
            }
          >
            <Delete className={classes.danger} />
          </IconButton>
        </Grid>
        <Grid item>
          <InfoSpinner
            flipped={everythingInfo}
            setFlipped={setEverythingInfo}
          />
        </Grid>
      </Grid>
      <InfoBox shown={everythingInfo}>
        This will delete all information stored by Amanuensis on your computer
        for this browser.
      </InfoBox>
      <Grid container alignItems="center" spacing={2}>
        <Grid
          item
          xs={4}
          className={classes.label}
          container
          justify="flex-end"
        >
          saved searches
        </Grid>
        <Grid item>
          <IconButton
            onClick={() =>
              config.app.confirm({
                title: "Delete All Saved Searches?",
                text: "This action cannot be undone.",
                callback: () =>
                  new Promise((resolve, reject) => {
                    config.app.switchboard
                      .index!.clearStacks()
                      .then(() => {
                        config.app.setState({ stack: undefined })
                        resolve("all saved searches have been deleted")
                      })
                      .catch((e) => reject(e))
                  }),
              })
            }
          >
            <Delete className={classes.danger} />
          </IconButton>
        </Grid>
        <Grid item>
          <InfoSpinner
            flipped={savedSearchInfo}
            setFlipped={setSavedSearchInfo}
          />
        </Grid>
      </Grid>
      <InfoBox shown={savedSearchInfo}>
        This will delete only the saved search parameters stored by Amanuensis
        on your computer for this browser.
      </InfoBox>
      <Grid container alignItems="center" spacing={2}>
        <Grid
          item
          xs={4}
          className={classes.label}
          container
          justify="flex-end"
        >
          trials
        </Grid>
        <Grid item>
          <IconButton
            onClick={() =>
              config.app.confirm({
                title: "Delete All Trials?",
                text: "This action cannot be undone. This will not affect any current flashcard session.",
                callback: () =>
                  new Promise((resolve, reject) => {
                    config.app.switchboard
                      .index!.clearTrials()
                      .then((s) => resolve(s))
                      .catch(reject)
                  }),
              })
            }
          >
            <Delete className={classes.danger} />
          </IconButton>
        </Grid>
        <Grid item>
          <InfoSpinner flipped={trialInfo} setFlipped={setTrialInfo} />
        </Grid>
      </Grid>
      <InfoBox shown={trialInfo}>
        <Box mb={1}>
          This will delete all trial information collected during{" "}
          <TabLink tab="cards" app={config.app}>
            flashcard sessions
          </TabLink>
          .
        </Box>
        <Box>
          A trial is one guess at one side of a flashcard. The information
          recorded for a trial is the time it occurred, the side of the card
          showing, and whether you guessed correctly.
        </Box>
      </InfoBox>
    </TitleBox>
  )
}
