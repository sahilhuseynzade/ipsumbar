"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../lib/Model.js")

// ---- Options ------------------------------------------------------------------

test("sanitizeOptions fills defaults and drops garbage", () => {
  const o = Model.sanitizeOptions({ unit: "nope", count: "abc", flavor: 42, format: "pdf", seed: 7 })
  assert.deepEqual(o, Model.defaultOptions())
})

test("sanitizeOptions clamps count to the unit maximum", () => {
  assert.equal(Model.sanitizeOptions({ unit: "paragraphs", count: 999 }).count, 100)
  assert.equal(Model.sanitizeOptions({ unit: "words", count: 0 }).count, 1)
  assert.equal(Model.sanitizeOptions({ unit: "characters", count: "500" }).count, 500)
})

test("sanitizeOptions keeps every valid field", () => {
  const o = Model.sanitizeOptions({
    unit: "list", count: 4, flavor: "pirate", format: "markdown", startWithOpening: false,
    autoCopy: true, sentenceLength: "short", paragraphLength: "long", textCase: "upper",
    listType: "numbered", headings: true, seed: "abc", styleOpen: true
  })
  assert.equal(o.unit, "list")
  assert.equal(o.flavor, "pirate")
  assert.equal(o.format, "markdown")
  assert.equal(o.startWithOpening, false)
  assert.equal(o.autoCopy, true)
  assert.equal(o.sentenceLength, "short")
  assert.equal(o.paragraphLength, "long")
  assert.equal(o.textCase, "upper")
  assert.equal(o.listType, "numbered")
  assert.equal(o.headings, true)
  assert.equal(o.seed, "abc")
  assert.equal(o.styleOpen, true)
})

test("mergeOptions applies overrides and re-validates", () => {
  const o = Model.mergeOptions({ unit: "paragraphs", count: 3 }, { unit: "words", count: 5000 })
  assert.equal(o.unit, "words")
  assert.equal(o.count, 3000)
})

test("parseOverrides tolerates empty and invalid payloads", () => {
  assert.deepEqual(Model.parseOverrides(""), {})
  assert.deepEqual(Model.parseOverrides("not json"), {})
  assert.deepEqual(Model.parseOverrides("[1,2]"), [1, 2])
  assert.deepEqual(Model.parseOverrides('{"unit":"words"}'), { unit: "words" })
})

// ---- Determinism ----------------------------------------------------------------

test("same seed yields the same output, different seeds differ", () => {
  const a = Model.generate({ seed: "omarchy", count: 3 })
  const b = Model.generate({ seed: "omarchy", count: 3 })
  const c = Model.generate({ seed: "other", count: 3 })
  assert.equal(a.text, b.text)
  assert.notEqual(a.text, c.text)
})

test("unseeded runs vary", () => {
  const a = Model.generate({ count: 2 })
  const b = Model.generate({ count: 2 })
  assert.notEqual(a.text, b.text)
})

// ---- Units ------------------------------------------------------------------------

test("paragraphs: count and opening", () => {
  const r = Model.generate({ unit: "paragraphs", count: 4, flavor: "classic", seed: "p" })
  assert.equal(r.items.length, 4)
  assert.equal(r.stats.units, 4)
  assert.ok(r.text.startsWith("Lorem ipsum dolor sit amet, consectetur adipiscing elit"))
  assert.equal(r.text.split("\n\n").length, 4)
  for (const p of r.items) assert.match(p, /\.$/)
})

test("paragraphs without opening do not start with Lorem ipsum", () => {
  let hit = 0
  for (let i = 0; i < 20; i++) {
    const r = Model.generate({ unit: "paragraphs", count: 1, startWithOpening: false, seed: "n" + i })
    if (r.text.startsWith("Lorem ipsum dolor sit amet")) hit++
  }
  assert.equal(hit, 0)
})

test("sentences: exact count, sentence-cased, terminated", () => {
  const r = Model.generate({ unit: "sentences", count: 7, seed: "s" })
  assert.equal(r.items.length, 7)
  for (const s of r.items) {
    assert.match(s, /^[A-Z]/)
    assert.match(s, /\.$/)
  }
  assert.equal(r.text, r.items.join(" "))
})

test("sentence length ranges are honored", () => {
  const spec = { short: [4, 8], medium: [8, 14], long: [14, 24], mixed: [4, 24] }
  for (const id of Object.keys(spec)) {
    for (let i = 0; i < 10; i++) {
      const r = Model.generate({ unit: "sentences", count: 5, sentenceLength: id, startWithOpening: false, seed: id + i })
      for (const s of r.items) {
        const n = Model.splitWords(s).length
        assert.ok(n >= spec[id][0] && n <= spec[id][1], `${id}: ${n} words in "${s}"`)
      }
    }
  }
})

