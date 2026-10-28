/* 中文诗歌 · 阅读站 */
const STORAGE_FAVS = "zhongwen-shige-favs-v1"
const STORAGE_RECENT = "zhongwen-shige-recent-v1"

const state = {
  library: null,
  dailyPool: null,
  view: "today",
  shelf: null,
  poems: [],
  filtered: [],
  volume: 0,
  page: 1,
  pageSize: 24,
  query: "",
  current: null,
  authorIndex: null,
  status: ""
}

const app = () => document.getElementById("app")

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/")
}

async function fetchJson(path) {
  const res = await fetch("./" + encodePath(path))
  if (!res.ok) throw new Error("加载失败 " + res.status)
  return res.json()
}

function normalize(item, shelfName, source) {
  const linesRaw = item.paragraphs || item.content || []
  const lines = Array.isArray(linesRaw) ? linesRaw.filter(Boolean) : [String(linesRaw)]
  const title = item.title || item.rhythmic || item.chapter || "无题"
  const author = item.author || "佚名"
  const rhythmic = item.rhythmic || ""
  const id = item.id || [shelfName, source, title, author, lines[0] || ""].join("|")
  return {
    id,
    title,
    author,
    rhythmic,
    lines,
    shelf: shelfName || "",
    source: source || "",
    tags: item.tags || [],
    chapter: item.chapter || "",
    section: item.section || ""
  }
}

function isReadablePoem(p) {
  return p && Array.isArray(p.lines) && p.lines.length > 0 && p.lines.some((l) => String(l).trim())
}

function loadStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]")
  } catch {
    return []
  }
}

function saveStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function isFav(id) {
  return loadStore(STORAGE_FAVS).some((x) => x.id === id)
}

function toggleFav(poem) {
  const list = loadStore(STORAGE_FAVS)
  const i = list.findIndex((x) => x.id === poem.id)
  if (i >= 0) list.splice(i, 1)
  else list.unshift({
    id: poem.id,
    title: poem.title,
    author: poem.author,
    rhythmic: poem.rhythmic,
    lines: poem.lines,
    shelf: poem.shelf
  })
  saveStore(STORAGE_FAVS, list.slice(0, 500))
}

function pushRecent(poem) {
  const list = loadStore(STORAGE_RECENT).filter((x) => x.id !== poem.id)
  list.unshift({
    id: poem.id,
    title: poem.title,
    author: poem.author,
    rhythmic: poem.rhythmic,
    lines: poem.lines,
    shelf: poem.shelf
  })
  saveStore(STORAGE_RECENT, list.slice(0, 30))
}

function dayIndex(len) {
  const d = new Date()
  const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  return key % Math.max(len, 1)
}

function setNav(active) {
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === active)
  })
}

