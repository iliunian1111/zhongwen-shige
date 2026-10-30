/* 中文诗歌 · 诗词图书馆 */
const STORAGE_FAVS = "zhongwen-shige-favs-v1"
const STORAGE_RECENT = "zhongwen-shige-recent-v1"
const STORAGE_PROGRESS = "zhongwen-shige-progress-v1"

const state = {
  library: null,
  dailyPool: null,
  view: "today",
  book: null,
  poems: [],
  filtered: [],
  batch: 0,
  page: 1,
  pageSize: 20,
  query: "",
  current: null,
  status: "",
  floorId: null
}

const app = () => document.getElementById("app")
const $ = (id) => document.getElementById(id)

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/")
}

/** 保证相对站点根目录取数（避免无尾部 / 时路径跑偏） */
function assetUrl(path) {
  const base = document.baseURI || location.href
  const root = base.replace(/\/[^/]*$/, "/")
  return new URL(encodePath(path), root).href
}

async function fetchJson(path) {
  const res = await fetch(assetUrl(path), { cache: "no-cache" })
  if (!res.ok) throw new Error("加载失败")
  return res.json()
}

function decodeRouteId(id) {
  if (!id) return ""
  try {
    return decodeURIComponent(id)
  } catch (e) {
    return id
  }
}

function authorMatch(itemAuthor, target) {
  if (!target) return true
  const a = String(itemAuthor || "").normalize("NFC").trim()
  const b = String(target).normalize("NFC").trim()
  return a === b
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function normalize(item, shelfName, source) {
  const linesRaw = item.paragraphs || item.content || []
  const lines = Array.isArray(linesRaw) ? linesRaw.filter(Boolean) : [String(linesRaw)]
  const title = item.title || item.rhythmic || item.chapter || "无题"
  const author = item.author || "佚名"
  const rhythmic = item.rhythmic || ""
  const id = item.id || [shelfName, source, title, author, lines[0] || ""].join("|")
  return { id, title, author, rhythmic, lines, shelf: shelfName || "", source: source || "" }
}

function isReadablePoem(p) {
  return p && p.lines && p.lines.some((l) => String(l).trim())
}

function loadStore(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]") } catch { return [] }
}
function saveStore(key, value) { localStorage.setItem(key, JSON.stringify(value)) }
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_PROGRESS) || "{}") } catch { return {} }
}
function markProgress(bookId) {
  const p = loadProgress()
  p[bookId] = Date.now()
  localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(p))
}
function isFav(id) { return loadStore(STORAGE_FAVS).some((x) => x.id === id) }

function toggleFav(poem) {
  const list = loadStore(STORAGE_FAVS)
  const i = list.findIndex((x) => x.id === poem.id)
  if (i >= 0) list.splice(i, 1)
  else list.unshift(slim(poem))
  saveStore(STORAGE_FAVS, list.slice(0, 500))
}

function slim(poem) {
  return {
    id: poem.id,
    title: poem.title,
    author: poem.author,
    rhythmic: poem.rhythmic,
    lines: poem.lines,
    shelf: poem.shelf
  }
}

function pushRecent(poem) {
  const list = loadStore(STORAGE_RECENT).filter((x) => x.id !== poem.id)
  list.unshift(slim(poem))
  saveStore(STORAGE_RECENT, list.slice(0, 40))
}

function dayIndex(len) {
  const d = new Date()
  return (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) % Math.max(len, 1)
}

function setNav(active) {
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === active)
  })
}

async function ensureLibrary() {
  if (!state.library) state.library = await fetchJson("library.json?v=6")
  return state.library
}
async function ensureDaily() {
  if (!state.dailyPool) state.dailyPool = await fetchJson("daily-pool.json?v=6")
  return state.dailyPool
}

function bookById(id) {
  return state.library && state.library.books[id]
}