test("paragraph length ranges are honored", () => {
  const spec = { short: [2, 4], medium: [4, 7], long: [7, 11], mixed: [2, 11] }
  for (const id of Object.keys(spec)) {
    for (let i = 0; i < 6; i++) {
      const r = Model.generate({ unit: "paragraphs", count: 3, paragraphLength: id, startWithOpening: false, seed: id + i })
      for (const p of r.items) {
        const n = p.split(/\.\s|\.$/).filter(Boolean).length
        assert.ok(n >= spec[id][0] && n <= spec[id][1], `${id}: ${n} sentences`)
      }
    }
  }
})

test("words: exact count, no punctuation, opening first", () => {
  const r = Model.generate({ unit: "words", count: 30, seed: "w" })
  assert.equal(r.items.length, 30)
  assert.equal(r.stats.words, 30)
  assert.equal(r.text, r.items.join(" "))
  assert.doesNotMatch(r.text, /[.,]/)
  assert.ok(r.text.startsWith("lorem ipsum dolor sit amet consectetur adipiscing elit"))
})

test("words: count smaller than the opening truncates it", () => {
  const r = Model.generate({ unit: "words", count: 3, seed: "w3" })
  assert.equal(r.text, "lorem ipsum dolor")
})

test("multi-word vocabulary tokens still give exact word counts", () => {
  const r = Model.generate({ unit: "words", count: 40, flavor: "corporate", startWithOpening: false, seed: "c" })
  assert.equal(Model.splitWords(r.text).length, 40)
})

test("characters: exact length, no trailing space", () => {
  for (const n of [1, 17, 140, 280, 1000]) {
    const r = Model.generate({ unit: "characters", count: n, seed: "c" + n })
    assert.equal(r.text.length, n)
    assert.doesNotMatch(r.text, / $/)
    assert.equal(r.stats.units, n)
  }
})

test("list: items without terminal punctuation", () => {
  const r = Model.generate({ unit: "list", count: 5, seed: "l" })
  assert.equal(r.items.length, 5)
  for (const item of r.items) assert.doesNotMatch(item, /[.?!]$/)
  assert.equal(r.text.split("\n").length, 5)
})

test("list: numbered plain output", () => {
  const r = Model.generate({ unit: "list", count: 3, listType: "numbered", seed: "ln" })
  assert.match(r.text, /^1\. .*\n2\. .*\n3\. /)
})

test("titles: title-cased, no period, bounded length", () => {
  const r = Model.generate({ unit: "titles", count: 6, sentenceLength: "short", seed: "t" })
  assert.equal(r.items.length, 6)
  for (const t of r.items) {
    assert.doesNotMatch(t, /\.$/)
    const n = Model.splitWords(t).length
    assert.ok(n >= 2 && n <= 4, `title "${t}"`)
    for (const w of Model.splitWords(t)) assert.match(w, /^[A-ZÀ-Ɏ0-9]/)
  }
})

// ---- Flavors ------------------------------------------------------------------------

test("every flavor generates for every unit", () => {
  for (const f of Model.FLAVORS) {
    for (const u of Model.UNITS) {
      const r = Model.generate({ flavor: f.id, unit: u.id, count: 2, seed: f.id + u.id })
      assert.ok(r.text.length > 0, `${f.id}/${u.id}`)
      assert.ok(r.stats.words > 0, `${f.id}/${u.id} words`)
    }
  }
})

test("cicero reads the passage in order from the start when opening is on", () => {
  const r = Model.generate({ flavor: "cicero", unit: "sentences", count: 3, startWithOpening: true, seed: "x" })
  assert.equal(r.items[0], "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.")
  assert.match(r.items[1], /^Nemo enim ipsam/)
  assert.match(r.items[2], /^Neque porro quisquam/)
})

test("cicero wraps around when more sentences are requested than the passage has", () => {
  const r = Model.generate({ flavor: "cicero", unit: "sentences", count: 12, startWithOpening: true })
  assert.equal(r.items[10], r.items[0])
})

test("cicero words unit is the punctuation-free word stream", () => {
  const r = Model.generate({ flavor: "cicero", unit: "words", count: 6, startWithOpening: true })
  assert.equal(r.text, "sed ut perspiciatis unde omnis iste")
})

test("flavor openings are used", () => {
  const r = Model.generate({ flavor: "bacon", unit: "sentences", count: 1, seed: "b" })
  assert.match(r.text, /^Bacon ipsum dolor amet/)
})

// ---- Case -------------------------------------------------------------------------

test("case modes", () => {
  const base = { unit: "sentences", count: 2, seed: "case" }
  assert.match(Model.generate({ ...base, textCase: "lower" }).text, /^[^A-Z]+$/)
  assert.match(Model.generate({ ...base, textCase: "upper" }).text, /^[^a-z]+$/)
  const t = Model.generate({ ...base, textCase: "title" }).text
  for (const w of Model.splitWords(t)) assert.match(w, /^[A-Z]/, w)
})

