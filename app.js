// ===== FILE TYPE CONFIG =====
const FILE_TYPES = {
  pdf:  { icon: '📕', color: 'pdf',   label: 'PDF',   category: 'doc' },
  docx: { icon: '📄', color: 'docx',  label: 'DOCX',  category: 'doc' },
  txt:  { icon: '📝', color: 'txt',   label: 'TXT',   category: 'text' },
  csv:  { icon: '📊', color: 'csv',   label: 'CSV',   category: 'text' },
  jpg:  { icon: '🖼️', color: 'img',   label: 'JPG',   category: 'image' },
  jpeg: { icon: '🖼️', color: 'img',   label: 'JPEG',  category: 'image' },
  png:  { icon: '🖼️', color: 'img',   label: 'PNG',   category: 'image' },
  gif:  { icon: '🖼️', color: 'img',   label: 'GIF',   category: 'image' },
  webp: { icon: '🖼️', color: 'img',   label: 'WEBP',  category: 'image' },
  mp4:  { icon: '🎬', color: 'video', label: 'MP4',   category: 'video' },
  mpeg: { icon: '🎬', color: 'video', label: 'MPEG',  category: 'video' },
  mov:  { icon: '🎬', color: 'video', label: 'MOV',   category: 'video' },
  mp3:  { icon: '🎵', color: 'audio', label: 'MP3',   category: 'audio' },
  wav:  { icon: '🎵', color: 'audio', label: 'WAV',   category: 'audio' },
  m4a:  { icon: '🎵', color: 'audio', label: 'M4A',   category: 'audio' },
};
const MIME_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', mpeg: 'video/mpeg', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  csv: 'text/csv', txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const ATTACH_EXTS = new Set(['pdf','docx','jpg','jpeg','png','gif','webp','mp4','mpeg','mov','mp3','wav','m4a','csv','txt']);

function getFileType(ext) {
  return FILE_TYPES[(ext || '').toLowerCase()] || { icon: '📎', color: 'generic', label: (ext || '').toUpperCase(), category: 'other' };
}

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

// ===== COOKIE HELPERS =====
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax${secure}`;
}
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
}
function deleteCookie(name) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax${secure}`;
}

// ===== STATE =====
let token = getCookie('github_token');
if (!token) {
  try { token = localStorage.getItem('github_token') || ''; } catch { token = ''; }
}
if (token) {
  setCookie('github_token', token, 365);
  try { localStorage.setItem('github_token', token); } catch {}
}

let allNotes      = [];
let filteredNotes = [];
let activeCategory = 'all';
let activeTag      = '';
let searchQuery    = '';
let searchDebounce = null;
let panelNoteId    = null;
let panelDocBlobUrl = null;
let vaultAuthError = false;
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
    setCookie('github_token', token, 365);
    try { localStorage.setItem('github_token', token); } catch {}
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
  setCookie('github_token', token, 365);
  try { localStorage.setItem('github_token', token); } catch {}
  closeModal('settings-modal');
  showToast('Token saved!', 'success');
  loadAllNotes();
}

function disconnectVault() {
  if (!confirm('Disconnect your vault? You can reconnect anytime with your token.')) return;
  token = ''; allNotes = [];
  deleteCookie('github_token');
  try { localStorage.removeItem('github_token'); } catch {}
  closeModal('settings-modal');
  showScreen('setup-screen');
  document.getElementById('setup-token-input').value = '';
  hideSetupError();
}

// ===== LOAD NOTES =====
async function loadAllNotes(showRefreshToast = false) {
  showLoadingState(); allNotes = []; vaultAuthError = false;
  try {
    const results = await Promise.allSettled(CONFIG.categories.map(cat => fetchCategoryFiles(cat)));
    results.forEach(r => { if (r.status === 'fulfilled') allNotes.push(...r.value); });
    allNotes.sort((a, b) => b.date !== a.date ? b.date.localeCompare(a.date) : b.name.localeCompare(a.name));
    applyFilters();
    buildTagFilters();
    if (vaultAuthError) {
      showToast('Token invalid or expired — open Settings to update it', 'error');
    } else if (showRefreshToast) {
      showToast('Vault refreshed!', 'success');
    }
  } catch {
    showToast('Failed to load vault. Check your token.', 'error');
    document.getElementById('notes-grid').innerHTML = '';
    document.getElementById('empty-state').classList.remove('hidden');
  }
}