function route() {
  const hash = location.hash.replace(/^#\/?/, "")
  const parts = hash.split("/").filter(Boolean)
  const name = parts[0] || "today"
  if (name === "today" || !parts.length) return renderToday()
  if (name === "library") {
    if (parts[1] === "floor" && parts[2]) return renderFloor(decodeRouteId(parts[2]))
    if (parts[1] === "hub" && parts[2]) return renderHub(decodeRouteId(parts[2]))
    if (parts[1] === "book" && parts[2]) {
      return openBook(decodeRouteId(parts[2]), Number(parts[3] || 0))
    }
    return renderLibraryHome()
  }
  if (name === "read") return renderReader()
  if (name === "search") return renderSearch()
  if (name === "favs") return renderFavs()
  return renderToday()
}

function verseLineHtml(line) {
  const text = String(line || "").trim()
  if (!text) return ""
  // 按文言标点切成短语；短语内部不换行，整句才显得工整
  const parts = text.split(/(?<=[，。；？！、：])/).filter(Boolean)
  if (parts.length <= 1 && text.length <= 18) {
    return `<p class="verse-line verse-line--single">${escapeHtml(text)}</p>`
  }
  if (parts.length <= 1) {
    return `<p class="verse-line verse-line--single">${escapeHtml(text)}</p>`
  }
  return `<p class="verse-line">${parts.map((p) => `<span class="phrase">${escapeHtml(p)}</span>`).join("")}</p>`
}

/* —— 语音朗读（浏览器自带，无需服务器） —— */
const tts = {
  speaking: false,
  poemId: null,
  supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window
  },
  stop() {
    if (!this.supported()) return
    window.speechSynthesis.cancel()
    this.speaking = false
    this.poemId = null
    syncSpeakButtons()
  },
  pickVoice() {
    const voices = window.speechSynthesis.getVoices() || []
    return (
      voices.find((v) => /zh(-|_)?CN/i.test(v.lang)) ||
      voices.find((v) => /zh(-|_)?TW|zh(-|_)?HK/i.test(v.lang)) ||
      voices.find((v) => /^zh/i.test(v.lang)) ||
      null
    )
  },
  speak(poem) {
    if (!this.supported()) {
      alert("当前浏览器暂不支持朗读，可换 Safari / Chrome 再试")
      return
    }
    if (this.speaking && this.poemId === poem.id) {
      this.stop()
      return
    }
    this.stop()
    const parts = [poem.title, poem.author]
    if (poem.rhythmic) parts.push(poem.rhythmic)
    parts.push(...(poem.lines || []))
    const text = parts.filter(Boolean).join("。")
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = "zh-CN"
    utter.rate = 0.86
    utter.pitch = 1
    const voice = this.pickVoice()
    if (voice) utter.voice = voice
    utter.onend = () => {
      this.speaking = false
      this.poemId = null
      syncSpeakButtons()
    }
    utter.onerror = () => {
      this.speaking = false
      this.poemId = null
      syncSpeakButtons()
    }
    this.speaking = true
    this.poemId = poem.id
    syncSpeakButtons()
    // 部分浏览器需等 voices 就绪
    const start = () => window.speechSynthesis.speak(utter)
    if ((window.speechSynthesis.getVoices() || []).length) start()
    else {
      window.speechSynthesis.onvoiceschanged = () => {
        const v = this.pickVoice()
        if (v) utter.voice = v
        start()
      }
      // 兜底：短暂延迟后再读
      setTimeout(start, 200)
    }
  }
}

function syncSpeakButtons() {
  document.querySelectorAll("[data-speak]").forEach((btn) => {
    const on = tts.speaking && tts.poemId === btn.dataset.speak
    btn.classList.toggle("speaking", on)
    btn.setAttribute("aria-pressed", on ? "true" : "false")
    btn.title = on ? "停止朗读" : "朗读此诗"
    const label = btn.querySelector(".speak-label")
    if (label) label.textContent = on ? "朗读中" : "朗读"
  })
}

function speakButton(poem) {
  if (!tts.supported()) return ""
  const on = tts.speaking && tts.poemId === poem.id
  return `
    <button type="button" class="speak-btn ${on ? "speaking" : ""}" data-speak="${escapeHtml(poem.id)}"
      aria-label="朗读此诗" aria-pressed="${on ? "true" : "false"}" title="朗读此诗">
      <span class="speak-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.3-3.9v7.8A4.5 4.5 0 0 0 16.5 12zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>
        </svg>
      </span>
      <span class="speak-label">${on ? "朗读中" : "朗读"}</span>
    </button>
  `
}

