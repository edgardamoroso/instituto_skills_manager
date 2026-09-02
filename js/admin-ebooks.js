import { api, ApiError } from './api.js';
import { guardAdmin } from './session.js';
import { formatBRL, escapeHtml, ebookModeLabel } from './format.js';

const errorMessages = {
  EBOOK_FIELDS_REQUIRED: 'Preencha título e modalidade.',
  EBOOK_PRICE_INVALID: 'Informe um preço válido para publicar.',
  EBOOK_FILE_REQUIRED: 'Envie o arquivo do eBook para publicar.',
  EBOOK_EXTERNAL_URL_INVALID: 'Informe uma URL http(s) válida da loja.',
  EBOOK_MODE_LOCKED: 'Não é possível mudar a modalidade: já há pedidos.',
  EBOOK_HAS_ORDERS: 'Este eBook tem pedidos e não pode ser excluído.',
  FILE_TOO_LARGE: 'Arquivo muito grande.',
  UPLOAD_TYPE_NOT_ALLOWED: 'Tipo de arquivo não permitido.',
};

/* ---------- admin-ebooks.html: lista ---------- */

export async function initAdminEbooks() {
  const list = document.getElementById('ebook-admin-list');
  if (!list) return;
  if (!(await guardAdmin())) return;
  const count = document.getElementById('ebook-admin-count');

  async function reload() {
    const ebooks = await api.ebooksManage();
    count.textContent = `${ebooks.length} ${ebooks.length === 1 ? 'eBook' : 'eBooks'}`;
    list.innerHTML = ebooks.length
      ? ebooks.map((ebook) => `
        <article class="admin-item">
          <div>
            <strong>${escapeHtml(ebook.title)}</strong>
            <p>${escapeHtml(ebook.description || 'Sem descrição.')}</p>
            <span class="badge">${ebookModeLabel(ebook.mode)}</span>
            <span class="badge">${ebook.status === 'publicado' ? 'Publicado' : 'Rascunho'}</span>
            ${ebook.priceCents != null ? `<span class="badge">${formatBRL(ebook.priceCents)}</span>` : ''}
            <span class="badge">${ebook.ordersCount} ${ebook.ordersCount === 1 ? 'pedido' : 'pedidos'}</span>
          </div>
          <div class="actions">
            <a class="action-btn edit" href="gerenciar-ebook.html?id=${ebook.id}">Editar</a>
            <button class="action-btn delete" data-id="${ebook.id}" ${ebook.ordersCount ? 'disabled title="Tem pedidos"' : ''}>Excluir</button>
          </div>
        </article>`).join('')
      : '<p class="empty-state">Nenhum eBook cadastrado.</p>';
  }

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    if (!window.confirm('Excluir este eBook?')) return;
    try {
      await api.deleteEbook(button.dataset.id);
      await reload();
    } catch (error) {
      alert(error instanceof ApiError ? (errorMessages[error.code] || 'Não foi possível excluir.') : 'Falha de conexão.');
    }
  });

  await reload();
}

/* ---------- gerenciar-ebook.html: editor ---------- */

function toggleModeFields(root, mode) {
  root.querySelectorAll('[data-mode-site]').forEach((node) => { node.hidden = mode !== 'venda_no_site'; });
  root.querySelectorAll('[data-mode-external]').forEach((node) => { node.hidden = mode !== 'link_externo'; });
}