function route() {
  const hash = location.hash.replace(/^#\/?/, "")
  const [name, a, b] = hash.split("/")
  if (!name || name === "today") return renderToday()
  if (name === "library") return renderLibrary()
  if (name === "shelf" && a) return openShelf(a, b ? Number(b) : 0)
  if (name === "read") return renderReader()
  if (name === "search") return renderSearch()
  if (name === "favs") return renderFavs()
  return renderToday()
}

function readingBlock(poem, opts = {}) {
  const meta = [poem.author, poem.rhythmic, poem.shelf].filter(Boolean).join(" · ")
  return `
    <article class="reading">
      <h1 class="title">${escapeHtml(poem.title)}</h1>
      <div class="meta">${escapeHtml(meta)}</div>
      <div class="verse">${poem.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</div>
      ${opts.actions || ""}
    </article>
  `
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function ensureLibrary() {
  if (!state.library) state.library = await fetchJson("library.json")
  return state.library
}

async function ensureDaily() {
  if (!state.dailyPool) state.dailyPool = await fetchJson("daily-pool.json")
  return state.dailyPool
}

async function renderToday() {
  setNav("today")
  state.view = "today"
  app().innerHTML = `<p class="status-line">正在准备今日一诗…</p>`
  try {
    const pool = await ensureDaily()
    const poem = pool[dayIndex(pool.length)]
    if (!poem.id) poem.id = ["daily", poem.title, poem.author, poem.lines[0]].join("|")
    state.current = poem
    const fav = isFav(poem.id)
    app().innerHTML = `
      <section class="today">
        <p class="today-kicker">今日一诗</p>
        ${readingBlock(poem, {
          actions: `
            <div class="actions">
              <button class="btn soft" type="button" id="btnAnother">换一首</button>
              <button class="btn ghost ${fav ? "fav-on" : ""}" type="button" id="btnFav">${fav ? "已收藏" : "收藏"}</button>
              <a class="btn" href="#/library">进入书库</a>
            </div>
          `
        })}
        <p class="hint">选自精选读本 · 可收藏，明日另开一卷</p>
      </section>
    `
    $("btnAnother").onclick = () => {
      const next = pool[Math.floor(Math.random() * pool.length)]
      if (!next.id) next.id = ["daily", next.title, next.author, next.lines[0]].join("|")
      state.current = next
      location.hash = "#/read"
      renderReader()
    }
    $("btnFav").onclick = () => {
      toggleFav(poem)
      renderToday()
    }
  } catch (e) {
    app().innerHTML = `<p class="empty">今日一诗加载失败：${escapeHtml(e.message)}</p>`
  }
}

async function renderLibrary() {
  setNav("library")
  const lib = await ensureLibrary()
  const groups = ["精选", "全库"]
  app().innerHTML = `
    <div class="section-head">
      <h2>书库</h2>
      <p>共 ${lib.totalPoems.toLocaleString("zh-CN")} 首可读篇目</p>
    </div>
    ${groups.map((g) => {
      const shelves = lib.shelves.filter((s) => s.group === g)
      return `
        <div class="group-label">${g}</div>
        <div class="shelf-grid">
          ${shelves.map((s, i) => `
            <div class="shelf" data-id="${s.id}" style="animation-delay:${i * 40}ms">
              <div class="era">${escapeHtml(s.era || "")}</div>
              <h3>${escapeHtml(s.name)}</h3>
              <p>${escapeHtml(s.blurb || "")}</p>
              <div class="count">${s.count.toLocaleString("zh-CN")} 首</div>
            </div>
          `).join("")}
        </div>
      `
    }).join("")}
  `
  app().querySelectorAll(".shelf").forEach((el) => {
    el.onclick = () => { location.hash = `#/shelf/${el.dataset.id}` }
  })
}

async function openShelf(id, volume = 0) {
  setNav("library")
  const lib = await ensureLibrary()
  const shelf = lib.shelves.find((s) => s.id === id)
  if (!shelf) {
    app().innerHTML = `<p class="empty">未找到该书</p>`
    return
  }
  state.shelf = shelf
  state.volume = Number.isFinite(volume) ? volume : 0
  state.page = 1
  state.query = ""
  state.authorIndex = null
  app().innerHTML = `<p class="status-line">正在打开《${escapeHtml(shelf.name)}》…</p>`
  try {
    await loadShelfPoems(shelf, state.volume)
    renderBrowse()
  } catch (e) {
    app().innerHTML = `<p class="empty">${escapeHtml(e.message)}</p>`
  }
}

async function loadShelfPoems(shelf, volume) {
  let files = shelf.files || []
  if (shelf.mode === "shards") {
    const idx = Math.min(Math.max(volume, 0), files.length - 1)
    state.volume = idx
    files = [files[idx]]
  }
  const poems = []
  for (const file of files) {
    const data = await fetchJson(file)
    const arr = Array.isArray(data) ? data : []
    for (const item of arr) {
      if (!item || typeof item !== "object") continue
      // skip author bios
      if ("desc" in item && "name" in item && !item.paragraphs && !item.content && !item.title) continue
      const p = normalize(item, shelf.name, file)
      if (isReadablePoem(p)) poems.push(p)
    }
  }
  state.poems = poems
  state.filtered = poems
  state.status = shelf.mode === "shards"
    ? `第 ${state.volume + 1} / ${shelf.files.length} ${shelf.volumeLabel || "卷"} · ${poems.length} 首`
    : `共 ${poems.length} 首`
}

function renderBrowse() {
  const shelf = state.shelf
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize))
  if (state.page > totalPages) state.page = totalPages
  const start = (state.page - 1) * state.pageSize
  const pageItems = state.filtered.slice(start, start + state.pageSize)

  const volumeControls = shelf.mode === "shards" ? `
    <div class="chip-row" id="volRow">
      <button class="chip" type="button" data-vol="-1">上一卷</button>
      <span class="status-line" style="margin:0">第 ${state.volume + 1} / ${shelf.files.length} 卷</span>
      <button class="chip" type="button" data-vol="1">下一卷</button>
      ${shelf.authorIndex ? `<button class="chip" type="button" id="btnAuthorFind">按作者找</button>` : ""}
    </div>
  ` : ""

  app().innerHTML = `
    <div class="browse-bar">
      <button class="btn ghost" type="button" id="backLib">书库</button>
      <h1>${escapeHtml(shelf.name)}</h1>
    </div>
    <p class="status-line">${escapeHtml(state.status)}${state.query ? ` · 筛选「${escapeHtml(state.query)}」 ${state.filtered.length} 首` : ""}</p>
    ${volumeControls}
    <div class="browse-bar">
      <input class="field" id="shelfSearch" type="search" placeholder="在本书中搜索标题、作者、诗句" value="${escapeHtml(state.query)}" />
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

  $("backLib").onclick = () => { location.hash = "#/library" }
  $("shelfSearch").oninput = (e) => {
    state.query = e.target.value.trim()
    state.page = 1
    filterShelf()
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

  const volRow = $("volRow")
  if (volRow) {
    volRow.querySelectorAll("[data-vol]").forEach((btn) => {
      btn.onclick = async () => {
        const delta = Number(btn.dataset.vol)
        const next = state.volume + delta
        if (next < 0 || next >= shelf.files.length) return
        location.hash = `#/shelf/${shelf.id}/${next}`
      }
    })
  }
  const authorBtn = $("btnAuthorFind")
  if (authorBtn) {
    authorBtn.onclick = () => promptAuthorFind()
  }
}

