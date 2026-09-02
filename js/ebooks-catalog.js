import { api, ApiError } from './api.js';
import { formatBRL, escapeHtml, safeUrl, ebookModeLabel, storeButtonLabel, cpfMask } from './format.js';

function ebookCard(ebook) {
  const price = ebook.priceCents != null ? formatBRL(ebook.priceCents) : 'Ver na loja';
  const external = ebook.mode === 'link_externo';
  return `
    <a class="card course-card" href="ebook.html?id=${encodeURIComponent(ebook.id)}">
      <div class="card-head">
        <h3>${escapeHtml(ebook.title)}</h3>
        <span class="type-pill">${external ? 'Loja externa' : 'eBook'}</span>
      </div>
      <p>${escapeHtml(ebook.description)}</p>
      <div class="meta">
        <span>💸 ${escapeHtml(price)}</span>
        ${ebook.pages ? `<span>▣ ${ebook.pages} páginas</span>` : ''}
      </div>
      <span class="card-link">${external ? 'Ver na loja externa →' : 'Ver detalhes →'}</span>
    </a>`;
}

export async function initEbookCatalog() {
  const grid = document.getElementById('ebook-list');
  if (!grid) return;
  try {
    const ebooks = await api.ebooks();
    grid.innerHTML = ebooks.length
      ? ebooks.map(ebookCard).join('')
      : '<p class="empty-state">Nenhum eBook disponível ainda.</p>';
  } catch {
    grid.innerHTML = '<p class="empty-state">Não foi possível carregar os eBooks agora.</p>';
  }
}

function purchaseFormMarkup() {
  return `
    <form id="ebook-buy-form" class="panel enrollment-form">
      <h2>Comprar</h2>
      <label for="buy-name">Nome completo</label>
      <input id="buy-name" name="name" autocomplete="name" required />
      <label for="buy-cpf">CPF</label>
      <input id="buy-cpf" name="cpf" inputmode="numeric" placeholder="000.000.000-00" aria-describedby="buy-cpf-err" required />
      <label for="buy-birthdate">Data de nascimento</label>
      <input id="buy-birthdate" name="birthdate" type="date" required />
      <label for="buy-email">E-mail</label>
      <input id="buy-email" name="email" type="email" autocomplete="email" required />
      <label for="buy-phone">Telefone</label>
      <input id="buy-phone" name="phone" type="tel" autocomplete="tel" required />
      <label for="buy-method">Forma de pagamento</label>
      <select id="buy-method" name="paymentMethod">
        <option value="pix">PIX</option>
        <option value="credito">Cartão de crédito</option>
        <option value="debito">Cartão de débito</option>
      </select>
      <button class="btn btn-primary btn-full" type="submit">Solicitar compra</button>
      <p id="buy-feedback" class="form-feedback" role="status" aria-live="polite"></p>
    </form>`;
}

function bindPurchaseForm(root, ebookId) {
  const form = root.querySelector('#ebook-buy-form');
  const feedback = form.querySelector('#buy-feedback');
  const cpf = form.querySelector('#buy-cpf');
  cpf.addEventListener('input', () => { cpf.value = cpfMask(cpf.value); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    feedback.dataset.tone = 'ok';
    try {
      await api.createEbookOrder({
        ebookId,
        name: data.get('name'),
        cpf: data.get('cpf'),
        birthdate: data.get('birthdate'),
        email: data.get('email'),
        phone: data.get('phone'),
        paymentMethod: data.get('paymentMethod'),
      });
      form.innerHTML = `<h2>Pedido recebido</h2><p>Você receberá o link de pagamento no e-mail <strong>${escapeHtml(data.get('email'))}</strong>. Assim que o pagamento for confirmado, enviaremos o link de download.</p>`;
    } catch (error) {
      feedback.dataset.tone = 'error';
      const map = {
        ORDER_CPF_INVALID: 'CPF inválido. Confira os números.',
        ORDER_BIRTHDATE_INVALID: 'Data de nascimento inválida.',
        ORDER_FIELDS_REQUIRED: 'Preencha todos os campos.',
        ORDER_EBOOK_NOT_SELLABLE: 'Este eBook não está disponível para compra no site.',
        RATE_LIMITED: 'Muitas tentativas. Aguarde alguns minutos.',
      };
      feedback.textContent = error instanceof ApiError ? (map[error.code] || 'Não foi possível registrar o pedido.') : 'Falha de conexão.';
    }
  });
}

export async function initEbookPage() {
  const root = document.getElementById('ebook-page');
  if (!root) return;
  const id = new URLSearchParams(window.location.search).get('id');

  let ebook;
  try {
    ebook = await api.ebook(id);
  } catch {
    root.innerHTML = '<section class="empty-state"><h1>eBook não encontrado</h1><a class="btn btn-primary" href="ebooks.html">Ver catálogo</a></section>';
    return;
  }

  document.title = `${ebook.title} | Instituto Skills Manager`;
  const external = ebook.mode === 'link_externo';
  const priceLine = ebook.priceCents != null
    ? `<span>💸 ${formatBRL(ebook.priceCents)}${external ? ' (na loja externa)' : ''}</span>`
    : '';

  root.innerHTML = `
    <section class="course-heading">
      <a class="back-link" href="ebooks.html">← Voltar ao catálogo</a>
      <span class="type-pill">${ebookModeLabel(ebook.mode)}</span>
      <h1>${escapeHtml(ebook.title)}</h1>
      <p class="course-description">${escapeHtml(ebook.description)}</p>
      <div class="meta">
        ${priceLine}
        ${ebook.pages ? `<span>▣ ${ebook.pages} páginas</span>` : ''}
      </div>
      ${ebook.sampleUrl ? `<a class="btn btn-secondary" href="${escapeHtml(safeUrl(ebook.sampleUrl))}" target="_blank" rel="noopener">Ver amostra</a>` : ''}
      ${external ? `<a class="btn btn-primary" href="${escapeHtml(safeUrl(ebook.externalUrl))}" target="_blank" rel="noopener">${escapeHtml(storeButtonLabel(ebook.externalUrl, ebook.storeName))}</a>` : ''}
    </section>
    ${external ? '' : `<section class="admin-layout">${purchaseFormMarkup()}</section>`}`;

  if (!external) bindPurchaseForm(root, ebook.id);
}