function bindSpeakButton(poem) {
  const btn = document.querySelector(`[data-speak="${CSS.escape(poem.id)}"]`)
  if (!btn) return
  btn.onclick = (e) => {
    e.stopPropagation()
    tts.speak(poem)
  }
}

function readingBlock(poem, actions = "") {
  const meta = [poem.author, poem.rhythmic, poem.shelf].filter(Boolean).join(" · ")
  return `
    <article class="reading">
      <div class="title-row">
        <h1 class="title">${escapeHtml(poem.title)}</h1>
        ${speakButton(poem)}
      </div>
      <div class="meta">${escapeHtml(meta)}</div>
      <div class="verse">${poem.lines.map(verseLineHtml).join("")}</div>
      ${actions}
    </article>
  `
}

/* ========== 今日 ========== */
async function renderToday() {
  setNav("today")
  state.view = "today"
  app().innerHTML = `<p class="status-line">正在开卷…</p>`
  try {
    const [pool, lib] = await Promise.all([ensureDaily(), ensureLibrary()])
    const poem = pool[dayIndex(pool.length)]
    if (!poem.id) poem.id = ["daily", poem.title, poem.author, poem.lines[0]].join("|")
    state.current = poem
    const fav = isFav(poem.id)
    const path = lib.learningPath || []
    app().innerHTML = `
      <section class="today">
        <p class="today-kicker">今日一诗</p>
        ${readingBlock(poem, `
          <div class="actions">
            <button class="btn soft" type="button" id="btnAnother">换一首</button>
            <button class="btn ghost ${fav ? "fav-on" : ""}" type="button" id="btnFav">${fav ? "已在书架" : "放入书架"}</button>
            <a class="btn" href="#/library">去图书馆</a>
          </div>
        `)}
        <p class="hint">选自入门读本 · 喜欢就放进「我的书架」</p>

        <div class="path-card">
          <div class="path-head">
            <h2>学习路径</h2>
            <p>不知道从哪读起时，按这五步走</p>
          </div>
          <ol class="path-steps">
            ${path.map((s) => {
              const b = bookById(s.book)
              return `
                <li>
                  <button type="button" class="path-step" data-book="${s.book}">
                    <span class="n">${s.step}</span>
                    <span class="t">${escapeHtml(s.title)}</span>
                    <span class="d">${escapeHtml(s.note)}${b ? " · " + escapeHtml(b.name) : ""}</span>
                  </button>
                </li>
              `
            }).join("")}
          </ol>
        </div>
      </section>
    `
    bindSpeakButton(poem)
    $("btnAnother").onclick = () => {
      tts.stop()
      const next = pool[Math.floor(Math.random() * pool.length)]
      if (!next.id) next.id = ["daily", next.title, next.author, next.lines[0]].join("|")
      state.current = next
      location.hash = "#/read"
    }
    $("btnFav").onclick = () => { toggleFav(poem); renderToday() }
    app().querySelectorAll(".path-step").forEach((btn) => {
      btn.onclick = () => goBook(btn.dataset.book)
    })
  } catch (e) {
    app().innerHTML = `<p class="empty">开卷失败，请稍后刷新</p>`
  }
}

function goBook(id) {
  const b = bookById(id)
  if (!b) return
  const enc = encodeURIComponent(id)
  if (b.mode === "era-hub" || b.mode === "form-hub" || b.mode === "bundle") {
    location.hash = `#/library/hub/${enc}`
  } else {
    location.hash = `#/library/book/${enc}`
  }
}

