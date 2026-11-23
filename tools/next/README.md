# The redesign, and how it is built

LifeOS v11 is the same app as v10.5 with a new interface. The data model, storage
keys, sync, AI prompts, scoring, imports and exports are unchanged.

- `rollback/index-v10.5.html` is the app as it was before the redesign. It is the
  starting point of every build and the file to restore if the redesign ever has
  to be undone (copy it over `index.html`, or check out the git tag `v10.5`).
- `tools/next/build.py` produces the redesigned app from that file. It replaces the
  old markup-building functions with the pieces in this folder and appends the
  design system (`ds.css`). `python3 tools/next/build.py` writes `next.html`, the
  preview. Adding `--live` also writes `index.html`.
- `tests/ui/check.sh` rebuilds and runs every check:
  - `parity.test.js` drives the old and the new build through the same session and
    requires identical saved data, identical storage and identical network requests.
  - `nav.test.js` covers the navigation stacks, the Insights hub, Settings, and that
    no element the old screens relied on has gone missing.
  - `gesture.test.js` covers slides, the edge swipe, scroll memory and sheets in a real browser.
  - `smoke.test.js` walks the main flows by real taps, so a covered or dead control fails.
  - `layout.test.js` renders every screen at 375, 390, 393 and 430 points, at normal and
    large text, light and dark, and fails if anything runs off the side.
  - `sprint.test.js`, `study.test.js` cover the November sprint and the study hub.
  - `contrast.py` checks every text and signal colour against the surfaces it sits on.
  - `shots.js` renders the screens to images.

## The pieces

| File | What it holds |
| --- | --- |
| `ds.css` | Tokens (colour, seven type sizes, spacing, radii, motion), the component kit, each screen's styles |
| `nav.js` | Five tabs with their own stacks, Back, edge swipe, scroll memory |
| `sheet.js` | Bottom sheets, swipe to dismiss, yes/no questions as sheets |
| `today.js`, `otd.js`, `otd2.js`, `macros.js` | Today |
| `journal.js` | Journal and the entry page |
| `hub.js`, `doors.js` | Insights and the rooms behind it (Mind, Body, Money, The Firm) |
| `people.js` | People and a person |
| `goals.js`, `study.js` | Goals and the study hub |
| `ask.js` | The on-phone Ask your journal, folded into Ask Ben |
| `memories.js` | 52 Memories and Reading Mode |
| `misc.js` | Reviews, Places, Schedule |
| `settings.js`, `settings2.js`, `theme.js` | Settings |
| `guide.js` | The one chart, and the style guide screen |

After the redesign goes live, `index.html` is the app again and can be edited directly;
this folder then stands as the record of how v11 was produced. To keep building through
the pieces instead, edit them and run the build with `--live`.

## Goals v2 (Nov 2026)

`goals.js` holds the Goals screen. A goal has a shape: `weekly` (an action counted
per week, with an optional result), `long` (a number looked at monthly) or `list`.
Weekly actions count themselves from `DB.stats` where the ring supplies them
(`sleep7`: nights of 7 h or more; `gym`: a strength session of 15 min or more) and
by a tap otherwise. At most three weekly goals are active; one short week a month
is covered by a spare. Goals made before v2 keep every field and gain `shape`,
`state` and `mt`; the new fields are `act`, `plan`, `since`, `resSrc`. Those are
the only changes to saved data, and `tests/ui/parity.test.js` names them.
The research and the plan for the next steps (the Sunday review, seasons) are in
the proposal doc, not in the repo.

### The journal as evidence (v11.4)

A worker (`goal-tick`, see `docs/workers.md`) reads his journal pages for his weekly
actions. The app fetches what it found with `my_goal_evidence()` when Goals is drawn
(at most every five minutes) and keeps it in its own cache, `lifeos_gev`, apart from
the saved data: `[{g: goal id, d: day, q: his sentence, p: page id, s: sure}]`. A
day with a sure finding counts like a day the ring saw; the card and the goal sheet
show the sentence in his own-words style, and the sheet lists them with "Not this".
A finding the page leaves in doubt is shown with "Count it" and "Not this" and
counts only on a yes (which is an ordinary mark in `act.days`).
Two fields are new inside `act`, both his own record and synced with the goal:
`act.what` (a sentence saying what counts, which the worker reads by) and
`act.struck` (days whose sentence he struck). `act.off` still turns a whole day
off, whatever counted it. Erasing the phone clears the cache too.

