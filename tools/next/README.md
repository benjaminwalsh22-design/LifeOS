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