async function fetchCategoryFiles(cat) {
  const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${cat.id}`);
  if (res.status === 401 || res.status === 403) { vaultAuthError = true; return []; }
  if (!res.ok) return [];
  const files = await res.json();
  if (!Array.isArray(files)) return [];

  const mdFiles  = files.filter(f => (f.name.endsWith('.md') || f.name.endsWith('.txt')) && f.name !== '.gitkeep');
  const mdFileNames = new Set(mdFiles.map(f => f.name));
  const docFiles = files.filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ATTACH_EXTS.has(ext) && !f.name.endsWith('.md');
  });

  // Build a map of doc files by filename so notes can link to them
  const docMap = {};
  docFiles.forEach(f => { docMap[f.name] = f; });

  const noteResults = await Promise.allSettled(mdFiles.map(f => fetchFileContent(f, cat, docMap)));
  const notes = noteResults.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);

  // Any doc files not linked to a .md become legacy standalone cards
  const linkedDocNames = new Set(notes.map(n => n.docName).filter(Boolean));
  const legacyDocs = docFiles.filter(f => !linkedDocNames.has(f.name) && !mdFileNames.has(f.name)).map(f => legacyDocCard(f, cat));

  return [...notes, ...legacyDocs];
}

async function fetchFileContent(file, cat, docMap = {}) {
  try {
    const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${file.path}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.content) return null;
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, '')), c => c.charCodeAt(0));
    const raw = new TextDecoder('utf-8').decode(bytes);

    // Check if this note references an attached document
    const docRef = extractDocumentRef(raw);
    let docInfo = {};
    if (docRef && docMap[docRef]) {
      const df = docMap[docRef];
      docInfo = {
        docName: df.name,
        docPath: df.path,
        docSha:  df.sha,
        docType: df.name.split('.').pop().toLowerCase(),
        docSize: df.size,
      };
    }

    return {
      id:       data.sha,
      sha:      data.sha,
      name:     file.name,
      path:     file.path,
      category: cat,
      title:    extractTitle(raw, file.name),
      date:     extractDate(raw, file.name),
      preview:  extractPreview(raw),
      tags:     extractTags(raw),
      actions:  extractActions(raw),
      raw,
      ...docInfo
    };
  } catch (e) {
    console.error('fetchFileContent failed:', file.path, e);
    return null;
  }
}

// ===== LEGACY DOC CARD (no matching .md) =====
function legacyDocCard(file, cat) {
  const ext = file.name.split('.').pop().toLowerCase();
  const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
  const dateMatch = nameWithoutExt.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : '';
  const displayName = nameWithoutExt
    .replace(/^\d{4}-\d{2}-\d{2}-?/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase()) || file.name;
  const ft = getFileType(ext);
  return {
    id: file.sha, sha: file.sha, name: file.name,
    path: file.path, category: cat,
    title: displayName || file.name, date,
    preview: '', tags: [], actions: [], raw: '',
    isLegacyDoc: true,
    docName: file.name, docPath: file.path, docSha: file.sha,
    docType: ext, docSize: file.size,
    _ft: ft,
  };
}

// ===== PARSERS =====
function extractTitle(raw, filename) {
  const h1 = raw.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  const name = filename.replace(/\.(md|txt)$/, '').replace(/^\d{4}-\d{2}-\d{2}-?/, '');
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || filename;
}

function extractDate(raw, filename) {
  const m = raw.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const f = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (f) return f[1];
  return '';
}

function extractDocumentRef(raw) {
  const m = raw.match(/^\*\*Document:\*\*\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractPreview(raw) {
  return raw
    .replace(/^---[\s\S]*?^---\n?/m, '')
    .replace(/^## ✅ Follow-up Actions[\s\S]*/m, '')
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

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ===== MARKDOWN UPDATERS =====
function updateTagsInRaw(raw, tags) {
  const tagStr = tags.map(t => t.startsWith('#') ? t : '#' + t).join(' ');
  if (raw.match(/^\*\*Tags:\*\*.*$/m)) {
    return raw.replace(/^\*\*Tags:\*\*.*$/m, `**Tags:** ${tagStr}`);
  }
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

  if (panelNoteId === note.id) {
    panelNoteId = newSha;
    refreshPanel(updated);
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

function toggleFavFromPanel() {
  const note = getNoteById(panelNoteId);
  if (!note) return;
  toggleFavourite(note.path);
  updatePanelFavState(note.path);
  applyFilters();
}

function updatePanelFavState(path) {
  const btn = document.getElementById('panel-fav-btn');
  if (!btn) return;
  const fav = isFavourite(path);
  btn.textContent = fav ? '★' : '☆';
  btn.classList.toggle('starred', fav);
  btn.title = fav ? 'Remove from favourites' : 'Add to favourites';
}

// ===== TAGS (panel) =====
async function addTagFromPanel() {
  const input = document.getElementById('panel-tag-input');
  let tag = input.value.trim().toLowerCase();
  if (!tag) return;
  tag = tag.startsWith('#') ? tag : '#' + tag;
  tag = '#' + tag.slice(1).replace(/[^a-z0-9_-]/g, '');
  if (!tag || tag === '#') return;

  const note = getNoteById(panelNoteId);
  if (!note) return;
  if (note.tags.includes(tag)) { showToast('Tag already added', ''); input.value = ''; return; }

  const newTags = [...note.tags, tag];
  input.value = '';
  try {
    await updateNoteRaw(note, updateTagsInRaw(note.raw, newTags), `Update tags: ${note.title}`);
    showToast(`${tag} added`, 'success');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

async function removeTagFromPanel(tag) {
  const note = getNoteById(panelNoteId);
  if (!note) return;
  const newTags = note.tags.filter(t => t !== tag);
  try {
    await updateNoteRaw(note, updateTagsInRaw(note.raw, newTags), `Update tags: ${note.title}`);
    showToast(`${tag} removed`, '');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

// ===== ACTIONS (panel) =====
async function addActionFromPanel() {
  const textInput = document.getElementById('panel-action-input');
  const dueInput  = document.getElementById('panel-action-due');
  const text = textInput.value.trim();
  if (!text) return;

  const note = getNoteById(panelNoteId);
  if (!note) return;

  const newActions = [...note.actions, { text, due: dueInput.value, done: false }];
  textInput.value = ''; dueInput.value = '';
  try {
    await updateNoteRaw(note, updateActionsInRaw(note.raw, newActions), `Add action: ${note.title}`);
    showToast('Action added', 'success');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

async function toggleActionFromPanel(index) {
  const note = getNoteById(panelNoteId);
  if (!note) return;
  const newActions = note.actions.map((a, i) => i === index ? { ...a, done: !a.done } : a);
  try {
    await updateNoteRaw(note, updateActionsInRaw(note.raw, newActions), `Update action: ${note.title}`);
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

async function removeActionFromPanel(index) {
  const note = getNoteById(panelNoteId);
  if (!note) return;
  const newActions = note.actions.filter((_, i) => i !== index);
  try {
    await updateNoteRaw(note, updateActionsInRaw(note.raw, newActions), `Update action: ${note.title}`);
    showToast('Action removed', '');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

// ===== EDIT IN PANEL =====
function startPanelEdit() {
  const note = getNoteById(panelNoteId);
  if (!note) return;
  document.getElementById('panel-edit-textarea').value = note.raw;
  document.getElementById('panel-view-mode').classList.add('hidden');
  document.getElementById('panel-edit-mode').classList.remove('hidden');
  document.getElementById('panel-edit-btn').style.display = 'none';
}

function cancelPanelEdit() {
  document.getElementById('panel-edit-mode').classList.add('hidden');
  document.getElementById('panel-view-mode').classList.remove('hidden');
  document.getElementById('panel-edit-btn').style.display = '';
}

async function savePanelEdit() {
  const note = getNoteById(panelNoteId);
  if (!note) return;
  const newRaw = document.getElementById('panel-edit-textarea').value;
  const btn = document.getElementById('panel-save-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await updateNoteRaw(note, newRaw, `Update: ${note.title}`);
    cancelPanelEdit();
    showToast('Saved!', 'success');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

// ===== DELETE ENTRY =====
async function deleteCurrentEntry() {
  const note = getNoteById(panelNoteId);
  if (!note) return;
  if (!confirm(`Delete "${note.title}"?\n\nThis cannot be undone.`)) return;

  try {
    const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${note.path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: `Delete: ${note.title}`, sha: note.sha })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Delete failed'); }

    // Also delete attached doc file if present
    if (note.docPath && note.docSha && !note.isLegacyDoc) {
      await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${note.docPath}`, {
        method: 'DELETE',
        body: JSON.stringify({ message: `Delete: ${note.docName}`, sha: note.docSha })
      }).catch(() => {});
    }

    allNotes = allNotes.filter(n => n.id !== panelNoteId);
    favourites.delete(note.path);
    localStorage.setItem('vault_favourites', JSON.stringify([...favourites]));
    closePanel();
    applyFilters();
    buildTagFilters();
    showToast('Deleted', 'success');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

