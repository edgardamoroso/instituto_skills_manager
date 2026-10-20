import { api, ApiError } from './api.js';
import { clearUserCache } from './session.js';

export async function initSetPasswordPage() {
  const form = document.getElementById('set-password-form');
  if (!form) return;

  const feedback = document.getElementById('set-password-feedback');
  const token = new URLSearchParams(window.location.search).get('token') || '';

  if (!token) {
    feedback.textContent = 'Link inválido. Peça um novo acesso pelo Fale Conosco.';
    feedback.dataset.tone = 'error';
    form.hidden = true;
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    const confirm = String(data.get('confirm') || '');
    if (password.length < 8) {
      feedback.textContent = 'A senha precisa ter pelo menos 8 caracteres.';
      feedback.dataset.tone = 'error';
      return;
    }
    if (password !== confirm) {
      feedback.textContent = 'As senhas não conferem.';
      feedback.dataset.tone = 'error';
      return;
    }
    try {
      const result = await api.setPassword(token, password);
      clearUserCache();
      // Leva direto para a área de cada perfil — "Minha conta" abre com o formulário
      // de troca de senha e o navegador o preenche sozinho, o que confunde.
      const role = result?.user?.role;
      window.location.href = role === 'author' ? 'meus-cursos.html' : role === 'student' ? 'inscricao.html' : 'index.html';
    } catch (error) {
      feedback.dataset.tone = 'error';
      if (error instanceof ApiError && error.code === 'PASSWORD_SET_INVALID') {
        feedback.textContent = 'Este link expirou ou já foi usado. Peça um novo acesso pelo Fale Conosco.';
      } else if (error instanceof ApiError && error.code === 'PASSWORD_TOO_SHORT') {
        feedback.textContent = 'A senha precisa ter entre 8 e 200 caracteres.';
      } else {
        feedback.textContent = 'Não foi possível definir a senha agora.';
      }
    }
  });
}
