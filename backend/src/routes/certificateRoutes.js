import { Router } from 'express';
import {
  getCertificate,
  issueCertificate,
  listMyCertificates,
} from '../services/certificateService.js';
import { renderCertificatePdf } from '../lib/certificatePdf.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../lib/config.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';

const router = Router();

const verifyUrl = (code) => `${config.publicUrl}/certificado.html?code=${encodeURIComponent(code)}`;

router.get('/mine', requireAuth, wrap((request, response) => response.json(listMyCertificates(request.user))));

// Emite o certificado do aluno logado (só com todas as aulas abertas).
router.post('/', requireAuth, wrap((request, response) => {
  const certificate = issueCertificate(request.body?.courseId, request.user);
  audit('certificate.issue', { request, target: certificate.code, detail: certificate.courseId });
  response.status(201).json({ ...certificate, verifyUrl: verifyUrl(certificate.code) });
}));

// Público: quem tem o código confere a autenticidade e baixa o PDF.
router.get('/:code', wrap((request, response) => {
  const certificate = getCertificate(request.params.code);
  response.json({ ...certificate, verifyUrl: verifyUrl(certificate.code) });
}));

router.get('/:code/pdf', wrap(async (request, response) => {
  const certificate = getCertificate(request.params.code);
  const pdf = await renderCertificatePdf(certificate, { verifyUrl: verifyUrl(certificate.code) });
  const fileName = `certificado-${certificate.code}.pdf`;
  response.type('application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  response.setHeader('Cache-Control', 'private, no-store');
  response.send(pdf);
}));

export default router;