function filterShelf() {
  const q = state.query
  if (!q) {
    state.filtered = state.poems
    return
  }
  state.filtered = state.poems.filter((p) =>
    p.title.includes(q) ||
    p.author.includes(q) ||
    (p.rhythmic && p.rhythmic.includes(q)) ||
    p.lines.some((l) => l.includes(q))
  )
}

async function promptAuthorFind() {
  const name = prompt("输入作者名（如：李白）")
  if (!name) return
  const shelf = state.shelf
  app().innerHTML = `<p class="status-line">正在全库查找「${escapeHtml(name)}」…</p>`
  try {
    if (!state.authorIndex) {
      state.authorIndex = await fetchJson(shelf.authorIndex)
    }
    const shards = state.authorIndex[name] || state.authorIndex[name.trim()]
    // fuzzy: includes
    let hitShards = shards
    if (!hitShards) {
      const keys = Object.keys(state.authorIndex).filter((k) => k.includes(name))
      if (!keys.length) {
        app().innerHTML = `<p class="empty">未找到作者「${escapeHtml(name)}」</p><div class="actions"><button class="btn ghost" id="back">返回</button></div>`
        $("back").onclick = () => renderBrowse()
        return
      }
      hitShards = [...new Set(keys.flatMap((k) => state.authorIndex[k]))]
    }
    // map shard number to file
    const files = shelf.files.filter((f) => {
      const m = f.match(/(\d+)\.json$/)
      return m && hitShards.includes(Number(m[1]))
    })
    const poems = []
    for (const file of files.slice(0, 12)) {
      const data = await fetchJson(file)
      for (const item of data) {
        if (item && item.author && item.author.includes(name)) {
          const p = normalize(item, shelf.name, file)
          if (isReadablePoem(p)) poems.push(p)
        }
      }
    }
    state.poems = poems
    state.filtered = poems
    state.query = name
    state.page = 1
    state.status = `作者「${name}」· ${poems.length} 首`
    renderBrowse()
  } catch (e) {
    app().innerHTML = `<p class="empty">${escapeHtml(e.message)}</p>`
  }
}

function renderReader() {
  setNav(state.view === "favs" ? "favs" : state.view === "search" ? "search" : "library")
  const poem = state.current
  if (!poem) {
    app().innerHTML = `<p class="empty">暂无选中篇目</p><div class="actions"><a class="btn" href="#/library">去书库</a></div>`
    return
  }
  pushRecent(poem)
  const fav = isFav(poem.id)
  app().innerHTML = `
    <section class="reader-wrap">
      <div class="reader-tools">
        <button class="btn ghost" type="button" id="backBtn">返回</button>
        <button class="btn ghost ${fav ? "fav-on" : ""}" type="button" id="favBtn">${fav ? "已收藏" : "收藏此篇"}</button>
      </div>
      ${readingBlock(poem)}
    </section>
  `
  $("backBtn").onclick = () => history.back()
  $("favBtn").onclick = () => {
    toggleFav(poem)
    renderReader()
  }
}

