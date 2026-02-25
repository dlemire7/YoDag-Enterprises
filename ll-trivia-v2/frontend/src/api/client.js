const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api/v1`;

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  const res = await fetch(url, config);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Questions
export const getQuestions = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/questions?${qs}`);
};
export const getQuestion = (id) => request(`/questions/${id}`);

// Subcategories
export const getSubcategories = (category) => request(`/subcategories?category=${encodeURIComponent(category)}`);

// Progress
export const recordProgress = (questionId, confidence) =>
  request('/progress', { method: 'POST', body: { question_id: questionId, confidence } });

// Sessions
export const createSession = (mode, settings = {}) =>
  request('/sessions', { method: 'POST', body: { mode, settings_json: JSON.stringify(settings) } });
export const updateSession = (id, data) =>
  request(`/sessions/${id}`, { method: 'PUT', body: data });
export const getSessions = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/sessions?${qs}`);
};

// Bookmarks
export const toggleBookmark = (questionId) =>
  request(`/bookmarks/${questionId}`, { method: 'POST' });

// Notes
export const saveNote = (questionId, noteText) =>
  request(`/questions/${questionId}/notes`, { method: 'PUT', body: { note_text: noteText } });

// Tags
export const addTag = (questionId, tag) =>
  request(`/questions/${questionId}/tags`, { method: 'POST', body: { tag } });
export const removeTag = (questionId, tag) =>
  request(`/questions/${questionId}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });

export const getSessionAnswers = (sessionId) => request(`/sessions/${sessionId}/answers`);

// Stats
export const getStatsOverview = () => request('/stats/overview');
export const getStatsCategories = () => request('/stats/categories');
export const getStatsTrends = (days = 30) => request(`/stats/trends?days=${days}`);
export const getStatsHeatmap = () => request('/stats/heatmap');
export const getStatsWeakest = () => request('/stats/weakest');

// AI
export const learnMore = (questionId, mode = 'quick') =>
  request('/learn-more', { method: 'POST', body: { question_id: questionId, mode } });

// Import
export const startScrape = (data) =>
  request('/import/scrape', { method: 'POST', body: data });
export const getScrapeStatus = () => request('/import/status');

// Export
export const getExportJsonUrl = () => `${API_BASE}/export/json`;
export const getExportCsvUrl = () => `${API_BASE}/export/csv`;

// Settings
export const getSettings = () => request('/settings');
export const updateSettings = (settings) =>
  request('/settings', { method: 'PUT', body: settings });

// AI Question Forge
export const generateQuestions = (category, count = 5, difficultyHint = 'mixed') =>
  request('/ai/generate-questions', {
    method: 'POST',
    body: { category, count, difficulty_hint: difficultyHint },
  });

// Data management
export const resetProgress = () =>
  request('/data/reset-progress', { method: 'POST' });
export const clearAICache = () =>
  request('/data/clear-ai-cache', { method: 'POST' });

// Manual question entry
export const addQuestion = (data) =>
  request('/questions', { method: 'POST', body: data });