/* ========== 图书馆总览 ========== */
async function renderLibraryHome() {
  setNav("library")
  state.view = "library"
  const lib = await ensureLibrary()
  const progress = loadProgress()
  app().innerHTML = `
    <div class="section-head">
      <h2>图书馆</h2>
      <p>按阅读习惯分楼层，不按文件堆放</p>
    </div>
    <p class="guide">${escapeHtml(lib.inventoryNote || "")}</p>
    <div class="floor-map">
      ${lib.floors.map((f, i) => `
        <a class="floor-card" href="#/library/floor/${f.id}" style="animation-delay:${i * 50}ms">
          <div class="floor-no">0${i + 1}</div>
          <div>
            <h3>${escapeHtml(f.name)}</h3>
            <p>${escapeHtml(f.guide)}</p>
          </div>
        </a>
      `).join("")}
    </div>
    <div class="group-label">最近在读</div>
    <div class="chip-row" id="recentBooks"></div>
  `
  const recentIds = Object.entries(progress)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id)
  const box = $("recentBooks")
  if (!recentIds.length) {
    box.innerHTML = `<span class="status-line">还没有阅读记录。从「入门之路」或上方学习路径开始。</span>`
  } else {
    box.innerHTML = recentIds.map((id) => {
      const b = bookById(id)
      if (!b) return ""
      return `<button class="chip" type="button" data-id="${id}">${escapeHtml(b.name)}</button>`
    }).join("")
    box.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.onclick = () => goBook(btn.dataset.id)
    })
  }
}

async function renderFloor(floorId) {
  setNav("library")
  const lib = await ensureLibrary()
  const floor = lib.floors.find((f) => f.id === floorId)
  if (!floor) {
    app().innerHTML = `<p class="empty">没有这一层</p>`
    return
  }
  state.floorId = floorId

  const renderRoom = (id) => {
    const b = bookById(id)
    if (!b) return ""
    return `
      <button type="button" class="shelf" data-id="${id}">
        <div class="era">${escapeHtml([b.era, b.form].filter(Boolean).join(" · "))}</div>
        <h3>${escapeHtml(b.name)}</h3>
        <p>${escapeHtml(b.why || b.blurb || "")}</p>
        <div class="count">${fmtCount(b.count)} 首可读</div>
      </button>
    `
  }

  let body = ""
  if (floor.sections) {
    body = floor.sections.map((sec) => `
      <div class="group-label">${escapeHtml(sec.name)}</div>
      <div class="shelf-grid">${sec.rooms.map(renderRoom).join("")}</div>
    `).join("")
  } else {
    body = `<div class="shelf-grid">${(floor.rooms || []).map(renderRoom).join("")}</div>`
  }

  app().innerHTML = `
    <div class="browse-bar">
      <button class="btn ghost" type="button" id="backLib">图书馆</button>
      <h1>${escapeHtml(floor.name)}</h1>
    </div>
    <p class="guide">${escapeHtml(floor.guide)}</p>
    ${body}
  `
  $("backLib").onclick = () => { location.hash = "#/library" }
  app().querySelectorAll(".shelf[data-id]").forEach((el) => {
    el.onclick = () => goBook(el.dataset.id)
  })
}

async function renderHub(bookId) {
  setNav("library")
  const lib = await ensureLibrary()
  const b = bookById(bookId)
  if (!b) {
    app().innerHTML = `<p class="empty">未找到</p>`
    return
  }

  const linkBook = (id, label) => {
    const x = bookById(id)
    if (!x) return ""
    return `
      <button type="button" class="shelf" data-id="${id}">
        <div class="era">${escapeHtml(label || [x.era, x.form].filter(Boolean).join(" · "))}</div>
        <h3>${escapeHtml(x.name)}</h3>
        <p>${escapeHtml(x.why || x.blurb || "")}</p>
        <div class="count">${fmtCount(x.count)} 首</div>
      </button>
    `
  }

  let sections = ""
  if (b.mode === "bundle" || b.mode === "form-hub") {
    const ids = b.children || b.entry || []
    sections += `
      <div class="group-label">建议从这里读</div>
      <div class="shelf-grid">${ids.map((id) => linkBook(id)).join("")}</div>
    `
  }
  if (b.mode === "era-hub") {
    sections += `
      <div class="hub-intro">
        <p class="why">${escapeHtml(b.why || "")}</p>
        <p>${escapeHtml(b.blurb || "")}</p>
      </div>
      <div class="group-label">① 先读选本</div>
      <div class="shelf-grid">${(b.entry || []).map((id) => linkBook(id, "入门选本")).join("")}</div>
      <div class="group-label">② 再跟名家</div>
      <div class="shelf-grid">${(b.masters || []).map((id) => linkBook(id, "名家专架")).join("")}</div>
      <div class="group-label">③ 需要时再进全库</div>
      <div class="shelf-grid">
        ${b.corpus ? linkBook(b.corpus, "闭架大库") : ""}
        ${b.corpusAlt ? linkBook(b.corpusAlt, "闭架大库") : ""}
      </div>
    `
  }

  app().innerHTML = `
    <div class="browse-bar">
      <button class="btn ghost" type="button" id="back">返回</button>
      <h1>${escapeHtml(b.name)}</h1>
    </div>
    ${sections}
  `
  $("back").onclick = () => history.back()
  app().querySelectorAll(".shelf[data-id]").forEach((el) => {
    el.onclick = () => goBook(el.dataset.id)
  })
}

