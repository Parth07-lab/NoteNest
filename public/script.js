/**
 * script.js - NoteNest Frontend Logic
 * Connects UI interactions to NoteNest REST API backend.
 */
(function() {
  const COLORS = ['yellow', 'pink', 'mint', 'sky', 'lilac', 'white'];
  const TITLES = { all: 'All notes', pinned: 'Pinned', archive: 'Archive', trash: 'Trash' };
  const $ = id => document.getElementById(id);

  // App UI state
  let state = {
    view: 'all',
    cat: null,
    q: '',
    sort: 'updated',
    editId: null,
    currentUser: null,
    loading: false
  };

  let searchTimer = null;
  let toastTimer = null;
  let currentNotes = [];

  // ================= Formatting & Utilities =================
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function words(s) {
    return s && s.trim() ? s.trim().split(/\s+/).length : 0;
  }

  function fmt(t) {
    if (!t) return '';
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function setBusy(isBusy) {
    state.loading = isBusy;
    document.querySelectorAll('button').forEach(btn => {
      // Don't disable auth buttons here
      if (!btn.closest('#authModal')) {
        btn.disabled = isBusy;
      }
    });
  }

  // ================= Authentication UI =================
  let authMode = 'login'; // 'login' or 'register'

  function showAuthModal(mode = 'login') {
    authMode = mode;
    $('authLoginTab').classList.toggle('active', mode === 'login');
    $('authRegisterTab').classList.toggle('active', mode === 'register');
    $('authNameGroup').hidden = (mode === 'login');
    $('authTitle').textContent = mode === 'login'
      ? 'Sign in to sync your notes across devices'
      : 'Create a free account to get started';
    $('authSubmitBtn').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    $('authError').textContent = '';
    $('authModal').hidden = false;
    $('authEmail').focus();
  }

  function hideAuthModal() {
    $('authModal').hidden = true;
    $('authForm').reset();
    $('authError').textContent = '';
  }

  $('authLoginTab').onclick = () => showAuthModal('login');
  $('authRegisterTab').onclick = () => showAuthModal('register');

  $('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    $('authError').textContent = '';

    if (!email || !password) {
      $('authError').textContent = 'Please fill in all required fields';
      return;
    }

    $('authSubmitBtn').disabled = true;
    try {
      let result;
      if (authMode === 'register') {
        const name = $('authName').value.trim();
        if (name.length < 2) {
          $('authError').textContent = 'Name must be at least 2 characters';
          $('authSubmitBtn').disabled = false;
          return;
        }
        if (password.length < 8) {
          $('authError').textContent = 'Password must be at least 8 characters';
          $('authSubmitBtn').disabled = false;
          return;
        }
        result = await NoteNestAPI.register(name, email, password);
        toast('Account created! Welcome to NoteNest');
      } else {
        result = await NoteNestAPI.login(email, password);
        toast('Welcome back!');
      }

      NoteNestAPI.setToken(result.token);
      state.currentUser = result.user;
      hideAuthModal();
      updateUserUI();
      await checkLocalNotesMigration();
      await refreshAll();
    } catch (err) {
      $('authError').textContent = err.message || 'Authentication failed';
    } finally {
      $('authSubmitBtn').disabled = false;
    }
  });

  $('logoutBtn').onclick = () => {
    NoteNestAPI.clearToken();
    state.currentUser = null;
    currentNotes = [];
    $('grid').innerHTML = '';
    updateUserUI();
    showAuthModal('login');
    toast('Logged out');
  };

  window.addEventListener('notenest:auth-required', () => {
    state.currentUser = null;
    updateUserUI();
    showAuthModal('login');
  });

  function updateUserUI() {
    if (state.currentUser) {
      $('userBadge').hidden = false;
      $('userName').textContent = state.currentUser.name || state.currentUser.email;
    } else {
      $('userBadge').hidden = true;
    }
  }

  // ================= One-time LocalStorage Migration =================
  async function checkLocalNotesMigration() {
    try {
      const raw = localStorage.getItem('notenest.notes.v1') || localStorage.getItem('jotter.notes.v1');
      if (!raw) return;
      const oldNotes = JSON.parse(raw);
      if (Array.isArray(oldNotes) && oldNotes.length > 0) {
        const migrationKey = `notenest.migrated.${state.currentUser.id}`;
        if (localStorage.getItem(migrationKey)) return;

        const wantUpload = confirm(`Found ${oldNotes.length} notes saved locally on this computer. Upload them to your account now?`);
        if (wantUpload) {
          const res = await NoteNestAPI.importNotes(oldNotes);
          localStorage.setItem(migrationKey, 'true');
          toast(`Uploaded ${res.added} local note${res.added === 1 ? '' : 's'}`);
        } else {
          localStorage.setItem(migrationKey, 'declined');
        }
      }
    } catch (e) {
      console.warn('Local migration check skipped:', e);
    }
  }

  // ================= Data Loading & Rendering =================
  async function refreshAll() {
    if (!NoteNestAPI.getToken()) return;
    try {
      await Promise.all([loadNotes(), loadSidebar()]);
    } catch (err) {
      toast(err.message);
    }
  }

  async function loadNotes() {
    if (!NoteNestAPI.getToken()) return;
    try {
      const notes = await NoteNestAPI.getNotes({
        view: state.view,
        cat: state.cat,
        q: state.q,
        sort: state.sort
      });
      currentNotes = notes;
      renderNotes();
    } catch (err) {
      toast(err.message);
    }
  }

  async function loadSidebar() {
    if (!NoteNestAPI.getToken()) return;
    try {
      const [stats, categories] = await Promise.all([
        NoteNestAPI.getStats(),
        NoteNestAPI.getCategories()
      ]);

      // Update sidebar counts
      $('c-all').textContent = stats.all;
      $('c-pinned').textContent = stats.pinned;
      $('c-archive').textContent = stats.archive;
      $('c-trash').textContent = stats.trash;

      document.querySelectorAll('.nav[data-view]').forEach(b => {
        b.classList.toggle('active', b.dataset.view === state.view && !state.cat);
      });

      // Update categories in sidebar
      if (categories.length === 0) {
        $('cats').innerHTML = '<div style="padding:4px 12px;color:var(--muted);font-size:.85rem">No categories yet</div>';
      } else {
        $('cats').innerHTML = categories.map(c => `
          <button class="nav ${state.cat === c.name ? 'active' : ''}" data-cat="${esc(c.name)}">
            # ${esc(c.name)} <span class="count">${c.count}</span>
          </button>
        `).join('');
      }

      // Update category datalist for editor autocomplete
      $('catList').innerHTML = categories.map(c => `<option value="${esc(c.name)}">`).join('');
      $('emptyBtn').hidden = !(state.view === 'trash' && stats.trash > 0);
    } catch (err) {
      console.error('Sidebar load failed:', err.message);
    }
  }

  function renderNotes() {
    $('title').textContent = state.cat ? `# ${state.cat}` : TITLES[state.view];

    if (!currentNotes.length) {
      const msg = state.q
        ? ['Nothing found', 'Try a different keyword.']
        : state.view === 'trash'
          ? ['Trash is empty', 'Deleted notes wait here until you empty it.']
          : state.view === 'archive'
            ? ['Nothing archived', 'Archive notes you want to keep but hide.']
            : ['No notes here yet', 'Press “+ New note” to write your first note!'];
      $('grid').innerHTML = `<div class="empty"><b>${msg[0]}</b>${msg[1]}</div>`;
      return;
    }

    $('grid').innerHTML = currentNotes.map(n => {
      const isTrash = n.status === 'trashed';
      const isArchive = n.status === 'archived';
      const actions = isTrash
        ? `<button class="icon-btn" data-act="restore" title="Restore">↩️</button>
           <button class="icon-btn" data-act="purge" title="Delete forever">❌</button>`
        : `<button class="icon-btn" data-act="archive" title="${isArchive ? 'Unarchive' : 'Archive'}">${isArchive ? '📤' : '📥'}</button>
           <button class="icon-btn" data-act="copy" title="Duplicate">📄</button>
           <button class="icon-btn" data-act="trash" title="Move to trash">🗑️</button>`;

      return `
        <article class="note ${esc(n.color)}" data-id="${esc(n.id)}">
          ${isTrash ? '' : `<button class="icon-btn pin ${n.pinned ? 'on' : ''}" data-act="pin" title="${n.pinned ? 'Unpin' : 'Pin'}">📌</button>`}
          <h4>${esc(n.title) || '<i style="opacity:.6">Untitled</i>'}</h4>
          <p>${esc(n.body)}</p>
          <div class="meta">
            ${n.cat ? `<span class="chip">${esc(n.cat)}</span>` : '<span></span>'}
            <span>${words(n.body)} words · ${fmt(n.updated)}</span>
          </div>
          <div class="actions">${actions}</div>
        </article>
      `;
    }).join('');
  }

  // ================= Note Editor Dialog =================
  const dlg = $('dlg');
  $('swatches').innerHTML = COLORS.map((c, i) => `
    <label style="flex-direction:row">
      <input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}>
      <span class="note ${c}" style="min-height:0;padding:0;box-shadow:none"></span>
    </label>
  `).join('');

  function openEditor(id) {
    state.editId = id || null;
    const n = currentNotes.find(x => x.id === id);
    $('dlgTitle').textContent = n ? 'Edit note' : 'New note';
    $('fTitle').value = n ? n.title : '';
    $('fBody').value = n ? n.body : '';
    $('fCat').value = n ? n.cat : (state.cat || '');
    const col = n ? n.color : 'yellow';
    const radio = document.querySelector(`input[name=color][value="${col}"]`);
    if (radio) radio.checked = true;

    updateWc();
    dlg.hidden = false;
    $('fTitle').focus();
  }

  function closeEditor() {
    dlg.hidden = true;
    state.editId = null;
  }

  function updateWc() {
    const w = words($('fBody').value);
    $('wc').textContent = `${w} word${w === 1 ? '' : 's'}`;
  }

  $('fBody').addEventListener('input', updateWc);
  $('cancelBtn').onclick = closeEditor;

  async function saveNote(e) {
    if (e) e.preventDefault();
    const title = $('fTitle').value.trim();
    const body = $('fBody').value.trim();
    if (!title && !body) {
      toast('Write a title or some text first');
      return;
    }
    const cat = $('fCat').value.trim();
    const color = document.querySelector('input[name=color]:checked').value;

    setBusy(true);
    try {
      if (state.editId) {
        await NoteNestAPI.updateNote(state.editId, { title, body, cat, color });
        toast('Note updated');
      } else {
        await NoteNestAPI.createNote({ title, body, cat, color });
        toast('Note saved');
      }
      closeEditor();
      await refreshAll();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  $('form').addEventListener('submit', saveNote);
  $('newBtn').onclick = () => openEditor();

  dlg.addEventListener('click', e => {
    if (e.target === dlg) closeEditor();
  });

  // ================= Note Actions (Delegation) =================
  $('grid').addEventListener('click', async (e) => {
    const card = e.target.closest('.note');
    if (!card) return;
    const noteId = card.dataset.id;
    const n = currentNotes.find(x => x.id === noteId);
    if (!n) return;

    const actEl = e.target.closest('[data-act]');
    const act = actEl ? actEl.dataset.act : null;

    // Clicking note body opens editor (unless trashed)
    if (!act) {
      if (n.status !== 'trashed') openEditor(n.id);
      return;
    }

    setBusy(true);
    try {
      if (act === 'pin') {
        await NoteNestAPI.patchNote(noteId, { pinned: !n.pinned });
        toast(n.pinned ? 'Unpinned' : 'Pinned');
      } else if (act === 'archive') {
        const nextStatus = n.status === 'archived' ? 'active' : 'archived';
        await NoteNestAPI.patchNote(noteId, { status: nextStatus });
        toast(nextStatus === 'archived' ? 'Archived' : 'Moved back to notes');
      } else if (act === 'trash') {
        await NoteNestAPI.patchNote(noteId, { status: 'trashed' });
        toast('Moved to trash');
      } else if (act === 'restore') {
        await NoteNestAPI.patchNote(noteId, { status: 'active' });
        toast('Restored');
      } else if (act === 'copy') {
        await NoteNestAPI.duplicateNote(noteId);
        toast('Duplicated');
      } else if (act === 'purge') {
        if (confirm('Delete this note forever?')) {
          await NoteNestAPI.deleteNote(noteId);
          toast('Deleted forever');
        }
      }
      await refreshAll();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  });

  $('emptyBtn').onclick = async () => {
    if (confirm('Delete everything in the trash forever?')) {
      setBusy(true);
      try {
        const res = await NoteNestAPI.emptyTrash();
        toast(`Trash emptied (${res.deletedCount} deleted)`);
        await refreshAll();
      } catch (err) {
        toast(err.message);
      } finally {
        setBusy(false);
      }
    }
  };

  // ================= Navigation, Search, Sort =================
  document.querySelector('aside').addEventListener('click', async (e) => {
    const b = e.target.closest('.nav');
    if (!b) return;

    if (b.dataset.view) {
      state.view = b.dataset.view;
      state.cat = null;
    }
    if (b.dataset.cat) {
      state.cat = state.cat === b.dataset.cat ? null : b.dataset.cat;
      state.view = 'all';
    }
    await refreshAll();
  });

  // Debounce search by 250ms
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      state.q = e.target.value;
      await loadNotes();
    }, 250);
  });

  $('sort').addEventListener('change', async (e) => {
    state.sort = e.target.value;
    await loadNotes();
  });

  // Keyboard shortcuts: '/' focuses search, 'Esc' closes dialog, 'Ctrl+Enter' saves
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      $('search').focus();
    }
    if (e.key === 'Escape' && !dlg.hidden) {
      closeEditor();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !dlg.hidden) {
      saveNote();
    }
  });

  // ================= Backup (Export & Import) =================
  $('exportBtn').onclick = async () => {
    setBusy(true);
    try {
      const blob = await NoteNestAPI.exportNotesBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notenest-backup.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup downloaded');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  $('importBtn').onclick = () => $('importFile').click();

  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('Backup file must contain a JSON array');

        const res = await NoteNestAPI.importNotes(data);
        toast(`Imported ${res.added} note${res.added === 1 ? '' : 's'}`);
        await refreshAll();
      } catch (err) {
        toast('Invalid backup file: ' + err.message);
      } finally {
        setBusy(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  });

  // ================= Initialize App =================
  async function init() {
    const token = NoteNestAPI.getToken();
    if (!token) {
      showAuthModal('login');
      return;
    }

    try {
      const user = await NoteNestAPI.getMe();
      state.currentUser = user.user || user;
      updateUserUI();
      await checkLocalNotesMigration();
      await refreshAll();
    } catch (err) {
      // Token invalid or expired
      NoteNestAPI.clearToken();
      showAuthModal('login');
    }
  }

  init();
})();