// ===== SAVE NEW ENTRY =====
async function saveEntry(e) {
  e.preventDefault();
  const title    = document.getElementById('entry-title').value.trim();
  const catId    = document.getElementById('entry-category').value;
  const content  = document.getElementById('entry-content').value.trim();
  const rawTags  = document.getElementById('entry-tags-input').value.trim();
  const fileInput = document.getElementById('entry-file-input');
  const file     = fileInput.files[0] || null;

  if (!title) { showToast('Please enter a title', 'error'); return; }

  if (file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!ATTACH_EXTS.has(ext)) { showToast(`Unsupported file type: .${ext}`, 'error'); return; }
    if (file.size > 25 * 1024 * 1024) { showToast('File too large (max 25 MB)', 'error'); return; }
  }

  const btn = document.getElementById('entry-save-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const date = new Date().toISOString().split('T')[0];
    const slug = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);

    const tagList = rawTags
      ? rawTags.split(/[\s,]+/).filter(Boolean).map(t => {
          t = t.toLowerCase().replace(/[^#a-z0-9_-]/g, '');
          return t.startsWith('#') ? t : '#' + t;
        }).filter(t => t.length > 1)
      : [];

    const tagsLine = tagList.length ? `\n**Tags:** ${tagList.join(' ')}` : '';

    let docLine = '';
    let docFilename = '';
    if (file) {
      const ext = file.name.split('.').pop().toLowerCase();
      docFilename = `${date}-${slug}.${ext}`;
      docLine = `\n**Document:** ${docFilename}`;
    }

    const markdown = `# ${title}\n\n**Date:** ${date}${tagsLine}${docLine}\n\n${content}`.trim();
    const encoded  = btoa(unescape(encodeURIComponent(markdown)));
    const mdPath   = `${catId}/${date}-${slug}.md`;

    const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${mdPath}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Add: ${title}`, content: encoded })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Save failed'); }

    // Upload binary file if attached
    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < uint8.length; i += chunk) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunk));
      }
      const fileEncoded = btoa(binary);
      const filePath = `${catId}/${docFilename}`;
      const fileRes = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`, {
        method: 'PUT',
        body: JSON.stringify({ message: `Upload: ${file.name}`, content: fileEncoded })
      });
      if (!fileRes.ok) {
        const err = await fileRes.json();
        throw new Error(`Note saved, but file upload failed: ${err.message}`);
      }
    }

    closeModal('add-modal');
    document.getElementById('add-form').reset();
    document.getElementById('entry-file-label').classList.add('hidden');
    showToast(file ? 'Entry saved with attachment! ✓' : 'Saved to vault! ✓', 'success');
    await loadAllNotes();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save to Vault';
  }
}

