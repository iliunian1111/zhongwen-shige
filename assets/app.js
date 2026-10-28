const state = {
  catalog: [],
  collection: null,
  files: [],
  currentFile: null,
  poems: [],
  filtered: [],
  page: 1,
  pageSize: 30,
  view: 'home'
}

const $ = (id) => document.getElementById(id)

function show(view) {
  state.view = view
  ;['homeView', 'listView', 'detailView'].forEach((id) => {
    $(id).classList.toggle('hidden', id !== view + 'View' && !(view === 'home' && id === 'homeView') && !(view === 'list' && id === 'listView') && !(view === 'detail' && id === 'detailView'))
  })
  // clearer:
  $('homeView').classList.toggle('hidden', view !== 'home')
  $('listView').classList.toggle('hidden', view !== 'list')
  $('detailView').classList.toggle('hidden', view !== 'detail')
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function loadCatalog() {
  const res = await fetch('./catalog.json')
  state.catalog = await res.json()
  renderCollections()
  // pick a featured poem quickly from 宋词/宋词三百首 if exists, else first tang shard
  await loadFeatured()
}

function renderCollections() {
  const grid = $('collectionGrid')
  grid.innerHTML = state.catalog.map((c) => `
    <div class="card" data-name="${c.name}">
      <h3>${c.name}</h3>
      <p>${c.fileCount} 个数据文件</p>
    </div>
  `).join('')
  grid.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', () => openCollection(el.dataset.name))
  })
}

async function loadFeatured() {
  // Prefer a small famous set for instant hero
  const candidates = [
    'data/宋词/宋词三百首.json',
    'data/全唐诗/poet.tang.0.json',
    'data/诗经/shijing.json'
  ]
  for (const path of candidates) {
    try {
      const res = await fetch('./' + encodePath(path))
      if (!res.ok) continue
      const data = await res.json()
      if (!Array.isArray(data) || !data.length) continue
      const item = data[Math.floor(Math.random() * Math.min(data.length, 50))]
      renderHero(normalize(item))
      return
    } catch (e) {}
  }
  renderHero({
    title: '中文诗歌',
    author: '开源全库',
    lines: ['每天一首，纸墨之间。']
  })
}

function normalize(item) {
  const lines = item.paragraphs || item.content || []
  return {
    title: item.title || item.rhythmic || '无题',
    author: item.author || '佚名',
    lines: Array.isArray(lines) ? lines : [String(lines)],
    rhythmic: item.rhythmic || ''
  }
}

function renderHero(poem) {
  $('heroTitle').textContent = poem.title
  $('heroAuthor').textContent = poem.author + (poem.rhythmic ? ` · ${poem.rhythmic}` : '')
  $('heroLines').innerHTML = poem.lines.map((l) => `<p>${l}</p>`).join('')
}

function openCollection(name) {
  const c = state.catalog.find((x) => x.name === name)
  if (!c) return
  state.collection = c
  state.files = c.files || []
  $('listTitle').textContent = c.name
  $('fileSelect').innerHTML = state.files.map((f) => `<option value="${f}">${f}</option>`).join('')
  show('list')
  if (state.files.length) loadFile(state.files[0])
}

async function loadFile(file) {
  state.currentFile = file
  state.page = 1
  $('status').textContent = `正在加载 ${file} …`
  try {
    const path = `data/${state.collection.name}/${file}`
    const res = await fetch('./' + encodePath(path))
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    const arr = Array.isArray(data) ? data : []
    state.poems = arr.map(normalize)
    state.filtered = state.poems
    $('status').textContent = `${file} · 共 ${state.poems.length} 首`
    $('searchInput').value = ''
    renderList()
  } catch (e) {
    $('status').textContent = '加载失败：' + (e.message || e)
    state.poems = []
    state.filtered = []
    renderList()
  }
}

function renderList() {
  const start = (state.page - 1) * state.pageSize
  const pageItems = state.filtered.slice(start, start + state.pageSize)
  $('poemList').innerHTML = pageItems.map((p, i) => `
    <div class="row" data-idx="${start + i}">
      <div>
        <strong>${p.title}</strong>
        <div class="meta">${p.author}</div>
      </div>
      <div class="meta">${p.lines.length} 句</div>
    </div>
  `).join('') || '<div class="row"><div class="muted">没有结果</div></div>'

  $('poemList').querySelectorAll('.row[data-idx]').forEach((el) => {
    el.addEventListener('click', () => openDetail(Number(el.dataset.idx)))
  })

  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize))
  $('pageInfo').textContent = `${state.page} / ${totalPages}`
  $('prevBtn').disabled = state.page <= 1
  $('nextBtn').disabled = state.page >= totalPages
}

function openDetail(idx) {
  const poem = state.filtered[idx]
  if (!poem) return
  $('detailTitle').textContent = poem.title
  $('detailAuthor').textContent = poem.author + (poem.rhythmic ? ` · ${poem.rhythmic}` : '')
  $('detailBody').innerHTML = poem.lines.map((l) => `<p>${l}</p>`).join('')
  show('detail')
}

function onSearch() {
  const q = $('searchInput').value.trim()
  state.page = 1
  if (!q) state.filtered = state.poems
  else {
    state.filtered = state.poems.filter((p) =>
      p.title.includes(q) ||
      p.author.includes(q) ||
      p.lines.some((l) => l.includes(q))
    )
  }
  renderList()
}

window.addEventListener('DOMContentLoaded', () => {
  $('backHome').addEventListener('click', () => show('home'))
  $('backList').addEventListener('click', () => show('list'))
  $('fileSelect').addEventListener('change', (e) => loadFile(e.target.value))
  $('searchInput').addEventListener('input', onSearch)
  $('prevBtn').addEventListener('click', () => {
    if (state.page > 1) { state.page -= 1; renderList() }
  })
  $('nextBtn').addEventListener('click', () => {
    const totalPages = Math.ceil(state.filtered.length / state.pageSize)
    if (state.page < totalPages) { state.page += 1; renderList() }
  })
  loadCatalog().catch((e) => {
    $('statusHome').textContent = '目录加载失败：' + e.message
  })
})