function fmtCount(n) {
  if (!n && n !== 0) return "—"
  return Number(n).toLocaleString("zh-CN")
}

/* ========== 打开一本书 ========== */
async function openBook(bookId, batch = 0) {
  setNav("library")
  await ensureLibrary()
  const book = bookById(bookId)
  if (!book) {
    app().innerHTML = `<p class="empty">未找到这本书</p>`
    return
  }
  if (book.mode === "era-hub" || book.mode === "form-hub" || book.mode === "bundle") {
    return renderHub(bookId)
  }

  state.book = book
  state.batch = batch
  state.page = 1
  state.query = ""
  markProgress(bookId)
  app().innerHTML = `<p class="status-line">正在打开《${escapeHtml(book.name)}》…</p>`
  try {
    await loadBookPoems(book, batch)
    renderBrowse()
  } catch (e) {
    console.error(e)
    app().innerHTML = `<p class="empty">暂时打不开，请稍后重试</p>`
  }
}

async function loadBookPoems(book, batch) {
  let files = book.files || []
  const BATCH = 1
  if (book.mode === "corpus") {
    const start = Math.min(Math.max(batch, 0), Math.max(files.length - 1, 0))
    state.batch = start
    files = files.slice(start, start + BATCH)
  }

  if (!files.length) {
    state.poems = []
    state.filtered = []
    state.status = `${book.name}暂无篇目`
    return
  }

  const poems = []
  let done = 0
  const total = files.length

  // 分片并行拉取，单片失败不拖垮整架
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const data = await fetchJson(file)
        done += 1
        if (book.mode === "author" && total > 1) {
          app().innerHTML = `<p class="status-line">正在打开《${escapeHtml(book.name)}》… ${done}/${total}</p>`
        }
        return Array.isArray(data) ? data : []
      } catch (e) {
        done += 1
        console.warn("load fail", file, e)
        return []
      }
    })
  )

  for (let i = 0; i < results.length; i++) {
    const arr = results[i]
    const file = files[i]
    for (const item of arr) {
      if (!item || typeof item !== "object") continue
      if ("desc" in item && "name" in item && !item.paragraphs && !item.content && !item.title) continue
      if (book.mode === "author" && book.author) {
        if (!authorMatch(item.author, book.author)) continue
      }
      const p = normalize(item, book.name, file)
      if (isReadablePoem(p)) poems.push(p)
    }
  }

  state.poems = poems
  state.filtered = poems
  if (book.mode === "corpus") {
    state.status = `随手翻到第 ${state.batch + 1} 迭 · 本迭 ${poems.length} 首（全书约 ${fmtCount(book.count)} 首）`
  } else if (book.mode === "author") {
    state.status = `${book.name}专架 · ${poems.length} 首`
  } else {
    state.status = `共 ${poems.length} 首`
  }
}

