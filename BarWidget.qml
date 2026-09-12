import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui
import qs.Commons

// Bar widget: a pilcrow glyph that opens the Omaipsum panel. Left click
// toggles the panel, middle click copies a fresh batch with the current
// settings, right click types one into the focused app. Generation and
// settings live in Panel.qml; this file only hosts it and exposes IPC.
BarWidget {
  id: root
  moduleName: "shl.omaipsum"

  readonly property string glyph: "󰛘"
  readonly property var panel: panelLoader.item

  readonly property string tooltip: panel
    ? "Omaipsum · " + panel.summary + "\nclick panel · middle copy · right insert"
    : "Omaipsum"

  // ---- Panel shape contract for shell.summon/hide/toggle routing ---------
  readonly property bool opened: panel ? panel.opened === true : false

  function open() { if (panel) panel.open() }
  function close() { if (panel) panel.close() }
  function togglePanel() { if (panel) panel.toggle() }

  readonly property bool popoutSwitchClosing: panel ? panel.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panel) panel.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  // omarchy-shell shl.omaipsum copy
  // omarchy-shell shl.omaipsum copyWith '{"unit":"words","count":50}'
  // omarchy-shell shl.omaipsum insertWith '{"unit":"sentences","count":2}'
  // omarchy-shell shl.omaipsum generate '{"unit":"titles","count":1}'   → prints text
  // omarchy-shell shl.omaipsum set '{"flavor":"pirate"}'                → changes saved options
  IpcHandler {
    target: "shl.omaipsum"
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    function copy(): void { if (root.panel) root.panel.copyFresh("") }
    function copyWith(json: string): void { if (root.panel) root.panel.copyFresh(json) }
    function insert(): void { if (root.panel) root.panel.insertFresh("") }
    function insertWith(json: string): void { if (root.panel) root.panel.insertFresh(json) }
    function generate(json: string): string { return root.panel ? root.panel.generateText(json) : "" }
    // Persisted option overrides, e.g. set '{"unit":"list","count":5}'.
    function set(json: string): void { if (root.panel) root.panel.applyOverrides(json) }
    function options(): string { return root.panel ? JSON.stringify(root.panel.opts) : "{}" }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.glyph
    fontSize: Style.font.icon
    tooltipText: root.tooltip
    onPressed: function(b) {
      if (b === Qt.MiddleButton) { if (root.panel) root.panel.copyFresh("", true) }
      else if (b === Qt.RightButton) { if (root.panel) root.panel.insertFresh("") }
      else root.togglePanel()
    }
  }
}
