import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "lib/Model.js" as Model

// Omaipsum control panel: pick what to generate (unit, count, flavor,
// format, style), watch the live preview, then copy it or type it into the
// focused app. Options persist to ~/.config/omarchy/omaipsum/settings.json.
// All text generation is in lib/Model.js; this file is UI plus plumbing.
//
// Visual language follows the first-party panels (omarchy.power is the
// reference): a hero with a display-size glyph and a big number on the
// right, PanelSectionHeader sections split by PanelSeparator, equal-width
// chip rows, and bordered action buttons.
Panel {
  id: root
  moduleName: "shl.omaipsum"

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  // Guarded so the widget renders before the bar is injected.
  readonly property color fg: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(fg, 1.4)
  readonly property color faint: Qt.darker(fg, 1.8)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  readonly property string home: Quickshell.env("HOME")
  readonly property string stateDir: home + "/.config/omarchy/omaipsum"
  readonly property string statePath: stateDir + "/settings.json"

  // ---- State ---------------------------------------------------------------
  property var opts: Model.defaultOptions()
  property var result: Model.generate(opts)
  property bool loaded: false
  property string flash: ""
  property bool copiedPulse: false
  property string pendingInsert: ""

  readonly property var unit: Model.unitById(opts.unit)
  readonly property var flavorOptions: Model.FLAVORS.map(function(f) { return { value: f.id, label: f.name } })
  readonly property string summary: Model.describe(opts)
  readonly property string statsLine: {
    var s = root.result.stats
    var parts = [Model.plural(s.words, "word"), Model.plural(s.chars, "char")]
    if (root.opts.unit !== "words" && root.opts.unit !== "characters")
      parts.push(Model.plural(s.units, s.unitNoun))
    if (root.opts.seed) parts.push("seed “" + root.opts.seed + "”")
    return parts.join(" · ")
  }

  readonly property int previewLimit: 1500
  readonly property bool previewTruncated: result.text.length > previewLimit
  readonly property string previewText: previewTruncated
    ? result.text.slice(0, previewLimit) + " …"
    : result.text

  // ---- Options -------------------------------------------------------------

  function setOpt(key, value) {
    var next = {}
    for (var k in root.opts) next[k] = root.opts[k]
    next[key] = value
    // Switching unit re-seeds the count so "3 paragraphs" doesn't turn into
    // "3 characters".
    if (key === "unit" && value !== root.opts.unit) next.count = Model.defaultCountFor(value)
    root.opts = Model.sanitizeOptions(next)
    if (key !== "styleOpen" && key !== "autoCopy") root.regenerate()
    saveTimer.restart()
  }

  // Merge a JSON payload into the saved options (IPC `set`).
  function applyOverrides(json) {
    var ov = Model.parseOverrides(json)
    var next = {}
    for (var k in root.opts) next[k] = root.opts[k]
    for (var k2 in ov) next[k2] = ov[k2]
    root.opts = Model.sanitizeOptions(next)
    root.regenerate()
    saveTimer.restart()
  }

  function regenerate() {
    root.result = Model.generate(root.opts)
    if (root.opts.autoCopy && root.opened) root.copyText(root.result.text, false)
  }

  // ---- Actions -------------------------------------------------------------

  function showFlash(text) {
    root.flash = text
    flashTimer.restart()
  }

  function pulse() {
    root.copiedPulse = true
    pulseTimer.restart()
  }

  function copyText(text, notify) {
    if (!text) return
    copyProc.payload = text
    if (copyProc.running) copyProc.running = false
    copyProc.stdinEnabled = true
    copyProc.running = true
    var label = "Copied " + Model.plural(root.result.stats.words, "word")
    root.showFlash(label)
    root.pulse()
    if (notify) root.notify(label, root.summary)
  }

  function copyCurrent() { root.copyText(root.result.text, false) }

  // Fresh batch with optional JSON overrides (IPC / bar clicks). The stored
  // options are untouched.
  function copyFresh(json, notify) {
    var o = Model.mergeOptions(root.opts, Model.parseOverrides(json))
    var r = Model.generate(o)
    root.result = r
    root.copyText(r.text, notify === true || !root.opened)
  }

  function generateText(json) {
    var o = Model.mergeOptions(root.opts, Model.parseOverrides(json))
    return Model.generate(o).text
  }

  // Type into the focused app: close the panel so focus returns to the
  // window underneath, then paste via wl-copy + Shift+Insert (the same
  // route omarchy-menu-emoji-insert takes).
  function insertText(text) {
    if (!text) return
    root.pendingInsert = text
    root.showFlash("Inserting…")
    root.close()
    insertTimer.restart()
  }

  function insertCurrent() { root.insertText(root.result.text) }

  function insertFresh(json) {
    var o = Model.mergeOptions(root.opts, Model.parseOverrides(json))
    var r = Model.generate(o)
    root.result = r
    root.insertText(r.text)
  }

  function notify(headline, body) {
    Quickshell.execDetached(["omarchy-notification-send", "-g", "󰛘", headline, body])
  }

  // ---- Persistence ---------------------------------------------------------

  // Runs on first load and whenever another bar instance (a second
  // monitor) writes the file, so every panel shows the same options.
  function onStateLoaded() {
    var next = Model.sanitizeOptions(stateAdapter.options)
    var changed = JSON.stringify(next) !== JSON.stringify(root.opts)
    if (!changed && root.loaded) return
    root.opts = next
    root.loaded = true
    root.result = Model.generate(root.opts)
  }

  FileView {
    id: stateFile
    path: root.statePath
    printErrors: false
    atomicWrites: true
    watchChanges: true
    onFileChanged: reload()
    onLoaded: root.onStateLoaded()
    onLoadFailed: { /* first run: ensureDirProc seeds the file and reloads */ }

    JsonAdapter {
      id: stateAdapter
      property var options: ({})
    }
  }

  Process {
    id: ensureDirProc
    environment: ({ "HOME": root.home })
    command: ["bash", "-c",
      "mkdir -p \"$HOME/.config/omarchy/omaipsum\"; f=\"$HOME/.config/omarchy/omaipsum/settings.json\"; [[ -f \"$f\" ]] || printf '{}\\n' > \"$f\""]
    onExited: stateFile.reload()
  }

  Timer {
    id: saveTimer
    interval: 600
    onTriggered: {
      stateAdapter.options = root.opts
      stateFile.writeAdapter()
    }
  }

  Component.onCompleted: ensureDirProc.running = true

  // ---- Processes -------------------------------------------------------------

  // The text goes over stdin so byte-exact output (no trailing newline,
  // any length) lands in the clipboard.
  Process {
    id: copyProc
    property string payload: ""
    command: ["wl-copy", "--type", "text/plain"]
    stdinEnabled: true
    onStarted: {
      write(payload)
      payload = ""
      stdinEnabled = false
    }
  }

  Process {
    id: insertProc
    property string payload: ""
    command: ["bash", "-c",
      "t=$(cat; printf x); t=${t%x}; printf '%s' \"$t\" | wl-copy --type text/plain; sleep 0.15; wtype -M shift -k Insert -m shift"]
    stdinEnabled: true
    onStarted: {
      write(payload)
      payload = ""
      stdinEnabled = false
    }
  }

  Timer {
    id: insertTimer
    interval: 320
    onTriggered: {
      if (!root.pendingInsert) return
      insertProc.payload = root.pendingInsert
      root.pendingInsert = ""
      if (insertProc.running) insertProc.running = false
      insertProc.stdinEnabled = true
      insertProc.running = true
    }
  }

  Timer {
    id: flashTimer
    interval: 2500
    onTriggered: root.flash = ""
  }

  Timer {
    id: pulseTimer
    interval: 900
    onTriggered: root.copiedPulse = false
  }

  onOpenedChanged: {
    if (root.opened) root.regenerate()
  }

  // ---- Reusable bits ---------------------------------------------------------

  component BodyText: Text {
    textFormat: Text.PlainText
    color: root.fg
    font.family: root.fontFamily
    font.pixelSize: Style.font.bodySmall
    elide: Text.ElideRight
  }

  component CaptionText: Text {
    textFormat: Text.PlainText
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    elide: Text.ElideRight
  }

  component SectionHeader: PanelSectionHeader {
    foreground: root.fg
    fontFamily: root.fontFamily
  }

  component Chip: Button {
    foreground: root.fg
    accent: Color.accent
    fontFamily: root.fontFamily
    fontSize: Style.font.bodySmall
    bordered: true
  }

  component ToggleRow: Row {
    property alias checked: sw.checked
    property string label: ""
    signal toggled()
    spacing: Style.space(6)

    ToggleSwitch {
      id: sw
      anchors.verticalCenter: parent.verticalCenter
      foreground: root.fg
      accent: Color.accent
      onToggled: parent.toggled()
    }
    BodyText {
      anchors.verticalCenter: parent.verticalCenter
      text: parent.label
    }
  }

  // Caption on top, one equal-width chip per choice below. `choices` are
  // { id, name, icon? } objects; the active one matches `value`.
  component ChoiceRow: Column {
    id: choiceRow
    property string label: ""
    property var choices: []
    property string value: ""
    property bool showIcons: false
    signal picked(string id)
    width: parent.width
    spacing: Style.space(5)

    CaptionText {
      visible: choiceRow.label !== ""
      text: choiceRow.label
    }

    Row {
      id: chipRow
      width: parent.width
      spacing: Style.space(6)
      readonly property real cellWidth:
        (width - spacing * Math.max(0, choiceRow.choices.length - 1)) / Math.max(1, choiceRow.choices.length)

      Repeater {
        model: choiceRow.choices

        Chip {
          required property var modelData
          width: chipRow.cellWidth
          text: modelData.name
          iconText: choiceRow.showIcons && modelData.icon ? modelData.icon : ""
          active: choiceRow.value === modelData.id
          onClicked: choiceRow.picked(modelData.id)
        }
      }
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(440))
    contentHeight: panel.fittedContentHeight(panelColumn.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      clip: true
      blocked: seedField.activeFocus || countField.field.activeFocus || flavorSelect.popupOpen
      onCloseRequested: root.close()
      onTabRequested: function(direction) {
        if (root.bar && typeof root.bar.switchPanelFrom === "function")
          root.bar.switchPanelFrom(root.barIdentity, direction)
      }
      onMoveRequested: function(dx, dy) {
        if (dy !== 0 && panelScroll.contentHeight > panelScroll.height)
          panelScroll.contentY = Math.max(0, Math.min(
            panelScroll.contentHeight - panelScroll.height,
            panelScroll.contentY - dy * Style.space(24)))
      }
      onReturnRequested: root.copyCurrent()
      onTextKey: function(t) {
        if (t === "r") root.regenerate()
        else if (t === "c") root.copyCurrent()
        else if (t === "i") root.insertCurrent()
        else if (t === "s") root.setOpt("styleOpen", !root.opts.styleOpen)
      }

      Flickable {
        id: panelScroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: panelColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: panelColumn
          width: panelScroll.width
          spacing: Style.space(14)

          // ---------- Hero: pilcrow · title/status · word count ----------
          Item {
            width: parent.width
            implicitHeight: Math.max(heroIcon.implicitHeight, heroLabels.implicitHeight, heroCount.implicitHeight)

            Text {
              id: heroIcon
              textFormat: Text.PlainText
              text: "󰛘"
              color: root.copiedPulse ? Color.accent : root.fg
              font.family: root.fontFamily
              font.pixelSize: Style.font.display
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter

              Behavior on color { ColorAnimation { duration: 200 } }
            }

            Column {
              id: heroLabels
              anchors.left: heroIcon.right
              anchors.leftMargin: Style.space(14)
              anchors.right: heroCount.left
              anchors.rightMargin: Style.space(10)
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(2)

              Text {
                width: parent.width
                textFormat: Text.PlainText
                text: "Omaipsum"
                color: root.fg
                font.family: root.fontFamily
                font.pixelSize: Style.font.title
                font.bold: true
                elide: Text.ElideRight
              }

              Text {
                width: parent.width
                textFormat: Text.PlainText
                text: root.summary.toUpperCase()
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1.2
                elide: Text.ElideRight
              }
            }

            Column {
              id: heroCount
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              spacing: 0

              Text {
                anchors.right: parent.right
                textFormat: Text.PlainText
                text: String(root.result.stats.words)
                color: root.copiedPulse ? Color.accent : root.fg
                font.family: root.fontFamily
                font.pixelSize: Style.font.displayLarge
                font.bold: true

                Behavior on color { ColorAnimation { duration: 200 } }
              }

              CaptionText {
                anchors.right: parent.right
                text: "WORDS"
                font.bold: true
                font.letterSpacing: 1.2
                color: root.faint
              }
            }
          }

          // ---------- Transient feedback ----------
          CaptionText {
            width: parent.width
            visible: root.flash !== ""
            text: "󰄬 " + root.flash
            color: Color.accent
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
          }

          PanelSeparator { width: parent.width; foreground: root.fg }

          // ---------- Generate ----------
          Column {
            width: parent.width
            spacing: Style.space(10)

            SectionHeader { text: "GENERATE" }

            Grid {
              id: unitGrid
              width: parent.width
              columns: 3
              columnSpacing: Style.space(6)
              rowSpacing: Style.space(6)
              readonly property real cellWidth: (width - columnSpacing * (columns - 1)) / columns

              Repeater {
                model: Model.UNITS

                Chip {
                  required property var modelData
                  width: unitGrid.cellWidth
                  iconText: modelData.icon
                  text: modelData.name
                  active: root.opts.unit === modelData.id
                  onClicked: root.setOpt("unit", modelData.id)
                }
              }
            }

            // Count and flavor share one row: "3 paragraphs  [Classic v]".
            Row {
              id: countRow
              width: parent.width
              spacing: Style.space(8)

              NumberField {
                id: countField
                anchors.verticalCenter: parent.verticalCenter
                foreground: root.fg
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                fieldWidth: Style.space(92)
                value: root.opts.count
                from: 1
                to: root.unit.max
                stepSize: 1
                onModified: function(v) { root.setOpt("count", v) }
              }

              BodyText {
                id: countNoun
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(84)
                color: root.dim
                text: root.unit.noun + (root.opts.count === 1 ? "" : "s")
              }

              Dropdown {
                id: flavorSelect
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - countField.width - countNoun.width - parent.spacing * 2
                showLabel: false
                foreground: root.fg
                accent: Color.accent
                fontFamily: root.fontFamily
                value: root.opts.flavor
                options: root.flavorOptions
                onChanged: function(v) { root.setOpt("flavor", v) }
              }
            }

            ChoiceRow {
              choices: Model.FORMATS
              value: root.opts.format
              showIcons: true
              onPicked: function(id) { root.setOpt("format", id) }
            }

            Row {
              spacing: Style.space(16)

              ToggleRow {
                label: "Start with “" + Model.splitWords(Model.flavorById(root.opts.flavor).opening || "Sed ut perspiciatis").slice(0, 2).join(" ") + "…”"
                checked: root.opts.startWithOpening
                onToggled: root.setOpt("startWithOpening", !root.opts.startWithOpening)
              }

              ToggleRow {
                label: "Auto-copy"
                checked: root.opts.autoCopy
                onToggled: root.setOpt("autoCopy", !root.opts.autoCopy)
              }
            }
          }

          PanelSeparator { width: parent.width; foreground: root.fg }

          // ---------- Style (collapsible) ----------
          Column {
            width: parent.width
            spacing: Style.space(10)

            Item {
              width: parent.width
              implicitHeight: Math.max(styleHeader.implicitHeight, styleToggle.implicitHeight)

              SectionHeader {
                id: styleHeader
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: "STYLE"
              }

              CaptionText {
                anchors.left: styleHeader.right
                anchors.leftMargin: Style.space(8)
                anchors.right: styleToggle.left
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                visible: !root.opts.styleOpen
                color: root.faint
                text: Model.unitById(root.opts.unit).name.toLowerCase() === "paragraphs"
                  ? [root.opts.sentenceLength, root.opts.paragraphLength, root.opts.textCase].join(" · ")
                  : [root.opts.sentenceLength, root.opts.textCase].join(" · ")
              }

              PanelActionButton {
                id: styleToggle
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                iconText: root.opts.styleOpen ? "󰅀" : "󰅂"
                tooltipText: root.opts.styleOpen ? "Collapse" : "Expand"
                foreground: root.fg
                fontFamily: root.fontFamily
                fontSize: Style.font.body
                onClicked: root.setOpt("styleOpen", !root.opts.styleOpen)
              }

              MouseArea {
                anchors.fill: parent
                anchors.rightMargin: styleToggle.width
                cursorShape: Qt.PointingHandCursor
                onClicked: root.setOpt("styleOpen", !root.opts.styleOpen)
              }
            }

            Column {
              visible: root.opts.styleOpen
              width: parent.width
              spacing: Style.space(10)

              ChoiceRow {
                label: root.opts.unit === "titles" ? "Title length" : "Sentence length"
                choices: Model.SENTENCE_LENGTHS
                value: root.opts.sentenceLength
                onPicked: function(id) { root.setOpt("sentenceLength", id) }
              }

              ChoiceRow {
                visible: root.opts.unit === "paragraphs" || root.opts.unit === "characters"
                label: "Paragraph length"
                choices: Model.PARAGRAPH_LENGTHS
                value: root.opts.paragraphLength
                onPicked: function(id) { root.setOpt("paragraphLength", id) }
              }

              ChoiceRow {
                label: "Case"
                choices: Model.CASES
                value: root.opts.textCase
                onPicked: function(id) { root.setOpt("textCase", id) }
              }

              ChoiceRow {
                visible: root.opts.unit === "list"
                label: "List style"
                choices: Model.LIST_TYPES
                value: root.opts.listType
                showIcons: true
                onPicked: function(id) { root.setOpt("listType", id) }
              }

              ToggleRow {
                visible: root.opts.unit === "paragraphs"
                label: "Heading before each paragraph"
                checked: root.opts.headings
                onToggled: root.setOpt("headings", !root.opts.headings)
              }

              Column {
                width: parent.width
                spacing: Style.space(5)

                CaptionText { text: "Seed" }

                Row {
                  width: parent.width
                  spacing: Style.space(6)

                  TextField {
                    id: seedField
                    width: parent.width - seedClear.width - parent.spacing
                    placeholderText: "󰹢  Optional — same seed, same text"
                    foreground: root.fg
                    accent: Color.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    text: root.opts.seed
                    onTextEdited: root.setOpt("seed", text)
                    onAccepted: keyCatcher.forceActiveFocus()
                  }

                  PanelActionButton {
                    id: seedClear
                    anchors.verticalCenter: parent.verticalCenter
                    iconText: root.opts.seed ? "󰅖" : "󰒟"
                    tooltipText: root.opts.seed ? "Clear seed" : "Random seed"
                    foreground: root.fg
                    fontFamily: root.fontFamily
                    fontSize: Style.font.body
                    onClicked: {
                      var next = root.opts.seed ? "" : Math.random().toString(36).slice(2, 8)
                      seedField.text = next
                      root.setOpt("seed", next)
                    }
                  }
                }
              }
            }
          }

          PanelSeparator { width: parent.width; foreground: root.fg }

          // ---------- Output ----------
          Column {
            width: parent.width
            spacing: Style.space(8)

            Item {
              width: parent.width
              implicitHeight: outputHeader.implicitHeight

              SectionHeader {
                id: outputHeader
                anchors.left: parent.left
                text: "OUTPUT"
              }

              CaptionText {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                color: root.faint
                text: root.statsLine
              }
            }

            BorderSurface {
              id: previewBox
              width: parent.width
              height: Math.min(Style.space(170), previewFlick.contentHeight + previewBox.padding * 2 + previewBox.borderTop + previewBox.borderBottom)
              radius: Style.cornerRadius
              color: Style.normalFillFor(root.fg, Color.accent)
              borderSpec: Border.controlSpec("normal", root.fg, Color.accent)
              padding: Style.space(10)

              Flickable {
                id: previewFlick
                anchors.fill: parent
                anchors.margins: previewBox.padding
                contentWidth: width
                contentHeight: previewLabel.implicitHeight
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                interactive: contentHeight > height

                Text {
                  id: previewLabel
                  width: previewFlick.width
                  textFormat: Text.PlainText
                  text: root.previewText
                  color: root.fg
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.Wrap
                  lineHeight: 1.25
                }
              }

              MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.NoButton
                cursorShape: Qt.IBeamCursor
              }
            }

            CaptionText {
              visible: root.previewTruncated
              color: root.faint
              text: "Preview shows the first " + root.previewLimit + " characters — copy gets everything"
            }

            Row {
              id: actionRow
              width: parent.width
              spacing: Style.space(6)
              readonly property real cellWidth: (width - spacing * 2) / 3

              Chip {
                width: actionRow.cellWidth
                iconText: "󰑐"
                text: "Regenerate"
                tooltipText: "r"
                onClicked: root.regenerate()
              }

              Chip {
                width: actionRow.cellWidth
                iconText: "󰆏"
                text: "Copy"
                tooltipText: "c · Enter"
                accent: Color.accent
                active: root.copiedPulse
                onClicked: root.copyCurrent()
              }

              Chip {
                width: actionRow.cellWidth
                iconText: "󰆒"
                text: "Insert"
                tooltipText: "i · types into the focused app"
                onClicked: root.insertCurrent()
              }
            }

            CaptionText {
              width: parent.width
              color: root.faint
              text: "r regenerate · c copy · i insert · s style · esc close"
            }
          }
        }
      }
    }
  }
}