function renderBrowse() {
  const book = state.book
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize))
  if (state.page > totalPages) state.page = totalPages
  const start = (state.page - 1) * state.pageSize
  const pageItems = state.filtered.slice(start, start + state.pageSize)

  const corpusNav = book.mode === "corpus" ? `
    <div class="chip-row">
      <button class="chip" type="button" id="prevBatch" ${state.batch <= 0 ? "disabled" : ""}>再往前翻</button>
      <button class="chip" type="button" id="nextBatch" ${state.batch >= book.files.length - 1 ? "disabled" : ""}>继续往后翻</button>
      <button class="chip" type="button" id="findAuthor">找一位作者</button>
      <a class="chip" href="#/search">去找诗</a>
    </div>
    <p class="guide">全库很大，不必一次读完。像在闭架库里抽一迭书，慢慢翻即可。</p>
  ` : ""

  app().innerHTML = `
    <div class="browse-bar">
      <button class="btn ghost" type="button" id="back">返回</button>
      <h1>${escapeHtml(book.name)}</h1>
    </div>
    <p class="why-line">${escapeHtml(book.why || book.blurb || "")}</p>
    <p class="status-line">${escapeHtml(state.status)}${state.query ? ` · 「${escapeHtml(state.query)}」${state.filtered.length} 首` : ""}</p>
    ${corpusNav}
    <div class="browse-bar">
      <input class="field" id="q" type="search" placeholder="在本书中找：标题、作者、句子" value="${escapeHtml(state.query)}" />
    </div>
    <div class="poem-list">
      ${pageItems.map((p, i) => `
        <div class="poem-row" data-idx="${start + i}">
          <div>
            <strong>${escapeHtml(p.title)}</strong>
            <div class="sub">${escapeHtml([p.author, p.rhythmic].filter(Boolean).join(" · "))}</div>
          </div>
          <div class="preview">${escapeHtml((p.lines[0] || "").slice(0, 18))}</div>
        </div>
      `).join("") || `<div class="empty">没有符合的篇目</div>`}
    </div>
    <div class="pager">
      <button class="btn ghost" type="button" id="prevPage" ${state.page <= 1 ? "disabled" : ""}>上一页</button>
      <span>${state.page} / ${totalPages}</span>
      <button class="btn ghost" type="button" id="nextPage" ${state.page >= totalPages ? "disabled" : ""}>下一页</button>
    </div>
  `

  $("back").onclick = () => history.back()
  $("q").oninput = (e) => {
    state.query = e.target.value.trim()
    state.page = 1
    filterBook()
    renderBrowse()
  }
  app().querySelectorAll(".poem-row[data-idx]").forEach((el) => {
    el.onclick = () => {
      state.current = state.filtered[Number(el.dataset.idx)]
      pushRecent(state.current)
      location.hash = "#/read"
    }
  })
  $("prevPage").onclick = () => { state.page -= 1; renderBrowse() }
  $("nextPage").onclick = () => { state.page += 1; renderBrowse() }

  const prevB = $("prevBatch")
  const nextB = $("nextBatch")
  if (prevB) prevB.onclick = () => { location.hash = `#/library/book/${book.id}/${state.batch - 1}` }
  if (nextB) nextB.onclick = () => { location.hash = `#/library/book/${book.id}/${state.batch + 1}` }
  const findA = $("findAuthor")
  if (findA) findA.onclick = () => findAuthorInCorpus(book)
}

function filterBook() {
  const q = state.query
  if (!q) { state.filtered = state.poems; return }
  state.filtered = state.poems.filter((p) =>
    p.title.includes(q) ||
    p.author.includes(q) ||
    (p.rhythmic && p.rhythmic.includes(q)) ||
    p.lines.some((l) => l.includes(q))
  )
}

async function findAuthorInCorpus(book) {
  const name = prompt("想找哪位作者？（如：李白）")
  if (!name) return
  app().innerHTML = `<p class="status-line">正在书架间查找「${escapeHtml(name)}」…</p>`
  try {
    const index = await fetchJson(book.authorIndex)
    let keys = Object.keys(index).filter((k) => k === name || k.includes(name))
    if (!keys.length) {
      app().innerHTML = `
        <p class="empty">没有找到「${escapeHtml(name)}」</p>
        <div class="actions"><button class="btn ghost" id="back">返回</button></div>
      `
      $("back").onclick = () => renderBrowse()
      return
    }
    keys = keys.slice(0, 6)
    const shardNums = [...new Set(keys.flatMap((k) => index[k]))]
    const files = book.files.filter((f) => {
      const m = f.match(/(\d+)\.json$/)
      return m && shardNums.includes(Number(m[1]))
    })
    const poems = []
    for (const file of files.slice(0, 20)) {
      const data = await fetchJson(file)
      for (const item of data) {
        if (!item || !item.author) continue
        if (!keys.some((k) => item.author === k || item.author.includes(name))) continue
        const p = normalize(item, book.name, file)
        if (isReadablePoem(p)) poems.push(p)
      }
    }
    state.poems = poems
    state.filtered = poems
    state.query = name
    state.page = 1
    state.status = `找到与「${name}」相关 ${poems.length} 首`
    renderBrowse()
  } catch {
    app().innerHTML = `<p class="empty">查找失败</p>`
  }
}

