// ===== CONFIG =====
const CONFIG = {
  owner: 'creativeAIlearn',
  repo: 'my-ideas-vault',
  categories: [
    { id: 'business-ideas',         name: 'Business Ideas',       emoji: '💡' },
    { id: 'quotes-and-inspiration', name: 'Quotes & Inspiration', emoji: '✨' },
    { id: 'books',                  name: 'Books',                emoji: '📚' },
    { id: 'articles',               name: 'Articles',             emoji: '📄' },
    { id: 'podcasts-and-youtube',   name: 'Podcasts & YouTube',   emoji: '🎙️' },
    { id: 'ott-and-movies',         name: 'OTT & Movies',         emoji: '🎬' },
    { id: 'stocks-and-investments', name: 'Stocks & Investments', emoji: '📈' },
    { id: 'gyaan',                  name: 'Gyaan',                emoji: '🧠' },
    { id: 'ai-learnings',           name: 'AI Learnings',         emoji: '🤖' },
  ]
};

// ===== STATE =====
let token        = localStorage.getItem('github_token') || '';
let allNotes     = [];
let filteredNotes = [];
let activeCategory = 'all';
let activeTag      = '';
let searchQuery    = '';
let searchDebounce = null;
let currentNoteId  = null;   // SHA of the note open in view modal
let favourites     = new Set(JSON.parse(localStorage.getItem('vault_favourites') || '[]'));

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  buildCategoryFilters();
  buildCategorySelect();
  if (token) { showScreen('main-screen'); loadAllNotes(); }
  else        { showScreen('setup-screen'); }
});

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ===== GITHUB API =====
async function ghFetch(path, options = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      ...(options.headers || {})
    }
  });
}

// ===== AUTH =====
async function connectVault() {
  const val = document.getElementById('setup-token-input').value.trim();
  hideSetupError();
  if (!val) { showSetupError('Please enter your GitHub token.'); return; }
  try {
    const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`, {
      headers: { Authorization: `token ${val}` }
    });
    if (res.status === 401) { showSetupError('Invalid token. Please check and try again.'); return; }
    if (res.status === 404) { showSetupError('Repository not found. Make sure the token has repo access.'); return; }
    if (!res.ok)             { showSetupError('Connection failed. Please try again.'); return; }
    token = val;
    localStorage.setItem('github_token', token);
    showScreen('main-screen');
    loadAllNotes();
  } catch { showSetupError('Network error. Check your internet connection.'); }
}

function showSetupError(msg) {
  const el = document.getElementById('setup-error');
  el.textContent = msg; el.classList.remove('hidden');
}
function hideSetupError() { document.getElementById('setup-error').classList.add('hidden'); }

function updateToken() {
  const val = document.getElementById('settings-token').value.trim();
  if (!val) { showToast('Please enter a token', 'error'); return; }
  token = val;
  localStorage.setItem('github_token', token);
  closeModal('settings-modal');
  showToast('Token saved!', 'success');
  loadAllNotes();
}

function disconnectVault() {
  if (!confirm('Disconnect your vault? You can reconnect anytime with your token.')) return;
  token = ''; allNotes = [];
  localStorage.removeItem('github_token');
  closeModal('settings-modal');
  showScreen('setup-screen');
  document.getElementById('setup-token-input').value = '';
  hideSetupError();
}

// ===== LOAD NOTES =====
async function loadAllNotes(showRefreshToast = false) {
  showLoadingState(); allNotes = [];
  try {
    const results = await Promise.allSettled(CONFIG.categories.map(cat => fetchCategoryFiles(cat)));
    results.forEach(r => { if (r.status === 'fulfilled') allNotes.push(...r.value); });
    allNotes.sort((a, b) => b.date !== a.date ? b.date.localeCompare(a.date) : b.name.localeCompare(a.name));
    applyFilters();
    buildTagFilters();
    if (showRefreshToast) showToast('Vault refreshed!', 'success');
  } catch {
    showToast('Failed to load vault. Check your token.', 'error');
    document.getElementById('notes-grid').innerHTML = '';
    document.getElementById('empty-state').classList.remove('hidden');
  }
}

async function fetchCategoryFiles(cat) {
  const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${cat.id}`);
  if (!res.ok) return [];
  const files = await res.json();
  if (!Array.isArray(files)) return [];
  const mdFiles = files.filter(f => f.name.endsWith('.md') && f.name !== '.gitkeep');
  const notes = await Promise.allSettled(mdFiles.map(f => fetchFileContent(f, cat)));
  return notes.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
}

