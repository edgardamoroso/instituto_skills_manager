import PDFDocument from 'pdfkit';

// Certificado em PDF (A4 paisagem). Fontes padrão do PDF (Helvetica), que cobrem
// os acentos do português; o logotipo é redesenhado em vetores a partir do
// assets/logo.svg (barras + linha de tendência).

const NAVY = '#14213D';
const GOLD = '#A97C2A';
const ORANGE = '#E8971E';
const MUTED = '#64748B';

export function formatIssuedDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  });
}

function drawLogo(doc, x, y, scale) {
  doc.save().translate(x, y).scale(scale);
  doc.fillColor(NAVY);
  for (const [bx, by, h] of [[8, 70, 42], [40, 54, 58], [72, 38, 74], [104, 24, 88]]) {
    doc.roundedRect(bx, by, 20, h, 9).fill();
  }
  doc.lineWidth(5).lineCap('round').lineJoin('round').strokeColor(ORANGE)
    .moveTo(18, 70).lineTo(50, 54).lineTo(82, 38).lineTo(114, 24).lineTo(130, 10).stroke();
  doc.fillColor(ORANGE);
  for (const [cx, cy, r] of [[18, 70, 7], [50, 54, 7], [82, 38, 7], [114, 24, 7], [131, 9, 8]]) {
    doc.circle(cx, cy, r).fill();
  }
  doc.restore();
  // Texto ao lado das barras (fora do scale, para o tamanho da fonte ficar exato).
  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(11 * scale * 2)
    .text('I N S T I T U T O', x + 158 * scale, y + 26 * scale, { lineBreak: false });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(26 * scale * 2)
    .text('Skills', x + 156 * scale, y + 50 * scale, { continued: true, lineBreak: false })
    .font('Helvetica').text(' Manager', { lineBreak: false });
}

// Gera o PDF e devolve um Buffer.
export function renderCertificatePdf(cert, { verifyUrl }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: {
        Title: `Certificado — ${cert.courseTitle}`,
        Author: 'Instituto Skills Manager',
        Subject: `Certificado de conclusão de ${cert.studentName}`,
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { width, height } = doc.page;
    const center = { width: width - 160, align: 'center' };

    // Moldura
    doc.lineWidth(6).strokeColor(NAVY).rect(24, 24, width - 48, height - 48).stroke();
    doc.lineWidth(1.5).strokeColor(GOLD).rect(36, 36, width - 72, height - 72).stroke();

    drawLogo(doc, width / 2 - 135, 62, 0.5);

    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(13)
      .text('CERTIFICADO DE CONCLUSÃO', 80, 150, { ...center, characterSpacing: 4 });

    doc.fillColor(MUTED).font('Helvetica').fontSize(14).text('Certificamos que', 80, 195, center);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(32).text(cert.studentName, 80, 222, center);

    const workload = cert.duration ? `, com carga horária de ${cert.duration}` : '';
    doc.fillColor(NAVY).font('Helvetica').fontSize(15)
      .text('concluiu o curso', 80, doc.y + 14, center)
      .font('Helvetica-Bold').fontSize(20).text(cert.courseTitle, 80, doc.y + 6, center)
      .font('Helvetica').fontSize(15)
      .text(`no Instituto Skills Manager${workload}, em ${formatIssuedDate(cert.issuedAt)}.`, 80, doc.y + 8, center);

    // Assinatura / autor
    const lineY = height - 150;
    doc.lineWidth(1).strokeColor(NAVY).moveTo(width / 2 - 140, lineY).lineTo(width / 2 + 140, lineY).stroke();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12)
      .text('Instituto Skills Manager', 80, lineY + 8, center);
    if (cert.authorName) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(`Autor do curso: ${cert.authorName}`, 80, doc.y + 2, center);
    }

    // Verificação
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text(`Código de verificação: ${cert.code}  ·  Confira em ${verifyUrl}`, 80, height - 62, center);

    doc.end();
  });
}