/* ========== 阅读 ========== */
function renderReader() {
  setNav(state.view === "favs" ? "favs" : state.view === "search" ? "search" : "library")
  const poem = state.current
  if (!poem) {
    app().innerHTML = `<p class="empty">还没有打开篇目</p><div class="actions"><a class="btn" href="#/library">去图书馆</a></div>`
    return
  }
  pushRecent(poem)
  const fav = isFav(poem.id)
  app().innerHTML = `
    <section class="reader-wrap">
      <div class="reader-tools">
        <button class="btn ghost" type="button" id="backBtn">返回</button>
        <button class="btn ghost ${fav ? "fav-on" : ""}" type="button" id="favBtn">${fav ? "已在书架" : "放入书架"}</button>
      </div>
      ${readingBlock(poem)}
    </section>
  `
  bindSpeakButton(poem)
  $("backBtn").onclick = () => { tts.stop(); history.back() }
  $("favBtn").onclick = () => { toggleFav(poem); renderReader() }
}

/* ========== 找诗 ========== */
async function renderSearch() {
  setNav("search")
  state.view = "search"
  await ensureLibrary()
  app().innerHTML = `
    <div class="section-head">
      <h2>找诗</h2>
      <p>先在入门读本里找；知道作者时，再进唐、宋专库</p>
    </div>
    <div class="search-box">
      <div class="row">
        <input class="field" id="q" type="search" placeholder="输入诗题、作者、词牌或一句诗" />
        <button class="btn" type="button" id="go">查找</button>
      </div>
      <div class="tabs">
        <button class="chip active" type="button" data-scope="path">入门读本</button>
        <button class="chip" type="button" data-scope="tang-author">唐诗作者</button>
        <button class="chip" type="button" data-scope="ci-author">宋词作者</button>
      </div>
    </div>
    <div id="results">
      <p class="guide">小提示：不确定作者时，用「入门读本」；确定是李白杜甫时，用作者查找更快。</p>
    </div>
  `
  let scope = "path"
  app().querySelectorAll(".chip[data-scope]").forEach((c) => {
    c.onclick = () => {
      scope = c.dataset.scope
      app().querySelectorAll(".chip[data-scope]").forEach((x) => x.classList.toggle("active", x === c))
    }
  })
  const run = () => doSearch($("q").value.trim(), scope)
  $("go").onclick = run
  $("q").onkeydown = (e) => { if (e.key === "Enter") run() }
}