function updateEntryFileLabel(input) {
  const hint = document.getElementById('entry-file-label');
  if (input.files && input.files[0]) {
    hint.textContent = `Selected: ${input.files[0].name} (${formatFileSize(input.files[0].size)})`;
    hint.classList.remove('hidden');
  }
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
      n.name.toLowerCase().includes(searchQuery) ||
      n.tags.some(t => t.includes(searchQuery)) ||
      n.category.name.toLowerCase().includes(searchQuery)
    );

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
    grid.innerHTML = ''; stats.textContent = '';
    const hasFilter = searchQuery || activeCategory !== 'all' || activeTag;
    const icon   = document.getElementById('empty-icon');
    const msg    = document.getElementById('empty-msg');
    const action = document.getElementById('empty-action');
    if (vaultAuthError) {
      icon.textContent   = '🔑';
      msg.textContent    = 'Token invalid or expired. Update it to reconnect to your vault.';
      action.textContent = 'Update Token';
      action.classList.remove('hidden');
    } else if (!hasFilter && allNotes.length === 0) {
      icon.textContent   = '🗄️';
      msg.textContent    = 'Your vault is empty or the category folders don\'t exist yet. Add a note or check your token.';
      action.textContent = 'Connect / Update Token';
      action.classList.remove('hidden');
    } else {
      icon.textContent = '🔍';
      msg.textContent  = 'Nothing found. Try a different search or filter.';
      action.classList.add('hidden');
    }
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const total    = allNotes.length;
  const showing  = filteredNotes.length;
  const hasFilter = searchQuery || activeCategory !== 'all' || activeTag;
  stats.textContent = hasFilter
    ? `Showing ${showing} of ${total} items`
    : `${total} entr${total !== 1 ? 'ies' : 'y'} in your vault`;

  grid.innerHTML = filteredNotes.map(note => noteCardHTML(note)).join('');
}

