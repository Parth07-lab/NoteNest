/**
 * api.js - Lightweight API client for NoteNest
 * Wraps browser fetch with JWT auth, error handling, and 401 session expiry recovery.
 */
(function() {
  const TOKEN_KEY = 'notenest.token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function request(endpoint, options = {}) {
    const url = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
    const headers = { ...options.headers };

    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (networkErr) {
      throw new Error('Cannot connect to NoteNest server. Please ensure the server is running.');
    }

    // Handle 401 Unauthorised (session expired or invalid token)
    if (response.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent('notenest:auth-required'));
      let msg = 'Authentication required';
      try {
        const errJson = await response.json();
        if (errJson && errJson.error && errJson.error.message) msg = errJson.error.message;
      } catch (_) {}
      throw new Error(msg);
    }

    // For file downloads (like export backup)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/octet-stream') || response.headers.get('content-disposition')) {
      if (!response.ok) throw new Error('Download failed');
      return response.blob();
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      return null;
    }

    if (!response.ok || (data && data.success === false)) {
      const message = (data && data.error && data.error.message) || `Request failed with status ${response.status}`;
      const err = new Error(message);
      err.code = data && data.error && data.error.code;
      err.status = response.status;
      throw err;
    }

    return (data && data.data !== undefined) ? data.data : data;
  }

  window.NoteNestAPI = {
    getToken,
    setToken,
    clearToken,
    request,

    // Auth
    register: (name, email, password) => request('/api/auth/register', { method: 'POST', body: { name, email, password } }),
    login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
    getMe: () => request('/api/auth/me'),

    // Notes
    getNotes: ({ view = 'all', cat = '', q = '', sort = 'updated' } = {}) => {
      const params = new URLSearchParams();
      if (view) params.set('view', view);
      if (cat) params.set('cat', cat);
      if (q) params.set('q', q);
      if (sort) params.set('sort', sort);
      return request(`/api/notes?${params.toString()}`);
    },
    getStats: () => request('/api/notes/stats'),
    getCategories: () => request('/api/notes/categories'),
    createNote: (note) => request('/api/notes', { method: 'POST', body: note }),
    updateNote: (id, note) => request(`/api/notes/${id}`, { method: 'PUT', body: note }),
    patchNote: (id, patch) => request(`/api/notes/${id}`, { method: 'PATCH', body: patch }),
    duplicateNote: (id) => request(`/api/notes/${id}/duplicate`, { method: 'POST' }),
    deleteNote: (id) => request(`/api/notes/${id}`, { method: 'DELETE' }),
    emptyTrash: () => request('/api/notes/trash', { method: 'DELETE' }),
    importNotes: (notes) => request('/api/notes/import', { method: 'POST', body: { notes } }),
    exportNotesBlob: () => request('/api/notes/export')
  };
})();
