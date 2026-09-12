# Omaipsum

**Lorem ipsum generator for [Omarchy](https://omarchy.org).**
A pilcrow in your bar; click it and a panel lets you dial in exactly the
placeholder text you need, then copy it or type it straight into the
focused app.

![Omaipsum](preview.png)

## Features

- **Six units** — paragraphs, sentences, words, characters (exact length),
  list items, and titles.
- **Eleven flavors** — Classic lorem ipsum, the original Cicero passage
  (*De finibus* 1.32–33, read in order), plain English, Hipster, Bacon,
  Cupcake, Corporate, Pirate, Cat, Space, and Developer.
- **Four formats** — plain text, HTML (`<p>`, `<h2>`, `<ul>`/`<ol>`),
  Markdown, and JSON (an array of the generated units, or
  `{title, body}` pairs when headings are on).
- **Style** — sentence length (short / medium / long / mixed), paragraph
  length, case (sentence / lower / UPPER / Title), bullet or numbered
  lists, a heading before every paragraph, and an optional **seed** so
  the same settings always produce the same text.
- **Start with the opening** — “Lorem ipsum dolor sit amet…” (each flavor
  has its own), or skip it.
- **Live preview** with word / character counts; **auto-copy** on every
  change if you want it.
- **Copy** to the clipboard, or **Insert**: the panel closes and the text
  is pasted into whatever window had focus.
- **Keyboard** — `r` regenerate · `c` / `Enter` copy · `i` insert ·
  `s` toggle style · `j`/`k` scroll · `Esc` close · `Tab` next panel.
- **Bar clicks** — left opens the panel, middle copies a fresh batch with
  the current settings (with a notification), right inserts one.
- **IPC** for keybindings and scripts (below). Settings persist in
  `~/.config/omarchy/omaipsum/settings.json` and stay in sync across
  monitors.

## Install

```bash
omarchy plugin add https://github.com/sahilhuseynzade/omaipsum.git --enable
```

The 󰛘 widget lands in the right section of the bar. Move it with
`omarchy bar move shl.omaipsum --section center`.

## IPC

```bash
omarchy-shell shell toggle shl.omaipsum '{}'                       # open / close the panel
omarchy-shell shl.omaipsum copy                                    # copy a fresh batch (current settings)
omarchy-shell shl.omaipsum copyWith '{"unit":"words","count":50}'  # …with one-off overrides
omarchy-shell shl.omaipsum insert                                  # paste a fresh batch into the focused app
omarchy-shell shl.omaipsum insertWith '{"unit":"sentences","count":2}'
omarchy-shell shl.omaipsum generate '{"unit":"titles","count":1}'  # print text to stdout
omarchy-shell shl.omaipsum set '{"flavor":"pirate","format":"html"}'  # change saved settings
omarchy-shell shl.omaipsum options                                 # print saved settings as JSON
```

Override keys match the settings file: `unit` (`paragraphs`, `sentences`,
`words`, `characters`, `list`, `titles`), `count`, `flavor` (`classic`,
`cicero`, `english`, `hipster`, `bacon`, `cupcake`, `corporate`, `pirate`,
`cat`, `space`, `dev`), `format` (`plain`, `html`, `markdown`,
`json`), `startWithOpening`, `sentenceLength`, `paragraphLength`
(`short`, `medium`, `long`, `mixed`), `textCase` (`sentence`, `lower`,
`upper`, `title`), `listType` (`bullets`, `numbered`), `headings`, `seed`.

A Hyprland binding that pastes three paragraphs wherever you are, in
`~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER SHIFT", "L", "exec", "omarchy-shell shl.omaipsum insertWith '{\"unit\":\"paragraphs\",\"count\":3}'", "Insert lorem ipsum")
```

## Development

```bash
node --test tests/            # pure-logic tests (lib/Model.js)
omarchy plugin validate .     # manifest checks
```

Layout: `BarWidget.qml` (bar glyph, IPC), `Panel.qml` (UI, persistence,
clipboard), `lib/Model.js` (generation and formatting, no Qt — runs under
node as well as inside the shell). `docs/cover.html` renders `preview.png`
from `docs/panel.png` (a 440px-wide screenshot of the panel) in any browser
at 1600×900.

To hack on it, copy the checkout into `~/.config/omarchy/plugins/shl.omaipsum/`;
the shell reloads plugin code on save. IPC handlers only re-register on a
shell restart, so run `omarchy restart shell` after editing `BarWidget.qml`.

## License

[MIT](LICENSE)