function noteCardHTML(note) {
  const title   = highlight(escapeHtml(note.title), searchQuery);
  const date    = formatDate(note.date);
  const fav     = isFavourite(note.path);
  const hasDoc  = !!(note.docName);
  const pendingActions = (note.actions || []).filter(a => !a.done).length;

  let previewHtml = '';
  if (note.isLegacyDoc) {
    // Legacy doc card — show doc type badge prominently
    const ft = getFileType(note.docType);
    previewHtml = `<div class="card-doc-indicator legacy">
      <span class="doc-icon-sm">${ft.icon}</span>
      <span class="doc-type-badge doc-type-${ft.color}">${ft.label}</span>
      ${note.docSize ? `<span class="doc-size">${formatFileSize(note.docSize)}</span>` : ''}
    </div>`;
  } else {
    const preview = highlight(escapeHtml(note.preview), searchQuery);
    if (preview) previewHtml = `<div class="card-preview">${preview}</div>`;
  }

  const docBadge = hasDoc && !note.isLegacyDoc
    ? (() => { const ft = getFileType(note.docType); return `<div class="card-doc-indicator">
        <span class="doc-icon-sm">${ft.icon}</span>
        <span class="doc-type-badge doc-type-${ft.color}">${ft.label}</span>
      </div>`; })()
    : '';

  const tagsHtml = (note.tags || []).length
    ? `<div class="card-tags">${note.tags.map(t => `<span class="card-tag-chip">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const actionsHint = pendingActions > 0
    ? `<span class="card-actions-badge">☐ ${pendingActions} action${pendingActions > 1 ? 's' : ''}</span>`
    : '';

  const footerRight = note.isLegacyDoc
    ? `<span class="read-more">${note.docType === 'pdf' ? 'Preview →' : 'View →'}</span>`
    : `<span class="read-more">Read more →</span>`;

  return `
    <div class="note-card${fav ? ' is-favourite' : ''}${note.isLegacyDoc ? ' legacy-doc-card' : ''}" onclick="openPanel('${escapeHtml(note.id)}')">
      <div class="card-top">
        <div class="card-top-left">
          <span class="cat-badge">${note.category.emoji} ${escapeHtml(note.category.name)}</span>
          ${date ? `<span class="card-date">${date}</span>` : ''}
        </div>
        ${note.isLegacyDoc
          ? `<button class="card-star-btn" onclick="event.stopPropagation(); deleteEntryById('${escapeHtml(note.id)}')" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
             </button>`
          : `<button class="card-star-btn${fav ? ' starred' : ''}"
              onclick="event.stopPropagation(); cardToggleFav('${escapeHtml(note.id)}')"
              title="${fav ? 'Remove from favourites' : 'Add to favourites'}">
              ${fav ? '★' : '☆'}
            </button>`
        }
      </div>
      <div class="card-title">${title}</div>
      ${previewHtml}
      ${docBadge}
      ${tagsHtml}
      <div class="card-footer">
        ${actionsHint}
        ${footerRight}
      </div>
    </div>`;
}

