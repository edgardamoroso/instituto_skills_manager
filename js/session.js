import { api, ApiError } from './api.js';
import { escapeHtml } from './format.js';

let cachedUser;

export async function currentUser() {
  if (cachedUser !== undefined) return cachedUser;
  try {
    const data = await api.me();
    cachedUser = data?.user || null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      cachedUser = null;
    } else {
      cachedUser = null;
    }
  }
  return cachedUser;
}

export function clearUserCache() {
  cachedUser = undefined;
}

// Injeta o estado de login na barra de navegação de qualquer página.
export async function renderAuthNav() {
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;
  const user = await currentUser();

  navLinks.querySelectorAll('[data-auth-slot]').forEach((node) => node.remove());

  const slot = document.createElement('span');
  slot.dataset.authSlot = 'true';
  slot.className = 'nav-auth';

  if (user) {
    const isAdmin = user.role === 'admin';
    const isAuthor = user.role === 'author';
    const hasAdminNav = navLinks.querySelector('a[href="matriculas.html"], a[href="admin.html"]');
    const adminLink = isAdmin && !hasAdminNav
      ? '<a href="matriculas.html" class="nav-link">Painel admin</a>'
      : '';
    const authorLink = isAuthor
      ? '<a href="meus-cursos.html" class="nav-link">Meus cursos</a>'
      : '';
    const studentLink = !isAdmin && !isAuthor
      ? '<a href="inscricao.html" class="nav-link">Minhas matrículas</a>'
      : '';
    slot.innerHTML = `
      ${adminLink}
      ${authorLink}
      ${studentLink}
      <a href="conta.html" class="nav-link nav-user">${escapeHtml(user.name)}</a>
      <a href="#" class="nav-link" data-action="logout">Sair</a>`;
  } else if (!navLinks.querySelector('a[href="login.html"]')) {
    slot.innerHTML = '<a href="login.html" class="nav-link">Entrar</a>';
  }
  if (slot.childNodes.length) navLinks.append(slot);

  const logout = slot.querySelector('[data-action="logout"]');
  if (logout) {
    logout.addEventListener('click', async (event) => {
      event.preventDefault();
      await api.logout().catch(() => {});
      clearUserCache();
      window.location.href = 'index.html';
    });
  }
}

export async function guardAdmin() {
  const user = await currentUser();
  if (!user || user.role !== 'admin') {
    const next = encodeURIComponent(window.location.pathname.replace(/^\//, '') + window.location.search);
    window.location.href = `login.html?next=${next}`;
    return null;
  }
  return user;
}

export async function guardCourseEditor() {
  const user = await currentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'author')) {
    const next = encodeURIComponent(window.location.pathname.replace(/^\//, '') + window.location.search);
    window.location.href = `login.html?next=${next}`;
    return null;
  }
  return user;
}

export async function requireLogin() {
  const user = await currentUser();
  if (!user) {
    const next = encodeURIComponent(window.location.pathname.replace(/^\//, '') + window.location.search);
    window.location.href = `login.html?next=${next}`;
    return null;
  }
  return user;
}
