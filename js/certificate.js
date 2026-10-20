import { api } from './api.js';
import { escapeHtml } from './format.js';

function longDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  });
}

// Mesmo conteúdo do PDF gerado no backend (lib/certificatePdf.js).
function certificateMarkup(cert) {
  const workload = cert.duration ? `, com carga horária de ${escapeHtml(cert.duration)}` : '';
  return `
    <article class="certificate" aria-label="Certificado de conclusão">
      <img class="certificate-logo" src="assets/logo.svg" alt="Instituto Skills Manager" />
      <p class="certificate-kicker">Certificado de conclusão</p>
      <p class="certificate-lead">Certificamos que</p>
      <h1 class="certificate-name">${escapeHtml(cert.studentName)}</h1>
      <p class="certificate-text">concluiu o curso</p>
      <h2 class="certificate-course">${escapeHtml(cert.courseTitle)}</h2>
      <p class="certificate-text">no Instituto Skills Manager${workload}, em ${escapeHtml(longDate(cert.issuedAt))}.</p>
      <div class="certificate-sign">
        <strong>Instituto Skills Manager</strong>
        ${cert.authorName ? `<span>Autor do curso: ${escapeHtml(cert.authorName)}</span>` : ''}
      </div>
      <p class="certificate-code">Código de verificação: <strong>${escapeHtml(cert.code)}</strong></p>
    </article>`;
}

export async function initCertificatePage() {
  const root = document.getElementById('certificate-page');
  if (!root) return;
  const code = new URLSearchParams(window.location.search).get('code') || '';

  let cert;
  try {
    cert = await api.certificate(code);
  } catch {
    root.innerHTML = `
      <section class="empty-state content-gate">
        <h1>Certificado não encontrado</h1>
        <p>Confira se o link ou o código de verificação está completo, por exemplo ABCD-EFGH-JKMN.</p>
      </section>`;
    return;
  }

  document.title = `Certificado — ${cert.courseTitle} | Instituto Skills Manager`;
  root.innerHTML = `
    <section class="certificate-toolbar">
      <p class="certificate-valid">✓ Certificado válido, emitido pelo Instituto Skills Manager.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/api/certificates/${encodeURIComponent(cert.code)}/pdf">Baixar PDF</a>
        <button class="btn btn-secondary" type="button" id="copy-certificate-link">Copiar link</button>
      </div>
      <p id="copy-feedback" class="form-feedback" role="status" aria-live="polite"></p>
    </section>
    ${certificateMarkup(cert)}`;

  document.getElementById('copy-certificate-link').addEventListener('click', async () => {
    const feedback = document.getElementById('copy-feedback');
    try {
      await navigator.clipboard.writeText(cert.verifyUrl);
      feedback.textContent = 'Link copiado. Quem receber o link pode conferir a autenticidade do certificado.';
    } catch {
      feedback.textContent = cert.verifyUrl;
    }
  });
}
