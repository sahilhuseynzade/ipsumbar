// Pure JS core for Omaipsum: placeholder-text generation, option
// validation, and output formatting. No Qt imports so everything here runs
// under `node --test` as well as inside the QML JS engine.

// ---- Random -----------------------------------------------------------------

// 32-bit string hash (FNV-1a) so a typed seed maps to a stable RNG state.
function hashSeed(text) {
  var h = 0x811c9dc5
  var s = String(text || "")
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

// mulberry32: small, fast, good enough for text shuffling.
function makeRng(seed) {
  var a = seed >>> 0
  return function() {
    a = (a + 0x6D2B79F5) >>> 0
    var t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0
}

// ---- Flavors ------------------------------------------------------------------
//
// Every flavor has a vocabulary (`words`) and a signature `opening` used when
// "start with opening" is on. A flavor may also carry a fixed `corpus` of
// real sentences; those flavors read the corpus in order instead of
// scrambling vocabulary, so the output is the genuine passage.

var CLASSIC_WORDS = ("a ac accumsan ad adipiscing aenean aliquam aliquet amet ante aptent arcu at "
  + "auctor augue bibendum blandit class commodo condimentum congue consectetur consequat "
  + "convallis cras cubilia curabitur curae cursus dapibus diam dictum dictumst dignissim dis "
  + "dolor donec dui duis efficitur egestas eget eleifend elementum elit enim erat eros est et "
  + "etiam eu euismod ex facilisi facilisis fames faucibus felis fermentum feugiat finibus "
  + "fringilla fusce gravida habitant habitasse hac hendrerit himenaeos iaculis id imperdiet in "
  + "inceptos integer interdum ipsum justo lacinia lacus laoreet lectus leo libero ligula litora "
  + "lobortis lorem luctus maecenas magna magnis malesuada massa mattis mauris maximus metus mi "
  + "molestie mollis montes morbi mus nam nascetur natoque nec neque netus nibh nisi nisl non "
  + "nostra nulla nullam nunc odio orci ornare parturient pellentesque penatibus per pharetra "
  + "phasellus placerat platea porta porttitor posuere potenti praesent pretium primis proin "
  + "pulvinar purus quam quis quisque rhoncus ridiculus risus rutrum sagittis sapien scelerisque "
  + "sed sem semper senectus sit sociosqu sodales sollicitudin suscipit suspendisse taciti tellus "
  + "tempor tempus tincidunt torquent tortor tristique turpis ullamcorper ultrices ultricies urna "
  + "ut varius vehicula vel velit venenatis vestibulum vitae vivamus viverra volutpat vulputate").split(" ")

// Cicero, De finibus bonorum et malorum 1.32–33 (45 BC) — the passage the
// scrambled "lorem ipsum" was lifted from.
var CICERO_CORPUS = [
  "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
  "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.",
  "Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.",
  "Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur?",
  "Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?",
  "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.",
  "Et harum quidem rerum facilis est et expedita distinctio.",
  "Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus.",
  "Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.",
  "Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat."
]

var ENGLISH_WORDS = ("the quick brown fox jumps over lazy dog morning light spills across quiet "
  + "river while distant hills hold their breath every window opens onto a small garden where "
  + "someone has planted rows of tomatoes and forgotten them again the train arrives late as "
  + "usual carrying letters nobody expects to read we walked along the shore counting stones "
  + "and naming clouds after old friends the kettle sings before anyone is awake maps are only "
  + "promises about places that keep moving a good chair remembers the shape of an afternoon "
  + "bread cools on the sill and the street learns its own name slowly paper boats drift under "
  + "the bridge toward a sea they will never reach the librarian keeps a list of words that "
  + "sound like rain and reads it aloud when the roof leaks nothing here is urgent except the "
  + "light which changes its mind twice before lunch").split(" ")

var HIPSTER_WORDS = ("artisan kombucha sustainable vinyl fixie kale chia seitan tofu farm-to-table "
  + "pour-over cold-brew oat-milk sourdough small-batch hand-crafted bespoke vintage thrift "
  + "flannel beanie mustache tote-bag typewriter polaroid cassette zine letterpress craft "
  + "single-origin ethical locavore microdosing heirloom kombucha tumblr banjo ukulele "
  + "meditation succulent macramé pickled fermented gluten-free raw-denim selvedge "
  + "brunch avocado toast matcha turmeric adaptogen normcore lo-fi cliche irony authentic "
  + "curated intentional slow-living van-life cottagecore analog wabi-sabi hygge minimalist "
  + "biodynamic natural-wine pilsner mezcal negroni tapas roof-garden bike-lane streetwear "
  + "retro celiac paleo keto pabst williamsburg shoreditch kreuzberg portland austin mlkshk").split(" ")

var BACON_WORDS = ("bacon ipsum pork belly ribeye brisket short-ribs tenderloin sirloin flank "
  + "chuck shank shoulder ham hock jowl pancetta prosciutto salami pastrami corned-beef "
  + "kielbasa bresaola andouille chorizo boudin frankfurter bratwurst landjaeger biltong "
  + "jerky meatball meatloaf burgdoggen turducken drumstick chicken turkey venison buffalo "
  + "ribs t-bone porchetta capicola cupim picanha alcatra rump round fatback tri-tip "
  + "leberkas doner kevin spare-ribs tail strip-steak filet mignon smoked cured brined "
  + "grilled roasted braised sizzling crispy juicy tender marbled dry-aged charred glazed").split(" ")

var CUPCAKE_WORDS = ("cupcake ipsum sugar plum candy canes lollipop gummies jelly beans "
  + "marshmallow brownie muffin croissant danish tart pie cheesecake tiramisu macaron "
  + "eclair souffle pudding custard mousse gelato sorbet sherbet toffee caramel butterscotch "
  + "fudge nougat praline truffle bonbon marzipan licorice liquorice gingerbread shortbread "
  + "biscuit cookie wafer pastry donut cotton-candy chocolate vanilla strawberry raspberry "
  + "lemon-drops apple-pie carrot-cake sweet-roll cinnamon dragée halvah chupa-chups "
  + "topping sprinkles frosting icing glaze cream whipped sweet sticky gooey fluffy crunchy").split(" ")

var CORPORATE_WORDS = ("synergy leverage paradigm bandwidth deliverable stakeholder alignment "
  + "roadmap runway scalable agile pivot disrupt ideate incentivize monetize onboarding "
  + "touchpoint mindshare thought-leadership core-competency value-add best-practice "
  + "low-hanging-fruit circle-back deep-dive move-the-needle boil-the-ocean drill-down "
  + "quick-win big-picture win-win holistic robust seamless turnkey enterprise-grade "
  + "cross-functional customer-centric data-driven growth-hacking north-star omnichannel "
  + "ecosystem vertical horizontal blue-sky ballpark granular actionable impactful "
  + "streamline optimize empower enable unlock accelerate transform reimagine "
  + "outside-the-box game-changer secret-sauce table-stakes bleeding-edge "
  + "going-forward end-of-day take-offline stand-up retrospective sprint backlog kpi okr roi").split(" ")

var PIRATE_WORDS = ("ahoy matey avast yo-ho-ho shiver-me-timbers landlubber scallywag scurvy "
  + "buccaneer privateer corsair swashbuckler cutlass flintlock cannon broadside grog rum "
  + "doubloon pieces-of-eight booty treasure chest plunder pillage marooned mutiny walk-the-plank "
  + "jolly-roger crow's-nest mainmast poop-deck quarterdeck galleon schooner sloop brigantine "
  + "keelhaul bilge-rat mizzen starboard port bow stern anchor rigging capstan hardtack "
  + "parrot peg-leg eyepatch hook spyglass compass chart squall gale tempest doldrums kraken "
  + "sea-dog salty deckhand bosun quartermaster captain admiral lookout gunner cabin-boy "
  + "tortuga port-royal nassau caribbean spanish-main davy-jones fathom league knot").split(" ")

var CAT_WORDS = ("meow purr hiss nap sunbeam whiskers paws tail catnip laser-pointer cardboard-box "
  + "windowsill zoomies loaf biscuits knead headbutt slow-blink chirp trill yowl scratch "
  + "scratching-post furball hairball tuna kibble treats wet-food water-bowl litter-box "
  + "midnight sprint hallway curtain climb pounce stalk hunt mouse bird feather string yarn "
  + "sleep stretch yawn groom lick ignore human keyboard laptop warm-spot lap pillow blanket "
  + "knock-it-off-the-table stare judge demand attention aloof cuddle snuggle purring "
  + "toe-beans ear-flick tail-swish whisker-twitch belly-trap ambush plant nibble void").split(" ")

var SPACE_WORDS = ("orbit nebula quasar pulsar supernova galaxy asteroid comet meteor satellite "
  + "rocket capsule launch trajectory apogee perigee delta-v thruster booster payload "
  + "telemetry mission-control countdown ignition liftoff docking rendezvous spacewalk "
  + "eclipse solar lunar stellar interstellar exoplanet horizon gravity vacuum plasma photon "
  + "neutron redshift parallax lightyear parsec wormhole singularity event-horizon dark-matter "
  + "cosmic microwave background constellation zenith nadir aurora magnetosphere heliopause "
  + "rover lander probe module habitat airlock heat-shield reentry splashdown parachute "
  + "andromeda orion cassiopeia lyra vega sirius polaris jupiter saturn titan europa mars").split(" ")

var DEV_WORDS = ("refactor deploy rollback hotfix merge rebase squash branch commit push pull "
  + "fork clone checkout staging production sandbox pipeline build compile lint test "
  + "coverage regression flaky async await promise callback closure mutex semaphore thread "
  + "process daemon socket endpoint payload schema migration index query cache invalidate "
  + "latency throughput backpressure retry timeout idempotent stateless immutable pointer "
  + "null undefined segfault stacktrace breakpoint debugger console verbose flag env config "
  + "yaml json toml docker kubernetes cluster pod node shard replica failover monolith "
  + "microservice serverless edge cdn dns tls handshake token jwt oauth chmod grep "
  + "sed awk vim tmux wayland hyprland quickshell arch btw").split(" ")

var FLAVORS = [
  { id: "classic",   name: "Classic",     opening: "Lorem ipsum dolor sit amet, consectetur adipiscing elit", words: CLASSIC_WORDS },
  { id: "cicero",    name: "Cicero",      opening: "", words: [], corpus: CICERO_CORPUS },
  { id: "english",   name: "English",     opening: "Lorem ipsum dolor sit amet", words: ENGLISH_WORDS },
  { id: "hipster",   name: "Hipster",     opening: "Hipster ipsum dolor amet", words: HIPSTER_WORDS },
  { id: "bacon",     name: "Bacon",       opening: "Bacon ipsum dolor amet", words: BACON_WORDS },
  { id: "cupcake",   name: "Cupcake",     opening: "Cupcake ipsum dolor sit amet", words: CUPCAKE_WORDS },
  { id: "corporate", name: "Corporate",   opening: "Corporate ipsum dolor sit amet", words: CORPORATE_WORDS },
  { id: "pirate",    name: "Pirate",      opening: "Pirate ipsum dolor sit amet", words: PIRATE_WORDS },
  { id: "cat",       name: "Cat",         opening: "Cat ipsum dolor sit amet", words: CAT_WORDS },
  { id: "space",     name: "Space",       opening: "Space ipsum dolor sit amet", words: SPACE_WORDS },
  { id: "dev",       name: "Developer",   opening: "Dev ipsum dolor sit amet", words: DEV_WORDS }
]

// ---- Option catalogues ----------------------------------------------------------

var UNITS = [
  { id: "paragraphs", name: "Paragraphs", icon: "󰉽", presets: [1, 3, 5, 10],        max: 100,   noun: "paragraph" },
  { id: "sentences",  name: "Sentences",  icon: "󰦩", presets: [1, 3, 5, 10],        max: 300,   noun: "sentence" },
  { id: "words",      name: "Words",      icon: "󰀬", presets: [10, 25, 50, 100],    max: 3000,  noun: "word" },
  { id: "characters", name: "Characters", icon: "󰆙", presets: [140, 280, 500, 1000], max: 20000, noun: "character" },
  { id: "list",       name: "List",       icon: "󰉹", presets: [3, 5, 7, 10],        max: 100,   noun: "item" },
  { id: "titles",     name: "Titles",     icon: "󰗴", presets: [1, 3, 5, 10],        max: 100,   noun: "title" }
]

var FORMATS = [
  { id: "plain",    name: "Plain",    icon: "󰦨" },
  { id: "html",     name: "HTML",     icon: "󰌝" },
  { id: "markdown", name: "Markdown", icon: "󰍔" },
  { id: "json",     name: "JSON",     icon: "󰘦" }
]

// Words per sentence.
var SENTENCE_LENGTHS = [
  { id: "short",  name: "Short",  min: 4,  max: 8 },
  { id: "medium", name: "Medium", min: 8,  max: 14 },
  { id: "long",   name: "Long",   min: 14, max: 24 },
  { id: "mixed",  name: "Mixed",  min: 4,  max: 24 }
]

// Sentences per paragraph.
var PARAGRAPH_LENGTHS = [
  { id: "short",  name: "Short",  min: 2, max: 4 },
  { id: "medium", name: "Medium", min: 4, max: 7 },
  { id: "long",   name: "Long",   min: 7, max: 11 },
  { id: "mixed",  name: "Mixed",  min: 2, max: 11 }
]

// Words per title, keyed by the same length ids.
var TITLE_LENGTHS = { short: [2, 4], medium: [3, 6], long: [5, 9], mixed: [2, 9] }

var CASES = [
  { id: "sentence", name: "Sentence" },
  { id: "lower",    name: "lower" },
  { id: "upper",    name: "UPPER" },
  { id: "title",    name: "Title" }
]

var LIST_TYPES = [
  { id: "bullets",  name: "Bullets",  icon: "󰉹" },
  { id: "numbered", name: "Numbered", icon: "󰉻" }
]

function findById(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return null
}

function flavorById(id) { return findById(FLAVORS, id) || FLAVORS[0] }
function unitById(id) { return findById(UNITS, id) || UNITS[0] }
function formatById(id) { return findById(FORMATS, id) || FORMATS[0] }

function defaultOptions() {
  return {
    unit: "paragraphs",
    count: 3,
    flavor: "classic",
    format: "plain",
    startWithOpening: true,
    autoCopy: false,
    sentenceLength: "mixed",
    paragraphLength: "medium",
    textCase: "sentence",
    listType: "bullets",
    headings: false,
    seed: "",
    styleOpen: false
  }
}

function clampInt(value, min, max, fallback) {
  var n = parseInt(value, 10)
  if (!isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

// Coerce anything (a stale settings file, an IPC payload) into a complete,
// valid option set. Unknown keys are dropped; unknown values fall back.
function sanitizeOptions(raw) {
  var d = defaultOptions()
  var o = (raw && typeof raw === "object") ? raw : {}
  var out = {}
  out.unit = findById(UNITS, o.unit) ? o.unit : d.unit
  var unit = unitById(out.unit)
  out.count = clampInt(o.count, 1, unit.max, Math.min(d.count, unit.max))
  out.flavor = findById(FLAVORS, o.flavor) ? o.flavor : d.flavor
  out.format = findById(FORMATS, o.format) ? o.format : d.format
  out.startWithOpening = o.startWithOpening === undefined ? d.startWithOpening : o.startWithOpening === true
  out.autoCopy = o.autoCopy === true
  out.sentenceLength = findById(SENTENCE_LENGTHS, o.sentenceLength) ? o.sentenceLength : d.sentenceLength
  out.paragraphLength = findById(PARAGRAPH_LENGTHS, o.paragraphLength) ? o.paragraphLength : d.paragraphLength
  out.textCase = findById(CASES, o.textCase) ? o.textCase : d.textCase
  out.listType = findById(LIST_TYPES, o.listType) ? o.listType : d.listType
  out.headings = o.headings === true
  out.seed = typeof o.seed === "string" ? o.seed.slice(0, 64) : ""
  out.styleOpen = o.styleOpen === true
  return out
}

// Default count for a unit when the user switches units — keeps the
// number sensible (3 paragraphs → 50 words, not 3 words).
function defaultCountFor(unitId) {
  var unit = unitById(unitId)
  return unit.presets[1]
}

// ---- Word sources -------------------------------------------------------------

function capitalize(word) {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function stripPunctuation(word) {
  return String(word).replace(/^[^\wÀ-ɏ]+|[^\wÀ-ɏ]+$/g, "")
}

function splitWords(text) {
  var parts = String(text || "").split(/\s+/)
  var out = []
  for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(parts[i])
  return out
}

// Vocabulary-backed source: random draws, never the same token twice in a
// row. Multi-word tokens are expanded so word counts stay exact.
function vocabSource(words, rng) {
  var last = -1
  var pending = []
  return {
    next: function() {
      if (pending.length > 0) return pending.shift()
      var idx
      do { idx = Math.floor(rng() * words.length) } while (words.length > 1 && idx === last)
      last = idx
      var parts = splitWords(words[idx])
      for (var i = 1; i < parts.length; i++) pending.push(parts[i].toLowerCase())
      return parts[0].toLowerCase()
    },
    sentence: null
  }
}

// Corpus-backed source: sequential sentences, cycling. `words` yields the
// corpus word stream with punctuation stripped.
function corpusSource(corpus, rng, fromStart) {
  var cursor = fromStart ? 0 : Math.floor(rng() * corpus.length)
  var wordQueue = []
  return {
    next: function() {
      while (wordQueue.length === 0) {
        var parts = splitWords(corpus[cursor % corpus.length])
        cursor++
        for (var i = 0; i < parts.length; i++) {
          var w = stripPunctuation(parts[i]).toLowerCase()
          if (w) wordQueue.push(w)
        }
      }
      return wordQueue.shift()
    },
    sentence: function() {
      var s = corpus[cursor % corpus.length]
      cursor++
      return s
    }
  }
}

function pickWords(source, n) {
  var out = []
  for (var i = 0; i < n; i++) out.push(source.next())
  return out
}

function rangeInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1))
}

// ---- Sentence / paragraph builders ------------------------------------------------

function buildSentence(source, rng, lengthSpec, openingWords) {
  if (source.sentence && !openingWords) return source.sentence()
  var n = rangeInt(rng, lengthSpec.min, lengthSpec.max)
  var words = []
  if (openingWords && openingWords.length > 0) {
    words = openingWords.slice()
    n = Math.max(n, words.length + 2)
  }
  var restNeeded = n - words.length
  var rest = pickWords(source, restNeeded)
  for (var i = 0; i < rest.length; i++) words.push(rest[i])

  // Commas: one for medium sentences, up to two for long ones, never
  // touching the opening (which carries its own comma).
  var openLen = openingWords ? openingWords.length : 0
  var commaSlots = n >= 14 ? 2 : (n >= 7 ? 1 : 0)
  var used = {}
  for (var c = 0; c < commaSlots; c++) {
    var lo = Math.max(2, openLen), hi = n - 3
    if (hi <= lo) break
    var pos = rangeInt(rng, lo, hi)
    if (used[pos] || used[pos - 1] || used[pos + 1]) continue
    used[pos] = true
    words[pos] = words[pos] + ","
  }
  words[0] = capitalize(words[0])
  return words.join(" ") + "."
}

// ---- Case -----------------------------------------------------------------------

function titleCase(text) {
  return String(text).replace(/(^|[\s\-–—(\["'])([^\s\-–—(\["']+)/g, function(m, pre, word) {
    return pre + capitalize(word)
  })
}

function applyCase(text, mode) {
  if (mode === "lower") return String(text).toLowerCase()
  if (mode === "upper") return String(text).toUpperCase()
  if (mode === "title") return titleCase(text)
  return text
}

// ---- Generation ----------------------------------------------------------------
//
// generate(options) → { items, text, stats, seed }
//   items: the raw generated units (strings), before formatting
//   text:  the formatted output for the chosen format
//   stats: { words, chars, units, unitNoun }

function generate(rawOptions) {
  var o = sanitizeOptions(rawOptions)
  var seed = o.seed ? hashSeed(o.seed) : randomSeed()
  var rng = makeRng(seed)
  var flavor = flavorById(o.flavor)
  var unit = unitById(o.unit)
  var sLen = findById(SENTENCE_LENGTHS, o.sentenceLength)
  var pLen = findById(PARAGRAPH_LENGTHS, o.paragraphLength)
  var source = flavor.corpus
    ? corpusSource(flavor.corpus, rng, o.startWithOpening)
    : vocabSource(flavor.words, rng)
  var opening = (o.startWithOpening && flavor.opening) ? splitWords(flavor.opening) : null
  var openingUsed = false

  function nextSentence() {
    var s = buildSentence(source, rng, sLen, openingUsed ? null : opening)
    openingUsed = true
    return s
  }

  function paragraph() {
    var n = rangeInt(rng, pLen.min, pLen.max)
    var parts = []
    for (var i = 0; i < n; i++) parts.push(nextSentence())
    return parts.join(" ")
  }

  function title(lengthId) {
    var r = TITLE_LENGTHS[lengthId || o.sentenceLength] || TITLE_LENGTHS.mixed
    var n = rangeInt(rng, r[0], r[1])
    var words = pickWords(source, n)
    return titleCase(words.join(" "))
  }

  var items = []
  var headings = []
  var i
  if (o.unit === "paragraphs") {
    for (i = 0; i < o.count; i++) {
      // Section headings stay medium length whatever the sentence setting.
      if (o.headings) headings.push(title("medium"))
      items.push(paragraph())
    }
  } else if (o.unit === "sentences") {
    for (i = 0; i < o.count; i++) items.push(nextSentence())
  } else if (o.unit === "words") {
    var words = []
    if (opening) {
      var op = splitWords(flavor.opening)
      for (i = 0; i < op.length && words.length < o.count; i++) words.push(stripPunctuation(op[i]).toLowerCase())
    }
    while (words.length < o.count) words.push(source.next())
    items = words
  } else if (o.unit === "characters") {
    var buf = ""
    while (buf.length < o.count) buf += (buf ? " " : "") + nextSentence()
    buf = buf.slice(0, o.count)
    // Keep the exact length: a trailing space becomes a period.
    if (buf.charAt(buf.length - 1) === " ") buf = buf.slice(0, -1) + "."
    items = [buf]
  } else if (o.unit === "list") {
    for (i = 0; i < o.count; i++) items.push(nextSentence().replace(/[.?!]+$/, ""))
  } else if (o.unit === "titles") {
    for (i = 0; i < o.count; i++) items.push(title())
  }

  for (i = 0; i < items.length; i++) items[i] = applyCase(items[i], o.textCase)
  for (i = 0; i < headings.length; i++) headings[i] = applyCase(headings[i], o.textCase)

  var text = formatOutput(items, headings, o)
  var plainWords = 0
  for (i = 0; i < items.length; i++) plainWords += splitWords(items[i]).length
  for (i = 0; i < headings.length; i++) plainWords += splitWords(headings[i]).length

  return {
    items: items,
    headings: headings,
    text: text,
    seed: seed,
    stats: {
      words: plainWords,
      chars: text.length,
      units: o.unit === "characters" ? items[0].length : items.length,
      unitNoun: unit.noun
    }
  }
}

// ---- Formatting ----------------------------------------------------------------

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatOutput(items, headings, o) {
  var i, out = []
  var withHeadings = o.unit === "paragraphs" && o.headings && headings.length === items.length
  var numbered = o.listType === "numbered"

  if (o.format === "json") {
    if (withHeadings) {
      var objs = []
      for (i = 0; i < items.length; i++) objs.push({ title: headings[i], body: items[i] })
      return JSON.stringify(objs, null, 2)
    }
    return JSON.stringify(items, null, 2)
  }

  if (o.unit === "words") {
    var line = items.join(" ")
    if (o.format === "html") return "<p>" + escapeHtml(line) + "</p>"
    return line
  }

  if (o.unit === "list") {
    if (o.format === "html") {
      var tag = numbered ? "ol" : "ul"
      out.push("<" + tag + ">")
      for (i = 0; i < items.length; i++) out.push("  <li>" + escapeHtml(items[i]) + "</li>")
      out.push("</" + tag + ">")
      return out.join("\n")
    }
    if (o.format === "markdown") {
      for (i = 0; i < items.length; i++) out.push((numbered ? (i + 1) + ". " : "- ") + items[i])
      return out.join("\n")
    }
    for (i = 0; i < items.length; i++) out.push(numbered ? (i + 1) + ". " + items[i] : items[i])
    return out.join("\n")
  }

  if (o.unit === "titles") {
    for (i = 0; i < items.length; i++) {
      if (o.format === "html") out.push("<h2>" + escapeHtml(items[i]) + "</h2>")
      else if (o.format === "markdown") out.push("## " + items[i])
      else out.push(items[i])
    }
    return out.join("\n")
  }

  if (o.unit === "sentences" || o.unit === "characters") {
    var block = items.join(" ")
    if (o.format === "html") return "<p>" + escapeHtml(block) + "</p>"
    return block
  }

  // paragraphs
  for (i = 0; i < items.length; i++) {
    if (o.format === "html") {
      var p = "<p>" + escapeHtml(items[i]) + "</p>"
      out.push(withHeadings ? "<h2>" + escapeHtml(headings[i]) + "</h2>\n" + p : p)
    } else if (o.format === "markdown") {
      if (withHeadings) out.push("## " + headings[i])
      out.push(items[i])
    } else {
      if (withHeadings) out.push(headings[i])
      out.push(items[i])
    }
  }
  return out.join(o.format === "html" && !withHeadings ? "\n" : "\n\n")
}

// ---- Labels -------------------------------------------------------------------

function plural(n, noun) {
  return n + " " + noun + (n === 1 ? "" : "s")
}

// "3 paragraphs · Classic · HTML" — the hero status line and notifications.
function describe(rawOptions) {
  var o = sanitizeOptions(rawOptions)
  return plural(o.count, unitById(o.unit).noun) + " · " + flavorById(o.flavor).name + " · " + formatById(o.format).name
}

// Parse an IPC payload (JSON object or empty) into option overrides.
function parseOverrides(raw) {
  var s = String(raw || "").trim()
  if (!s) return {}
  try {
    var parsed = JSON.parse(s)
    return (parsed && typeof parsed === "object") ? parsed : {}
  } catch (e) {
    return {}
  }
}

function mergeOptions(base, overrides) {
  var merged = {}
  var b = sanitizeOptions(base)
  for (var k in b) merged[k] = b[k]
  var ov = overrides || {}
  for (var k2 in ov) merged[k2] = ov[k2]
  return sanitizeOptions(merged)
}

if (typeof module !== "undefined" && module && module.exports) {
  module.exports = {
    FLAVORS: FLAVORS,
    UNITS: UNITS,
    FORMATS: FORMATS,
    SENTENCE_LENGTHS: SENTENCE_LENGTHS,
    PARAGRAPH_LENGTHS: PARAGRAPH_LENGTHS,
    CASES: CASES,
    LIST_TYPES: LIST_TYPES,
    hashSeed: hashSeed,
    makeRng: makeRng,
    defaultOptions: defaultOptions,
    sanitizeOptions: sanitizeOptions,
    defaultCountFor: defaultCountFor,
    unitById: unitById,
    flavorById: flavorById,
    formatById: formatById,
    splitWords: splitWords,
    titleCase: titleCase,
    applyCase: applyCase,
    escapeHtml: escapeHtml,
    generate: generate,
    formatOutput: formatOutput,
    describe: describe,
    plural: plural,
    parseOverrides: parseOverrides,
    mergeOptions: mergeOptions
  }
}