async function fetchFileContent(file, cat) {
  const res = await fetch(file.download_url);
  if (!res.ok) return null;
  const raw = await res.text();
  return {
    id:       file.sha,
    sha:      file.sha,
    name:     file.name,
    path:     file.path,
    category: cat,
    title:    extractTitle(raw, file.name),
    date:     extractDate(raw, file.name),
    preview:  extractPreview(raw),
    tags:     extractTags(raw),
    actions:  extractActions(raw),
    raw
  };
}

// ===== PARSERS =====
function extractTitle(raw, filename) {
  const h1 = raw.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  const name = filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-?/, '');
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function extractDate(raw, filename) {
  const m = raw.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const f = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (f) return f[1];
  return '';
}

function extractPreview(raw) {
  return raw
    .replace(/^---[\s\S]*?^---\n?/m, '')          // strip frontmatter
    .replace(/^## ✅ Follow-up Actions[\s\S]*/m, '') // strip actions section
    .replace(/^#.*$/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s/gm, '').replace(/^\d+\.\s/gm, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '').replace(/^>\s/gm, '')
    .replace(/#{1,6}\s/g, '').replace(/\n{2,}/g, '\n')
    .trim().slice(0, 200);
}

function extractTags(raw) {
  const m = raw.match(/^\*\*Tags:\*\*\s*(.+)$/m);
  if (!m) return [];
  return (m[1].match(/#[\w-]+/g) || []).map(t => t.toLowerCase());
}

function extractActions(raw) {
  const section = raw.match(/^## ✅ Follow-up Actions\n([\s\S]*?)(?=\n##\s|\n#\s|$)/m);
  if (!section) return [];
  return section[1].trim().split('\n')
    .filter(l => l.match(/^- \[[ x]\]/))
    .map(line => {
      const done = line.startsWith('- [x]');
      const body = line.replace(/^- \[[ x]\]\s*/, '');
      const dueM = body.match(/\(due:\s*(\d{4}-\d{2}-\d{2})\)/);
      return { text: body.replace(/\s*\(due:\s*\d{4}-\d{2}-\d{2}\)/, '').trim(), due: dueM ? dueM[1] : '', done };
    });
}

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

// ===== MARKDOWN UPDATERS =====
function updateTagsInRaw(raw, tags) {
  const tagStr = tags.map(t => t.startsWith('#') ? t : '#' + t).join(' ');
  if (raw.match(/^\*\*Tags:\*\*.*$/m)) {
    return raw.replace(/^\*\*Tags:\*\*.*$/m, `**Tags:** ${tagStr}`);
  }
  // Insert after **Date:** line
  return raw.replace(/(\*\*Date:\*\*.*\n)/, `$1**Tags:** ${tagStr}\n`);
}

function updateActionsInRaw(raw, actions) {
  const lines = actions.map(a => {
    const check = a.done ? '[x]' : '[ ]';
    const due   = a.due ? ` (due: ${a.due})` : '';
    return `- ${check} ${a.text}${due}`;
  });
  const section = `\n\n## ✅ Follow-up Actions\n${lines.join('\n')}`;
  if (raw.match(/^## ✅ Follow-up Actions/m)) {
    return raw.replace(/\n## ✅ Follow-up Actions[\s\S]*$/, section);
  }
  return raw.trimEnd() + section;
}

// ===== CORE NOTE UPDATE =====
async function updateNoteRaw(note, newRaw, message) {
  const encoded = btoa(unescape(encodeURIComponent(newRaw)));
  const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${note.path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: encoded, sha: note.sha })
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Save failed'); }

  const result = await res.json();
  const newSha  = result.content.sha;

  // Update note in memory
  const updated = {
    ...note,
    id:      newSha,
    sha:     newSha,
    raw:     newRaw,
    title:   extractTitle(newRaw, note.name),
    preview: extractPreview(newRaw),
    tags:    extractTags(newRaw),
    actions: extractActions(newRaw),
  };
  const idx = allNotes.findIndex(n => n.id === note.id);
  if (idx !== -1) allNotes[idx] = updated;

  // If this note is open in view modal, refresh it
  if (currentNoteId === note.id) {
    currentNoteId = newSha;
    refreshViewModal(updated);
  }
  applyFilters();
  buildTagFilters();
  return updated;
}

// ===== FAVOURITES =====
function isFavourite(path) { return favourites.has(path); }

function toggleFavourite(path) {
  if (favourites.has(path)) favourites.delete(path);
  else                       favourites.add(path);
  localStorage.setItem('vault_favourites', JSON.stringify([...favourites]));
}

function toggleFavouriteFromModal() {
  const note = getNoteById(currentNoteId);
  if (!note) return;
  toggleFavourite(note.path);
  updateFavBtnState(note.path);
  applyFilters(); // re-sort so favourites float to top
}

function updateFavBtnState(path) {
  const btn = document.getElementById('fav-btn');
  if (!btn) return;
  const fav = isFavourite(path);
  btn.textContent = fav ? '★' : '☆';
  btn.classList.toggle('starred', fav);
  btn.title = fav ? 'Remove from favourites' : 'Add to favourites';
}

// ===== EDIT =====
function startEdit() {
  const note = getNoteById(currentNoteId);
  if (!note) return;
  document.getElementById('edit-textarea').value = note.raw;
  document.getElementById('view-mode').classList.add('hidden');
  document.getElementById('edit-mode').classList.remove('hidden');
  document.getElementById('edit-btn').style.display = 'none';
}

function cancelEdit() {
  document.getElementById('edit-mode').classList.add('hidden');
  document.getElementById('view-mode').classList.remove('hidden');
  document.getElementById('edit-btn').style.display = '';
}

async function saveEdit() {
  const note = getNoteById(currentNoteId);
  if (!note) return;
  const newRaw = document.getElementById('edit-textarea').value;
  const btn = document.getElementById('edit-save-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await updateNoteRaw(note, newRaw, `Update: ${note.title}`);
    cancelEdit();
    showToast('Note updated!', 'success');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

// ===== DELETE =====
async function deleteCurrentNote() {
  const note = getNoteById(currentNoteId);
  if (!note) return;
  if (!confirm(`Delete "${note.title}"?\n\nThis cannot be undone.`)) return;

  try {
    const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${note.path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: `Delete: ${note.title}`, sha: note.sha })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Delete failed'); }

    allNotes = allNotes.filter(n => n.id !== currentNoteId);
    favourites.delete(note.path);
    localStorage.setItem('vault_favourites', JSON.stringify([...favourites]));
    closeModal('view-modal');
    applyFilters();
    buildTagFilters();
    showToast('Note deleted', 'success');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

// ===== TAGS =====
async function addTagToNote() {
  const input = document.getElementById('tag-input');
  let tag = input.value.trim().toLowerCase();
  if (!tag) return;
  tag = tag.startsWith('#') ? tag : '#' + tag;
  tag = '#' + tag.slice(1).replace(/[^a-z0-9_-]/g, '');
  if (!tag || tag === '#') return;

  const note = getNoteById(currentNoteId);
  if (!note) return;
  if (note.tags.includes(tag)) { showToast('Tag already added', ''); input.value = ''; return; }

  const newTags = [...note.tags, tag];
  input.value = '';
  try {
    await updateNoteRaw(note, updateTagsInRaw(note.raw, newTags), `Update tags: ${note.title}`);
    showToast(`${tag} added`, 'success');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

async function removeTagFromNote(tag) {
  const note = getNoteById(currentNoteId);
  if (!note) return;
  const newTags = note.tags.filter(t => t !== tag);
  try {
    await updateNoteRaw(note, updateTagsInRaw(note.raw, newTags), `Update tags: ${note.title}`);
    showToast(`${tag} removed`, '');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

// ===== ACTIONS =====
async function addActionToNote() {
  const textInput = document.getElementById('action-input');
  const dueInput  = document.getElementById('action-due');
  const text = textInput.value.trim();
  if (!text) return;

  const note = getNoteById(currentNoteId);
  if (!note) return;

  const newActions = [...note.actions, { text, due: dueInput.value, done: false }];
  textInput.value = ''; dueInput.value = '';
  try {
    await updateNoteRaw(note, updateActionsInRaw(note.raw, newActions), `Add action: ${note.title}`);
    showToast('Action added', 'success');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

async function toggleAction(index) {
  const note = getNoteById(currentNoteId);
  if (!note) return;
  const newActions = note.actions.map((a, i) => i === index ? { ...a, done: !a.done } : a);
  try {
    await updateNoteRaw(note, updateActionsInRaw(note.raw, newActions), `Update action: ${note.title}`);
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

async function removeAction(index) {
  const note = getNoteById(currentNoteId);
  if (!note) return;
  const newActions = note.actions.filter((_, i) => i !== index);
  try {
    await updateNoteRaw(note, updateActionsInRaw(note.raw, newActions), `Update action: ${note.title}`);
    showToast('Action removed', '');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

// ===== FILTERS & SEARCH =====
function filterCategory(catId, btn) {
  activeCategory = catId;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

function filterTag(tag, btn) {
  activeTag = activeTag === tag ? '' : tag;
  document.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.remove('active'));
  if (activeTag) btn.classList.add('active');
  applyFilters();
}

function handleSearch(val) {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = val.trim().toLowerCase();
    document.getElementById('clear-search').classList.toggle('hidden', !searchQuery);
    applyFilters();
  }, 200);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('clear-search').classList.add('hidden');
  searchQuery = '';
  applyFilters();
}

function applyFilters() {
  let notes = allNotes;

  if (activeCategory !== 'all')
    notes = notes.filter(n => n.category.id === activeCategory);

  if (activeTag)
    notes = notes.filter(n => n.tags.includes(activeTag));

  if (searchQuery)
    notes = notes.filter(n =>
      n.title.toLowerCase().includes(searchQuery) ||
      n.raw.toLowerCase().includes(searchQuery) ||
      n.tags.some(t => t.includes(searchQuery)) ||
      n.category.name.toLowerCase().includes(searchQuery)
    );

  // Favourites float to top, then sort by date
  notes = [
    ...notes.filter(n => isFavourite(n.path)),
    ...notes.filter(n => !isFavourite(n.path))
  ];

  filteredNotes = notes;
  renderNotes();
}

// ===== RENDER =====
function renderNotes() {
  const grid  = document.getElementById('notes-grid');
  const empty = document.getElementById('empty-state');
  const stats = document.getElementById('stats-bar');

  if (filteredNotes.length === 0) {
    grid.innerHTML = ''; empty.classList.remove('hidden'); stats.textContent = '';
    return;
  }
  empty.classList.add('hidden');
  const total = allNotes.length, showing = filteredNotes.length;
  const hasFilter = searchQuery || activeCategory !== 'all' || activeTag;
  stats.textContent = hasFilter
    ? `Showing ${showing} of ${total} notes`
    : `${total} note${total !== 1 ? 's' : ''} in your vault`;

  grid.innerHTML = filteredNotes.map(note => noteCardHTML(note)).join('');
}

function noteCardHTML(note) {
  const title   = highlight(escapeHtml(note.title), searchQuery);
  const preview = highlight(escapeHtml(note.preview), searchQuery);
  const date    = formatDate(note.date);
  const fav     = isFavourite(note.path);
  const pendingActions = note.actions.filter(a => !a.done).length;

  const tagsHtml = note.tags.length
    ? `<div class="card-tags">${note.tags.map(t => `<span class="card-tag-chip">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const actionsHint = pendingActions > 0
    ? `<span class="card-actions-badge">☐ ${pendingActions} action${pendingActions > 1 ? 's' : ''}</span>`
    : '';

  return `
    <div class="note-card${fav ? ' is-favourite' : ''}" onclick="viewNote('${escapeHtml(note.id)}')">
      <div class="card-top">
        <div class="card-top-left">
          <span class="cat-badge">${note.category.emoji} ${escapeHtml(note.category.name)}</span>
          ${date ? `<span class="card-date">${date}</span>` : ''}
        </div>
        <button class="card-star-btn${fav ? ' starred' : ''}"
          onclick="event.stopPropagation(); cardToggleFav('${escapeHtml(note.id)}')"
          title="${fav ? 'Remove from favourites' : 'Add to favourites'}">
          ${fav ? '★' : '☆'}
        </button>
      </div>
      <div class="card-title">${title}</div>
      ${preview ? `<div class="card-preview">${preview}</div>` : ''}
      ${tagsHtml}
      <div class="card-footer">
        ${actionsHint}
        <span class="read-more">Read more →</span>
      </div>
    </div>`;
}

function cardToggleFav(id) {
  const note = getNoteById(id);
  if (!note) return;
  toggleFavourite(note.path);
  applyFilters(); // re-renders cards with updated star state
}

function showLoadingState() {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('stats-bar').textContent = '';
  document.getElementById('notes-grid').innerHTML = `
    <div class="loading-state" style="grid-column:1/-1">
      <div class="spinner"></div><span>Loading your vault...</span>
    </div>`;
}

// ===== BUILD TAG FILTERS =====
function buildTagFilters() {
  const allTags = [...new Set(allNotes.flatMap(n => n.tags))].sort();
  const wrap    = document.getElementById('tag-filters-wrap');
  const cont    = document.getElementById('tag-filters');

  if (allTags.length === 0) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  cont.innerHTML =
    `<span class="tag-filter-label">Tags:</span>` +
    allTags.map(tag => {
      const active = tag === activeTag ? ' active' : '';
      return `<button class="tag-filter-btn${active}" onclick="filterTag('${escapeHtml(tag)}', this)">${escapeHtml(tag)}</button>`;
    }).join('');
}

// ===== VIEW NOTE =====
function viewNote(id) {
  const note = getNoteById(id);
  if (!note) return;
  currentNoteId = id;

  // Ensure edit mode is hidden
  document.getElementById('edit-mode').classList.add('hidden');
  document.getElementById('view-mode').classList.remove('hidden');
  document.getElementById('edit-btn').style.display = '';

  refreshViewModal(note);
  openModal('view-modal');
}

function refreshViewModal(note) {
  document.getElementById('view-badge').innerHTML =
    `${note.category.emoji} ${escapeHtml(note.category.name)}`;
  document.getElementById('view-date').textContent = formatDate(note.date);
  document.getElementById('view-content').innerHTML = marked.parse(note.raw
    .replace(/^\*\*Tags:\*\*.*$/m, '')
    .replace(/^## ✅ Follow-up Actions[\s\S]*/m, '')
  );

  updateFavBtnState(note.path);
  renderViewTags(note.tags);
  renderViewActions(note.actions);
}

function renderViewTags(tags) {
  const container = document.getElementById('view-tags');
  if (tags.length === 0) {
    container.innerHTML = `<span class="no-items-hint">No tags yet — add one below</span>`;
    return;
  }
  container.innerHTML = tags.map(tag => `
    <span class="tag-chip">
      ${escapeHtml(tag)}
      <button class="tag-chip-remove" onclick="removeTagFromNote('${escapeHtml(tag)}')" title="Remove tag">×</button>
    </span>`).join('');
}

function renderViewActions(actions) {
  const list = document.getElementById('view-actions');
  if (actions.length === 0) {
    list.innerHTML = `<li><span class="no-items-hint">No actions yet — add one below</span></li>`;
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  list.innerHTML = actions.map((a, i) => {
    const isOverdue = a.due && a.due < today && !a.done;
    return `
      <li class="action-item${a.done ? ' done' : ''}">
        <div class="action-checkbox${a.done ? ' checked' : ''}" onclick="toggleAction(${i})" title="${a.done ? 'Mark incomplete' : 'Mark complete'}">
          ${a.done ? '✓' : ''}
        </div>
        <div class="action-body">
          <div class="action-text">${escapeHtml(a.text)}</div>
          ${a.due ? `<div class="action-due${isOverdue ? ' overdue' : ''}">📅 ${formatDate(a.due)}${isOverdue ? ' · Overdue' : ''}</div>` : ''}
        </div>
        <button class="action-delete-btn" onclick="removeAction(${i})" title="Delete action">×</button>
      </li>`;
  }).join('');
}

// ===== SAVE NEW NOTE =====
async function saveNote(e) {
  e.preventDefault();
  const title   = document.getElementById('note-title').value.trim();
  const catId   = document.getElementById('note-category').value;
  const content = document.getElementById('note-content').value.trim();
  const rawTags = document.getElementById('note-tags-input').value.trim();

  if (!title) { showToast('Please enter a title', 'error'); return; }

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true; saveBtn.textContent = 'Saving...';

  try {
    const date  = new Date().toISOString().split('T')[0];
    const slug  = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
    const path  = `${catId}/${date}-${slug}.md`;

    // Parse tags from input
    const tagList = rawTags
      ? rawTags.split(/[\s,]+/).filter(Boolean).map(t => {
          t = t.toLowerCase().replace(/[^#a-z0-9_-]/g, '');
          return t.startsWith('#') ? t : '#' + t;
        }).filter(t => t.length > 1)
      : [];

    const tagsLine   = tagList.length ? `\n**Tags:** ${tagList.join(' ')}` : '';
    const markdown   = `# ${title}\n\n**Date:** ${date}${tagsLine}\n\n${content}`.trim();
    const encoded    = btoa(unescape(encodeURIComponent(markdown)));

    const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Add: ${title}`, content: encoded })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Save failed'); }

    closeModal('add-modal');
    document.getElementById('add-form').reset();
    showToast('Saved to vault! ✓', 'success');
    await loadAllNotes();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = 'Save to Vault';
  }
}

// ===== BUILD UI =====
function buildCategoryFilters() {
  document.getElementById('category-filters').innerHTML =
    `<button class="cat-btn active" onclick="filterCategory('all', this)">All</button>` +
    CONFIG.categories.map(cat =>
      `<button class="cat-btn" onclick="filterCategory('${cat.id}', this)">${cat.emoji} ${cat.name}</button>`
    ).join('');
}

function buildCategorySelect() {
  document.getElementById('note-category').innerHTML =
    CONFIG.categories.map(cat =>
      `<option value="${cat.id}">${cat.emoji} ${cat.name}</option>`
    ).join('');
}

// ===== MODALS =====
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (id === 'settings-modal') document.getElementById('settings-token').value = token;
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
  if (id === 'view-modal') currentNoteId = null;
}

function modalBackdropClick(e, id) {
  if (e.target === e.currentTarget) closeModal(id);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') ['add-modal', 'view-modal', 'settings-modal'].forEach(closeModal);
});

// ===== TOAST =====
let toastTimeout;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.className = 'toast hidden'; }, 3000);
}

// ===== HELPERS =====
function getNoteById(id) { return allNotes.find(n => n.id === id) || null; }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlight(text, query) {
  if (!query) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${esc})`, 'gi'), '<mark>$1</mark>');
}