test("titleCase handles hyphens and quotes", () => {
  assert.equal(Model.titleCase("farm-to-table \"brunch\" (matcha)"), "Farm-To-Table \"Brunch\" (Matcha)")
})

// ---- Formats ------------------------------------------------------------------------

test("html paragraphs", () => {
  const r = Model.generate({ unit: "paragraphs", count: 2, format: "html", seed: "h" })
  const lines = r.text.split("\n")
  assert.equal(lines.length, 2)
  for (const l of lines) assert.match(l, /^<p>.*<\/p>$/)
})

test("html paragraphs with headings", () => {
  const r = Model.generate({ unit: "paragraphs", count: 2, format: "html", headings: true, seed: "hh" })
  assert.equal(r.headings.length, 2)
  assert.match(r.text, /^<h2>.*<\/h2>\n<p>.*<\/p>\n\n<h2>.*<\/h2>\n<p>.*<\/p>$/)
})

test("markdown paragraphs with headings", () => {
  const r = Model.generate({ unit: "paragraphs", count: 2, format: "markdown", headings: true, seed: "mh" })
  assert.match(r.text, /^## .+\n\n[^#\n]+\n\n## .+\n\n[^#\n]+$/)
})

test("plain paragraphs with headings put the title on its own line", () => {
  const r = Model.generate({ unit: "paragraphs", count: 1, format: "plain", headings: true, seed: "ph" })
  assert.equal(r.text, r.headings[0] + "\n\n" + r.items[0])
})

test("html list bullets and numbered", () => {
  const ul = Model.generate({ unit: "list", count: 2, format: "html", seed: "ul" })
  assert.match(ul.text, /^<ul>\n  <li>.*<\/li>\n  <li>.*<\/li>\n<\/ul>$/)
  const ol = Model.generate({ unit: "list", count: 2, format: "html", listType: "numbered", seed: "ol" })
  assert.match(ol.text, /^<ol>\n  <li>/)
})

test("markdown list bullets and numbered", () => {
  const ul = Model.generate({ unit: "list", count: 2, format: "markdown", seed: "mul" })
  assert.match(ul.text, /^- .+\n- .+$/)
  const ol = Model.generate({ unit: "list", count: 2, format: "markdown", listType: "numbered", seed: "mol" })
  assert.match(ol.text, /^1\. .+\n2\. .+$/)
})

test("titles in html and markdown", () => {
  assert.match(Model.generate({ unit: "titles", count: 2, format: "html", seed: "th" }).text, /^<h2>.*<\/h2>\n<h2>.*<\/h2>$/)
  assert.match(Model.generate({ unit: "titles", count: 2, format: "markdown", seed: "tm" }).text, /^## .+\n## .+$/)
})

test("json output is an array of units", () => {
  const r = Model.generate({ unit: "sentences", count: 3, format: "json", seed: "j" })
  const parsed = JSON.parse(r.text)
  assert.deepEqual(parsed, r.items)
})

test("json output with headings pairs title and body", () => {
  const r = Model.generate({ unit: "paragraphs", count: 2, format: "json", headings: true, seed: "jh" })
  const parsed = JSON.parse(r.text)
  assert.equal(parsed.length, 2)
  assert.deepEqual(Object.keys(parsed[0]), ["title", "body"])
})

test("words and characters wrap in a single html paragraph", () => {
  assert.match(Model.generate({ unit: "words", count: 5, format: "html", seed: "wh" }).text, /^<p>[^<]+<\/p>$/)
  assert.match(Model.generate({ unit: "characters", count: 50, format: "html", seed: "ch" }).text, /^<p>[^<]+<\/p>$/)
})

test("escapeHtml", () => {
  assert.equal(Model.escapeHtml("a < b & \"c\""), "a &lt; b &amp; &quot;c&quot;")
})

// ---- Stats and labels --------------------------------------------------------------

test("stats count words and chars", () => {
  const r = Model.generate({ unit: "words", count: 12, seed: "st" })
  assert.equal(r.stats.words, 12)
  assert.equal(r.stats.chars, r.text.length)
  assert.equal(r.stats.unitNoun, "word")
})

test("describe and plural", () => {
  assert.equal(Model.describe({ unit: "paragraphs", count: 3, flavor: "classic", format: "plain" }), "3 paragraphs · Classic · Plain")
  assert.equal(Model.describe({ unit: "list", count: 1, flavor: "cat", format: "html" }), "1 item · Cat · HTML")
  assert.equal(Model.plural(1, "title"), "1 title")
  assert.equal(Model.plural(2, "title"), "2 titles")
})

test("defaultCountFor gives the second preset", () => {
  assert.equal(Model.defaultCountFor("words"), 25)
  assert.equal(Model.defaultCountFor("characters"), 280)
})
