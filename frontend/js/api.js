// Tiny fetch wrapper that injects the JWT and parses JSON.
const TOKEN_KEY = 'rideflow_token';
const USER_KEY = 'rideflow_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
  catch (_) { return null; }
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch (_) { data = { raw: text }; } }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function requireRole(role) {
  const u = getUser();
  if (!u) { location.href = '/login.html'; return null; }
  if (role && String(u.role).toUpperCase() !== role.toUpperCase()) {
    location.href = '/login.html';
    return null;
  }
  return u;
}

export function logout() {
  clearSession();
  location.href = '/login.html';
}

export function fmtMoney(n) {
  const num = Number(n || 0);
  return `Rs ${num.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}
export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}
export function escape(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
