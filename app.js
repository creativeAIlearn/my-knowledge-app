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
let token = localStorage.getItem('github_token') || '';
let allNotes = [];
let filteredNotes = [];
let activeCategory = 'all';
let searchQuery = '';
let searchDebounce = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  buildCategoryFilters();
  buildCategorySelect();

  if (token) {
    showScreen('main-screen');
    loadAllNotes();
  } else {
    showScreen('setup-screen');
  }
});

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ===== GITHUB API =====
async function ghFetch(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      ...(options.headers || {})
    }
  });
  return res;
}

// ===== AUTH =====
async function connectVault() {
  const input = document.getElementById('setup-token-input');
  const val = input.value.trim();
  hideSetupError();

  if (!val) { showSetupError('Please enter your GitHub token.'); return; }

  try {
    const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`, {
      headers: { Authorization: `token ${val}` }
    });

    if (res.status === 401) { showSetupError('Invalid token. Please check and try again.'); return; }
    if (res.status === 404) { showSetupError('Repository not found. Make sure the token has repo access.'); return; }
    if (!res.ok) { showSetupError('Connection failed. Please try again.'); return; }

    token = val;
    localStorage.setItem('github_token', token);
    showScreen('main-screen');
    loadAllNotes();
  } catch {
    showSetupError('Network error. Check your internet connection.');
  }
}

function showSetupError(msg) {
  const err = document.getElementById('setup-error');
  err.textContent = msg;
  err.classList.remove('hidden');
}

function hideSetupError() {
  document.getElementById('setup-error').classList.add('hidden');
}

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
  token = '';
  localStorage.removeItem('github_token');
  allNotes = [];
  closeModal('settings-modal');
  showScreen('setup-screen');
  document.getElementById('setup-token-input').value = '';
  hideSetupError();
}

// ===== LOAD NOTES =====
async function loadAllNotes(showRefreshToast = false) {
  showLoadingState();
  allNotes = [];

  try {
    const results = await Promise.allSettled(
      CONFIG.categories.map(cat => fetchCategoryFiles(cat))
    );

    results.forEach(result => {
      if (result.status === 'fulfilled') allNotes.push(...result.value);
    });

    // Sort newest first
    allNotes.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.name.localeCompare(a.name);
    });

    applyFilters();
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
    id: file.sha,
    name: file.name,
    path: file.path,
    sha: file.sha,
    category: cat,
    title: extractTitle(raw, file.name),
    date: extractDate(raw, file.name),
    preview: extractPreview(raw),
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
  const inContent = raw.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  if (inContent) return inContent[1];
  const inFile = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (inFile) return inFile[1];
  return '';
}

function extractPreview(raw) {
  return raw
    .replace(/^#.*$/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s/gm, '')
    .replace(/^\d+\.\s/gm, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^>\s/gm, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 200);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  } catch { return dateStr; }
}

// ===== FILTERS & SEARCH =====
function filterCategory(catId, btn) {
  activeCategory = catId;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
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

  if (activeCategory !== 'all') {
    notes = notes.filter(n => n.category.id === activeCategory);
  }

  if (searchQuery) {
    notes = notes.filter(n =>
      n.title.toLowerCase().includes(searchQuery) ||
      n.preview.toLowerCase().includes(searchQuery) ||
      n.raw.toLowerCase().includes(searchQuery) ||
      n.category.name.toLowerCase().includes(searchQuery)
    );
  }

  filteredNotes = notes;
  renderNotes();
}

// ===== RENDER =====
function renderNotes() {
  const grid = document.getElementById('notes-grid');
  const empty = document.getElementById('empty-state');
  const stats = document.getElementById('stats-bar');

  if (filteredNotes.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    stats.textContent = '';
    return;
  }

  empty.classList.add('hidden');
  const total = allNotes.length;
  const showing = filteredNotes.length;
  stats.textContent = (searchQuery || activeCategory !== 'all')
    ? `Showing ${showing} of ${total} notes`
    : `${total} note${total !== 1 ? 's' : ''} in your vault`;

  grid.innerHTML = filteredNotes.map(note => noteCardHTML(note)).join('');
}

function noteCardHTML(note) {
  const title = highlight(escapeHtml(note.title), searchQuery);
  const preview = highlight(escapeHtml(note.preview), searchQuery);
  const date = formatDate(note.date);
  return `
    <div class="note-card" onclick="viewNote('${escapeHtml(note.id)}')">
      <div class="card-top">
        <span class="cat-badge">${note.category.emoji} ${escapeHtml(note.category.name)}</span>
        ${date ? `<span class="card-date">${date}</span>` : ''}
      </div>
      <div class="card-title">${title}</div>
      ${preview ? `<div class="card-preview">${preview}</div>` : ''}
      <div class="card-footer"><span class="read-more">Read more →</span></div>
    </div>`;
}

function showLoadingState() {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('stats-bar').textContent = '';
  document.getElementById('notes-grid').innerHTML = `
    <div class="loading-state" style="grid-column:1/-1">
      <div class="spinner"></div>
      <span>Loading your vault...</span>
    </div>`;
}

// ===== VIEW NOTE =====
function viewNote(id) {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;

  document.getElementById('view-badge').innerHTML =
    `${note.category.emoji} ${escapeHtml(note.category.name)}`;
  document.getElementById('view-date').textContent = formatDate(note.date);
  document.getElementById('view-content').innerHTML = marked.parse(note.raw);

  openModal('view-modal');
}

// ===== SAVE NOTE =====
async function saveNote(e) {
  e.preventDefault();
  const title = document.getElementById('note-title').value.trim();
  const catId = document.getElementById('note-category').value;
  const content = document.getElementById('note-content').value.trim();

  if (!title) { showToast('Please enter a title', 'error'); return; }

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const date = new Date().toISOString().split('T')[0];
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60);

    const path = `${catId}/${date}-${slug}.md`;
    const markdown = `# ${title}\n\n**Date:** ${date}\n\n${content}`.trim();
    const encoded = btoa(unescape(encodeURIComponent(markdown)));

    const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Add: ${title}`, content: encoded })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Save failed');
    }

    closeModal('add-modal');
    document.getElementById('add-form').reset();
    showToast('Saved to vault! ✓', 'success');
    await loadAllNotes();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save to Vault';
  }
}

// ===== BUILD UI =====
function buildCategoryFilters() {
  const container = document.getElementById('category-filters');
  container.innerHTML =
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
  if (id === 'settings-modal') {
    document.getElementById('settings-token').value = token;
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

function modalBackdropClick(e, id) {
  if (e.target === e.currentTarget) closeModal(id);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['add-modal', 'view-modal', 'settings-modal'].forEach(closeModal);
  }
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