export async function initEbookEditor() {
  const root = document.getElementById('ebook-editor');
  if (!root) return;
  if (!(await guardAdmin())) return;

  const id = new URLSearchParams(window.location.search).get('id');
  let ebook = null;
  if (id) {
    try {
      ebook = (await api.ebooksManage()).find((e) => e.id === id) || null;
    } catch {
      ebook = null;
    }
  }

  root.innerHTML = `
    <section class="course-heading">
      <a class="back-link" href="admin-ebooks.html">← Voltar aos eBooks</a>
      <h1>${ebook ? 'Editar eBook' : 'Novo eBook'}</h1>
    </section>
    <form id="ebook-form" class="panel enrollment-form">
      <label for="eb-title">Título</label>
      <input id="eb-title" name="title" required />
      <label for="eb-description">Descrição</label>
      <textarea id="eb-description" name="description" rows="3"></textarea>
      <label for="eb-pages">Nº de páginas (opcional)</label>
      <input id="eb-pages" name="pages" type="number" min="1" />
      <label for="eb-mode">Modalidade</label>
      <select id="eb-mode" name="mode">
        <option value="venda_no_site">Venda no site</option>
        <option value="link_externo">Link para loja externa</option>
      </select>
      <label for="eb-status">Status</label>
      <select id="eb-status" name="status">
        <option value="rascunho">Rascunho</option>
        <option value="publicado">Publicado</option>
      </select>
      <label for="eb-cover">Capa (imagem)</label>
      <input id="eb-cover" name="cover" type="file" accept="image/*" />

      <div data-mode-site>
        <label for="eb-price">Preço (R$)</label>
        <input id="eb-price" name="price" inputmode="decimal" placeholder="49,90" />
        <label for="eb-file">Arquivo do eBook (PDF ou EPUB)</label>
        <input id="eb-file" name="file" type="file" accept=".pdf,.epub" />
        <label for="eb-sample">Amostra (PDF)</label>
        <input id="eb-sample" name="sample" type="file" accept=".pdf" />
      </div>

      <div data-mode-external hidden>
        <label for="eb-url">URL da loja externa</label>
        <input id="eb-url" name="externalUrl" type="url" placeholder="https://www.amazon.com.br/dp/..." />
        <label for="eb-store">Nome da loja (opcional)</label>
        <input id="eb-store" name="storeName" placeholder="Amazon" />
        <label for="eb-price-ref">Preço de referência (opcional, R$)</label>
        <input id="eb-price-ref" name="priceRef" inputmode="decimal" placeholder="39,90" />
      </div>

      <button class="btn btn-primary btn-full" type="submit">Salvar</button>
      <p id="eb-feedback" class="form-feedback" role="status" aria-live="polite"></p>
    </form>`;

  const form = root.querySelector('#ebook-form');
  const feedback = form.querySelector('#eb-feedback');
  const modeSelect = form.querySelector('#eb-mode');
  modeSelect.addEventListener('change', () => toggleModeFields(root, modeSelect.value));

  if (ebook) {
    form.title.value = ebook.title;
    form.description.value = ebook.description || '';
    form.pages.value = ebook.pages || '';
    form.mode.value = ebook.mode;
    form.status.value = ebook.status || 'rascunho';
    if (ebook.mode === 'venda_no_site' && ebook.priceCents != null) form.price.value = (ebook.priceCents / 100).toFixed(2).replace('.', ',');
    if (ebook.mode === 'link_externo') {
      form.externalUrl.value = ebook.externalUrl || '';
      form.storeName.value = ebook.storeName || '';
      if (ebook.priceCents != null) form.priceRef.value = (ebook.priceCents / 100).toFixed(2).replace('.', ',');
    }
  }
  toggleModeFields(root, form.mode.value);

  function toCents(text) {
    const clean = String(text || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const number = Number.parseFloat(clean);
    return Number.isFinite(number) ? Math.round(number * 100) : 0;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = new FormData();
    body.set('title', form.title.value);
    body.set('description', form.description.value);
    body.set('pages', form.pages.value);
    body.set('mode', form.mode.value);
    body.set('status', form.status.value);
    if (form.mode.value === 'venda_no_site') {
      body.set('priceCents', String(toCents(form.price.value)));
    } else {
      body.set('externalUrl', form.externalUrl.value);
      body.set('storeName', form.storeName.value);
      body.set('priceCents', String(toCents(form.priceRef.value)));
    }
    for (const field of ['cover', 'file', 'sample']) {
      const input = form.elements[field];
      if (input && input.files && input.files[0]) body.set(field, input.files[0]);
    }
    feedback.dataset.tone = 'ok';
    try {
      const saved = ebook ? await api.updateEbook(ebook.id, body) : await api.createEbook(body);
      window.location.href = `gerenciar-ebook.html?id=${saved.id}`;
    } catch (error) {
      feedback.dataset.tone = 'error';
      feedback.textContent = error instanceof ApiError ? (errorMessages[error.code] || 'Não foi possível salvar.') : 'Falha de conexão.';
    }
  });
}