async function deleteEntryById(id) {
  const note = getNoteById(id);
  if (!note) return;
  if (!confirm(`Delete "${note.title}"?\n\nThis cannot be undone.`)) return;
  try {
    const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${note.path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: `Delete: ${note.title}`, sha: note.sha })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Delete failed'); }
    allNotes = allNotes.filter(n => n.id !== id);
    applyFilters();
    buildTagFilters();
    showToast('Deleted', 'success');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

function cardToggleFav(id) {
  const note = getNoteById(id);
  if (!note) return;
  toggleFavourite(note.path);
  applyFilters();
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

// ===== ENTRY PANEL =====
function openPanel(id) {
  const note = getNoteById(id);
  if (!note) return;
  panelNoteId = id;

  // Revoke old blob URL
  if (panelDocBlobUrl) { URL.revokeObjectURL(panelDocBlobUrl); panelDocBlobUrl = null; }

  // Reset edit mode
  document.getElementById('panel-edit-mode').classList.add('hidden');
  document.getElementById('panel-view-mode').classList.remove('hidden');
  document.getElementById('panel-edit-btn').style.display = '';

  renderPanel(note);

  document.getElementById('entry-panel').classList.remove('hidden');
  document.getElementById('panel-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closePanel() {
  document.getElementById('entry-panel').classList.add('hidden');
  document.getElementById('panel-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  panelNoteId = null;
  if (panelDocBlobUrl) { URL.revokeObjectURL(panelDocBlobUrl); panelDocBlobUrl = null; }
}

function renderPanel(note) {
  document.getElementById('panel-badge').innerHTML = `${note.category.emoji} ${escapeHtml(note.category.name)}`;
  document.getElementById('panel-date').textContent = formatDate(note.date);
  document.getElementById('panel-title').textContent = note.title;
  updatePanelFavState(note.path);

  // Edit button hidden for legacy doc cards (no .md to edit)
  document.getElementById('panel-edit-btn').style.display = note.isLegacyDoc ? 'none' : '';

  const noteSection = document.getElementById('panel-note-section');
  const docSection  = document.getElementById('panel-doc-section');

  if (note.isLegacyDoc) {
    noteSection.classList.add('hidden');
    docSection.classList.remove('hidden');
    setupDocSection(note);
    loadDocInPanel(note);
  } else {
    noteSection.classList.remove('hidden');

    // Render note content (strip metadata lines for display)
    const displayRaw = note.raw
      .replace(/^\*\*Tags:\*\*.*$/m, '')
      .replace(/^\*\*Document:\*\*.*$/m, '')
      .replace(/^## ✅ Follow-up Actions[\s\S]*/m, '');
    document.getElementById('panel-note-content').innerHTML = marked.parse(displayRaw);

    renderPanelTags(note.tags);
    renderPanelActions(note.actions);

    if (note.docName) {
      docSection.classList.remove('hidden');
      setupDocSection(note);
      loadDocInPanel(note);
    } else {
      docSection.classList.add('hidden');
    }
  }
}

function setupDocSection(note) {
  const ft = getFileType(note.docType || '');
  document.getElementById('panel-doc-icon').textContent = ft.icon;
  document.getElementById('panel-doc-name').textContent = note.docName || note.name || '';
  const badge = document.getElementById('panel-doc-type-badge');
  badge.textContent = ft.label;
  badge.className   = `doc-type-badge doc-type-${ft.color}`;
  document.getElementById('panel-doc-size').textContent = note.docSize ? formatFileSize(note.docSize) : '';
  // Reset download button
  const dlBtn = document.getElementById('panel-doc-download');
  if (dlBtn) { dlBtn.classList.add('hidden'); dlBtn.removeAttribute('href'); dlBtn.removeAttribute('download'); }
  // Reset viewer
  document.getElementById('panel-doc-viewer').innerHTML =
    `<div class="doc-loading"><div class="spinner"></div><span>Loading...</span></div>`;
}

async function loadDocInPanel(note) {
  const viewer  = document.getElementById('panel-doc-viewer');
  const path    = note.isLegacyDoc ? note.path : note.docPath;
  const docType = note.docType;
  const fname   = note.docName || note.name || 'file';

  try {
    const res = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`);
    if (!res.ok) throw new Error('Failed to load file');
    const data = await res.json();

    let bytes;
    if (data.content) {
      bytes = Uint8Array.from(atob(data.content.replace(/\n/g, '')), c => c.charCodeAt(0));
    } else if (data.download_url) {
      // File > 1 MB — fetch via download_url (includes auth token for private repos)
      const dlRes = await fetch(data.download_url, { headers: { Authorization: `token ${token}` } });
      if (!dlRes.ok) throw new Error('Failed to download file');
      bytes = new Uint8Array(await dlRes.arrayBuffer());
    } else {
      throw new Error('File content unavailable');
    }

    const mime = MIME_TYPES[docType] || 'application/octet-stream';
    const blob = new Blob([bytes], { type: mime });
    panelDocBlobUrl = URL.createObjectURL(blob);

    // Enable download button
    const dlBtn = document.getElementById('panel-doc-download');
    if (dlBtn) {
      dlBtn.href = panelDocBlobUrl;
      dlBtn.download = fname;
      dlBtn.classList.remove('hidden');
    }

    const ft = getFileType(docType);

    if (ft.category === 'image') {
      viewer.innerHTML = `<div class="media-viewer"><img src="${panelDocBlobUrl}" alt="${escapeHtml(fname)}" class="preview-img" /></div>`;
    } else if (ft.category === 'video') {
      viewer.innerHTML = `<div class="media-viewer"><video controls class="preview-video"><source src="${panelDocBlobUrl}" type="${mime}">Your browser does not support video playback.</video></div>`;
    } else if (ft.category === 'audio') {
      viewer.innerHTML = `<div class="media-viewer audio-viewer"><audio controls class="preview-audio"><source src="${panelDocBlobUrl}" type="${mime}">Your browser does not support audio playback.</audio></div>`;
    } else if (docType === 'pdf') {
      viewer.innerHTML = `<iframe src="${panelDocBlobUrl}" class="pdf-iframe" title="${escapeHtml(fname)}"></iframe>`;
    } else if (docType === 'docx') {
      if (typeof mammoth === 'undefined') throw new Error('mammoth.js not loaded — check your internet connection');
      const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
      viewer.innerHTML = `<div class="docx-content">${result.value}</div>`;
    } else if (ft.category === 'text') {
      const text = new TextDecoder('utf-8').decode(bytes);
      viewer.innerHTML = `<div class="text-content"><pre class="text-pre">${escapeHtml(text)}</pre></div>`;
    } else {
      viewer.innerHTML = `<div class="doc-error"><p>Preview not available for .${escapeHtml(docType)} files.</p></div>`;
    }
  } catch (e) {
    viewer.innerHTML = `<div class="doc-error">
      <p>Could not load file: ${escapeHtml(e.message)}</p>
      <p class="doc-error-hint">Files larger than ~1 MB are fetched via download URL. Check your connection.</p>
    </div>`;
  }
}

function refreshPanel(note) {
  // Called after updateNoteRaw — re-render the panel in place
  const displayRaw = note.raw
    .replace(/^\*\*Tags:\*\*.*$/m, '')
    .replace(/^\*\*Document:\*\*.*$/m, '')
    .replace(/^## ✅ Follow-up Actions[\s\S]*/m, '');
  document.getElementById('panel-title').textContent = note.title;
  document.getElementById('panel-note-content').innerHTML = marked.parse(displayRaw);
  renderPanelTags(note.tags);
  renderPanelActions(note.actions);
}

function renderPanelTags(tags) {
  const container = document.getElementById('panel-tags');
  if (tags.length === 0) {
    container.innerHTML = `<span class="no-items-hint">No tags yet — add one below</span>`;
    return;
  }
  container.innerHTML = tags.map(tag => `
    <span class="tag-chip">
      ${escapeHtml(tag)}
      <button class="tag-chip-remove" onclick="removeTagFromPanel('${escapeHtml(tag)}')" title="Remove tag">×</button>
    </span>`).join('');
}

function renderPanelActions(actions) {
  const list = document.getElementById('panel-actions');
  if (actions.length === 0) {
    list.innerHTML = `<li><span class="no-items-hint">No actions yet — add one below</span></li>`;
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  list.innerHTML = actions.map((a, i) => {
    const isOverdue = a.due && a.due < today && !a.done;
    return `
      <li class="action-item${a.done ? ' done' : ''}">
        <div class="action-checkbox${a.done ? ' checked' : ''}" onclick="toggleActionFromPanel(${i})" title="${a.done ? 'Mark incomplete' : 'Mark complete'}">
          ${a.done ? '✓' : ''}
        </div>
        <div class="action-body">
          <div class="action-text">${escapeHtml(a.text)}</div>
          ${a.due ? `<div class="action-due${isOverdue ? ' overdue' : ''}">📅 ${formatDate(a.due)}${isOverdue ? ' · Overdue' : ''}</div>` : ''}
        </div>
        <button class="action-delete-btn" onclick="removeActionFromPanel(${i})" title="Delete action">×</button>
      </li>`;
  }).join('');
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
  const opts = CONFIG.categories.map(cat =>
    `<option value="${cat.id}">${cat.emoji} ${cat.name}</option>`
  ).join('');
  document.getElementById('entry-category').innerHTML = opts;
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
}

function modalBackdropClick(e, id) {
  if (e.target === e.currentTarget) closeModal(id);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closePanel();
    ['add-modal', 'settings-modal'].forEach(closeModal);
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
