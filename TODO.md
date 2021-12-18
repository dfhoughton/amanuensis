# Things I should get around to

This list is in addition to github issues. I started it because I found it was convenient to have a list I could
edit alongside the code. My editor was more at my fingertips than the github repo.

These are listed in the order they occurred to me, not in order of importance. I may eliminate checked off items
entirely at some point. There is no guarantee that this is a permanent list of things I've considered doing.

- [ ] make it possible to hide portions of the automatically selected text when it is too long (I'm looking at you, German magazines).
- [ ] add internationalization (tough because of the intermixed style)
  - create per-locale functions to return help text?
- [x] make the note tag suggestions smaller
  - this seems to be a bit busted in mui v4; have installed a temporary hack in index.html (see below)
- [ ] convert the React code to a more standard style
  - [ ] use `Record` instead of `{[key: string]: whatever}`
  - [ ] see if we can convert some `any`s to `unkown`s
  - [ ] maybe convert a few more functions to `React.FC`
  - [ ] maybe sprinkle in some `Readonly` to functions that shouldn't mutate their arguments
- [ ] figure out what is happening when selections aren't registered and you need to reload the page
- [ ] make hot keys configurable
- [ ] make the default citation for a note *the last one seen*, not the first
  - [ ] favorite citation seems to be written for pushing rather than shifting citations
- [ ] make expand elaboration configurable
- [ ] links are sometimes broken
  - [ ] haven't seen this lately; collect more details 
- [ ] perhaps add substring test to similarity measures
- [ ] make expandos scroll with their context
  - they should be doing this already; maybe this is a mui 4 vs 5 thing?
- [ ] convert to mui 5
   - [ ] remove the style hack in index.html
- [x] make text in citation widget non-expando
- [ ] switch to manifest v3
- [ ] consider ways to make the search form more compact and hide more noise
   - advanced search button
   - fix the sorter stuff somehow
   - expand width of extension (don't like this aesthetically)
- [ ] if you do a second search and click the present the second search doesn't replace the current search
- [x] fix overflow of citations -- see *cynaliadwyedd*
- Search
   -  add booleans
      - [ ] multiple citations
      - [ ] any relations
   - [ ] preserve page in search state
- [ ] fix the date math in search so it handles things like daylight savings time
- [ ] figure out why we're getting "description" instead of "mutation" in the entry for *llwm*
- [ ] plug never type check into all descriminated union switches
- [ ] add hint feature to flashcards; if there are tags, you get a hint button; if you click it, it shows you the tags
- [ ] add indication in flashcards that the note has links
- [ ] if you run a new search and press the stack link you should get the stack
- [ ] fix linkage issue -- see llwyn/lwyni
- [ ] add "fix link" function for when the old path no longer works with
- [ ] switch to latest typescript