async function renderSearch() {
  setNav("search")
  state.view = "search"
  await ensureLibrary()
  app().innerHTML = `
    <div class="section-head">
      <h2>检索</h2>
      <p>先查精选读本，再按作者入全库</p>
    </div>
    <div class="search-box">
      <div class="row">
        <input class="field" id="q" type="search" placeholder="标题、作者、词牌或诗句" />
        <button class="btn" type="button" id="go">检索</button>
      </div>
      <div class="tabs">
        <button class="chip active" type="button" data-scope="featured">精选读本</button>
        <button class="chip" type="button" data-scope="author-tang">全唐诗·作者</button>
        <button class="chip" type="button" data-scope="author-ci">全宋词·作者</button>
      </div>
    </div>
    <div id="results"></div>
  `
  let scope = "featured"
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
    box.innerHTML = `<p class="empty">请输入关键词</p>`
    return
  }
  box.innerHTML = `<p class="status-line">检索中…</p>`
  try {
    if (scope === "featured") {
      const lib = await ensureLibrary()
      const featured = lib.shelves.filter((s) => s.group === "精选")
      const hits = []
      for (const shelf of featured) {
        for (const file of shelf.files) {
          const data = await fetchJson(file)
          const arr = Array.isArray(data) ? data : []
          for (const item of arr) {
            const p = normalize(item, shelf.name, file)
            if (!isReadablePoem(p)) continue
            const blob = [p.title, p.author, p.rhythmic, ...p.lines].join("\n")
            if (blob.includes(q)) hits.push(p)
            if (hits.length >= 80) break
          }
          if (hits.length >= 80) break
        }
        if (hits.length >= 80) break
      }
      renderSearchHits(box, hits, `精选读本中找到 ${hits.length} 首`)
      return
    }

    const lib = await ensureLibrary()
    const shelfId = scope === "author-ci" ? "quan-song-ci" : "quan-tang"
    const shelf = lib.shelves.find((s) => s.id === shelfId)
    const index = await fetchJson(shelf.authorIndex)
    let keys = Object.keys(index).filter((k) => k === q || k.includes(q))
    if (!keys.length) {
      box.innerHTML = `<p class="empty">未找到作者「${escapeHtml(q)}」</p>`
      return
    }
    keys = keys.slice(0, 8)
    const shardNums = [...new Set(keys.flatMap((k) => index[k]))].slice(0, 15)
    const files = shelf.files.filter((f) => {
      const m = f.match(/(\d+)\.json$/)
      return m && shardNums.includes(Number(m[1]))
    })
    const hits = []
    for (const file of files) {
      const data = await fetchJson(file)
      for (const item of data) {
        if (!item || !item.author) continue
        if (!keys.some((k) => item.author === k || item.author.includes(q))) continue
        const p = normalize(item, shelf.name, file)
        if (isReadablePoem(p)) hits.push(p)
        if (hits.length >= 100) break
      }
      if (hits.length >= 100) break
    }
    renderSearchHits(box, hits, `作者相关 ${hits.length} 首`)
  } catch (e) {
    box.innerHTML = `<p class="empty">${escapeHtml(e.message)}</p>`
  }
}

function renderSearchHits(box, hits, label) {
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

function renderFavs() {
  setNav("favs")
  state.view = "favs"
  const favs = loadStore(STORAGE_FAVS)
  const recent = loadStore(STORAGE_RECENT)
  app().innerHTML = `
    <div class="section-head">
      <h2>收藏</h2>
      <p>保存在本机浏览器，换设备不会同步</p>
    </div>
    <div class="group-label">我的收藏 · ${favs.length}</div>
    <div class="poem-list" id="favList">
      ${favs.map((p, i) => rowHtml(p, i, "fav")).join("") || `<div class="empty">尚未收藏。读到喜欢的，点「收藏此篇」。</div>`}
    </div>
    <div class="group-label">最近阅读</div>
    <div class="poem-list" id="recentList">
      ${recent.map((p, i) => rowHtml(p, i, "recent")).join("") || `<div class="empty">还没有阅读记录</div>`}
    </div>
  `
  bindPoemRows(favs, "favList")
  bindPoemRows(recent, "recentList")
}

function rowHtml(p, i, prefix) {
  return `
    <div class="poem-row" data-prefix="${prefix}" data-i="${i}">
      <div>
        <strong>${escapeHtml(p.title)}</strong>
        <div class="sub">${escapeHtml([p.author, p.shelf].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="preview">${escapeHtml((p.lines && p.lines[0] || "").slice(0, 18))}</div>
    </div>
  `
}

function bindPoemRows(list, containerId) {
  const box = $(containerId)
  if (!box) return
  box.querySelectorAll(".poem-row").forEach((el) => {
    el.onclick = () => {
      state.current = list[Number(el.dataset.i)]
      location.hash = "#/read"
    }
  })
}

function $(id) {
  return document.getElementById(id)
}

window.addEventListener("hashchange", route)
window.addEventListener("DOMContentLoaded", () => {
  if (!location.hash) location.hash = "#/"
  else route()
})