async function doSearch(q, scope) {
  const box = $("results")
  if (!q) {
    box.innerHTML = `<p class="empty">请输入要找的内容</p>`
    return
  }
  box.innerHTML = `<p class="status-line">查找中…</p>`
  const lib = await ensureLibrary()
  try {
    if (scope === "path") {
      const floor = lib.floors.find((f) => f.id === "path")
      const hits = []
      for (const id of floor.rooms) {
        const book = bookById(id)
        for (const file of book.files || []) {
          const data = await fetchJson(file)
          for (const item of (Array.isArray(data) ? data : [])) {
            const p = normalize(item, book.name, file)
            if (!isReadablePoem(p)) continue
            const blob = [p.title, p.author, p.rhythmic, ...p.lines].join("\n")
            if (blob.includes(q)) hits.push(p)
            if (hits.length >= 60) break
          }
          if (hits.length >= 60) break
        }
        if (hits.length >= 60) break
      }
      return renderHits(box, hits, `在入门读本中找到 ${hits.length} 首`)
    }

    const corpusId = scope === "ci-author" ? "quan-song-ci" : "quan-tang"
    const book = bookById(corpusId)
    const index = await fetchJson(book.authorIndex)
    let keys = Object.keys(index).filter((k) => k === q || k.includes(q))
    if (!keys.length) {
      box.innerHTML = `<p class="empty">没有找到作者「${escapeHtml(q)}」</p>`
      return
    }
    keys = keys.slice(0, 8)
    const shardNums = [...new Set(keys.flatMap((k) => index[k]))].slice(0, 16)
    const files = book.files.filter((f) => {
      const m = f.match(/(\d+)\.json$/)
      return m && shardNums.includes(Number(m[1]))
    })
    const hits = []
    for (const file of files) {
      const data = await fetchJson(file)
      for (const item of data) {
        if (!item || !item.author) continue
        if (!keys.some((k) => item.author === k || item.author.includes(q))) continue
        const p = normalize(item, book.name, file)
        if (isReadablePoem(p)) hits.push(p)
        if (hits.length >= 100) break
      }
      if (hits.length >= 100) break
    }
    renderHits(box, hits, `与「${q}」相关 ${hits.length} 首`)
  } catch {
    box.innerHTML = `<p class="empty">查找失败</p>`
  }
}

function renderHits(box, hits, label) {
  box.innerHTML = `
    <p class="status-line">${escapeHtml(label)}</p>
    <div class="poem-list">
      ${hits.map((p, i) => `
        <div class="poem-row" data-i="${i}">
          <div>
            <strong>${escapeHtml(p.title)}</strong>
            <div class="sub">${escapeHtml([p.author, p.shelf, p.rhythmic].filter(Boolean).join(" · "))}</div>
          </div>
          <div class="preview">${escapeHtml((p.lines[0] || "").slice(0, 18))}</div>
        </div>
      `).join("") || `<div class="empty">没有结果</div>`}
    </div>
  `
  box.querySelectorAll(".poem-row").forEach((el) => {
    el.onclick = () => {
      state.current = hits[Number(el.dataset.i)]
      state.view = "search"
      location.hash = "#/read"
    }
  })
}

/* ========== 我的书架 ========== */
function renderFavs() {
  setNav("favs")
  state.view = "favs"
  const favs = loadStore(STORAGE_FAVS)
  const recent = loadStore(STORAGE_RECENT)
  app().innerHTML = `
    <div class="section-head">
      <h2>我的书架</h2>
      <p>收藏与最近阅读保存在本机，换设备不会带走</p>
    </div>
    <div class="group-label">收藏 · ${favs.length}</div>
    <div class="poem-list" id="favList">
      ${favs.map((p, i) => rowHtml(p, i)).join("") || `<div class="empty">书架还空着。读到喜欢的，点「放入书架」。</div>`}
    </div>
    <div class="group-label">最近翻开</div>
    <div class="poem-list" id="recentList">
      ${recent.map((p, i) => rowHtml(p, i)).join("") || `<div class="empty">还没有阅读记录</div>`}
    </div>
  `
  bindRows(favs, "favList")
  bindRows(recent, "recentList")
}

function rowHtml(p, i) {
  return `
    <div class="poem-row" data-i="${i}">
      <div>
        <strong>${escapeHtml(p.title)}</strong>
        <div class="sub">${escapeHtml([p.author, p.shelf].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="preview">${escapeHtml((p.lines && p.lines[0] || "").slice(0, 18))}</div>
    </div>
  `
}

function bindRows(list, id) {
  const box = $(id)
  if (!box) return
  box.querySelectorAll(".poem-row").forEach((el) => {
    el.onclick = () => {
      state.current = list[Number(el.dataset.i)]
      location.hash = "#/read"
    }
  })
}

window.addEventListener("hashchange", () => {
  tts.stop()
  route()
})
window.addEventListener("DOMContentLoaded", () => {
  if (tts.supported()) {
    // 预热语音列表（Chrome 需触发一次）
    window.speechSynthesis.getVoices()
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
  }
  if (!location.hash) location.hash = "#/"
  else route()
})
window.addEventListener("beforeunload", () => tts.stop())
