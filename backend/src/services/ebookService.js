import crypto from 'node:crypto';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { db } from '../db/index.js';
import { config } from '../lib/config.js';
import { badRequest, notFound, conflict, gone, tooMany } from '../lib/errors.js';
import { str, optionalStr, oneOf, int, httpUrl } from '../lib/validate.js';
import { saveProtected, removeProtected, resolveProtected } from '../lib/storage.js';

const listPublishedStmt = db.prepare("SELECT * FROM ebooks WHERE status = 'publicado' ORDER BY created_at DESC, title ASC");
const listAllStmt = db.prepare('SELECT * FROM ebooks ORDER BY created_at DESC, title ASC');
const getStmt = db.prepare('SELECT * FROM ebooks WHERE id = ?');
const ordersCountStmt = db.prepare('SELECT count(*) AS n FROM ebook_orders WHERE ebook_id = ?');
const insertStmt = db.prepare(
  `INSERT INTO ebooks (id, title, description, pages, cover_path, mode, status, price_cents,
     file_path, file_name, sample_path, sample_name, external_url, store_name)
   VALUES (@id, @title, @description, @pages, @cover_path, @mode, @status, @price_cents,
     @file_path, @file_name, @sample_path, @sample_name, @external_url, @store_name)`,
);
const updateStmt = db.prepare(
  `UPDATE ebooks SET title = @title, description = @description, pages = @pages, cover_path = @cover_path,
     mode = @mode, status = @status, price_cents = @price_cents, file_path = @file_path, file_name = @file_name,
     sample_path = @sample_path, sample_name = @sample_name, external_url = @external_url, store_name = @store_name
   WHERE id = @id`,
);
const deleteStmt = db.prepare('DELETE FROM ebooks WHERE id = ?');

const insertGrantStmt = db.prepare(
  'INSERT INTO ebook_download_grants (token, order_id, expires_at, max_downloads) VALUES (?, ?, ?, ?)',
);
const getGrantStmt = db.prepare('SELECT * FROM ebook_download_grants WHERE token = ?');
const consumeGrantStmt = db.prepare(
  'UPDATE ebook_download_grants SET download_count = download_count + 1 WHERE token = ? AND download_count < max_downloads',
);
const expireGrantsStmt = db.prepare('UPDATE ebook_download_grants SET expires_at = ? WHERE order_id = ?');
const orderEbookStmt = db.prepare('SELECT ebook_id FROM ebook_orders WHERE id = ?');

function ordersCount(ebookId) {
  return ordersCountStmt.get(ebookId).n;
}

export function publicToApi(row) {
  const isSite = row.mode === 'venda_no_site';
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    pages: row.pages ?? null,
    coverUrl: row.cover_path || null,
    mode: row.mode,
    priceCents: isSite ? row.price_cents : (row.price_cents || null),
    sampleUrl: isSite ? (row.sample_path || null) : null,
    externalUrl: isSite ? null : (row.external_url || null),
    storeName: isSite ? null : (row.store_name || null),
  };
}

function adminToApi(row) {
  return {
    ...publicToApi(row),
    status: row.status,
    fileName: row.file_name || null,
    hasFile: Boolean(row.file_path),
    hasSample: Boolean(row.sample_path),
    ordersCount: ordersCount(row.id),
    createdAt: row.created_at,
  };
}

function normalizeScalars(input = {}) {
  const mode = oneOf(input.mode, ['venda_no_site', 'link_externo'], { code: 'EBOOK_FIELDS_REQUIRED' });
  const status = oneOf(input.status || 'rascunho', ['rascunho', 'publicado'], { code: 'EBOOK_FIELDS_REQUIRED' });
  const pagesRaw = input.pages == null || input.pages === '' ? null : int(input.pages, { min: 1, max: 100000, code: 'EBOOK_FIELDS_REQUIRED' });
  const priceRaw = input.priceCents == null || input.priceCents === '' ? 0 : int(input.priceCents, { min: 0, max: 100_000_000, code: 'EBOOK_PRICE_INVALID' });
  return {
    title: str(input.title, { code: 'EBOOK_FIELDS_REQUIRED', min: 1, max: 160 }),
    description: optionalStr(input.description, { max: 4000 }),
    pages: pagesRaw,
    mode,
    status,
    price_cents: priceRaw,
    external_url: mode === 'link_externo' ? httpUrl(input.externalUrl, { code: 'EBOOK_EXTERNAL_URL_INVALID' }) : '',
    store_name: optionalStr(input.storeName, { max: 80 }),
  };
}

function assertPublishable(data) {
  if (data.status !== 'publicado') return;
  if (data.mode === 'venda_no_site') {
    if (!data.file_path) throw badRequest('EBOOK_FILE_REQUIRED');
    if (!data.price_cents) throw badRequest('EBOOK_PRICE_INVALID');
  }
}

function coverUrlFrom(file) {
  return file ? `/uploads/${path.basename(file.filename)}` : undefined;
}

// files: { cover?, file?, sample? } — objetos do multer (ou undefined).
export function createEbook(input, files = {}) {
  const data = normalizeScalars(input);
  const row = {
    id: crypto.randomUUID(),
    ...data,
    cover_path: coverUrlFrom(files.cover) || '',
    file_path: '',
    file_name: '',
    sample_path: '',
    sample_name: '',
  };
  if (data.mode === 'venda_no_site') {
    if (files.file) {
      row.file_path = saveProtected(files.file.path, path.extname(files.file.originalname));
      row.file_name = str(files.file.originalname, { min: 1, max: 200 });
    }
    if (files.sample) {
      row.sample_path = `/uploads/${path.basename(files.sample.filename)}`;
      row.sample_name = str(files.sample.originalname, { min: 1, max: 200 });
    }
  }
  assertPublishable(row);
  insertStmt.run(row);
  return adminToApi(getStmt.get(row.id));
}

export function updateEbook(id, input, files = {}) {
  const current = getStmt.get(id);
  if (!current) throw notFound('EBOOK_NOT_FOUND');
  const data = normalizeScalars(input);
  if (data.mode !== current.mode && ordersCount(id) > 0) throw conflict('EBOOK_MODE_LOCKED');

  const next = {
    id,
    ...data,
    cover_path: files.cover ? coverUrlFrom(files.cover) : current.cover_path,
    file_path: current.file_path,
    file_name: current.file_name,
    sample_path: current.sample_path,
    sample_name: current.sample_name,
  };
  if (data.mode === 'venda_no_site') {
    if (files.file) {
      next.file_path = saveProtected(files.file.path, path.extname(files.file.originalname));
      next.file_name = str(files.file.originalname, { min: 1, max: 200 });
    }
    if (files.sample) {
      next.sample_path = `/uploads/${path.basename(files.sample.filename)}`;
      next.sample_name = str(files.sample.originalname, { min: 1, max: 200 });
    }
  } else {
    next.file_path = '';
    next.file_name = '';
    next.sample_path = '';
    next.sample_name = '';
  }
  assertPublishable(next);
  updateStmt.run(next);

  if (files.cover && current.cover_path) removeUpload(current.cover_path);
  if (next.file_path !== current.file_path && current.file_path) safeRemoveProtected(current.file_path);
  if (next.sample_path !== current.sample_path && current.sample_path) removeUpload(current.sample_path);
  return adminToApi(getStmt.get(id));
}

export function deleteEbook(id) {
  const row = getStmt.get(id);
  if (!row) throw notFound('EBOOK_NOT_FOUND');
  if (ordersCount(id) > 0) throw conflict('EBOOK_HAS_ORDERS');
  deleteStmt.run(id);
  if (row.file_path) safeRemoveProtected(row.file_path);
  removeUpload(row.cover_path);
  removeUpload(row.sample_path);
}

export function listPublishedEbooks() {
  return listPublishedStmt.all().map(publicToApi);
}

export function getPublishedEbook(id) {
  const row = getStmt.get(id);
  if (!row || row.status !== 'publicado') throw notFound('EBOOK_NOT_FOUND');
  return publicToApi(row);
}

export function listAllEbooks() {
  return listAllStmt.all().map(adminToApi);
}

export function issueDownloadGrant(orderId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.ebook.downloadTtlHours * 3600 * 1000).toISOString();
  insertGrantStmt.run(token, orderId, expiresAt, config.ebook.maxDownloads);
  return { token, expiresAt, url: `${config.publicUrl}/api/ebooks/download/${token}` };
}

export function expireDownloadGrants(orderId) {
  expireGrantsStmt.run(new Date(Date.now() - 1000).toISOString(), orderId);
}

export function consumeDownload(token) {
  const grant = getGrantStmt.get(String(token || ''));
  if (!grant) throw notFound('DOWNLOAD_TOKEN_NOT_FOUND');
  if (Date.parse(grant.expires_at) < Date.now()) throw gone('DOWNLOAD_TOKEN_EXPIRED');
  if (consumeGrantStmt.run(token).changes === 0) throw tooMany('DOWNLOAD_LIMIT_REACHED');
  const order = orderEbookStmt.get(grant.order_id);
  if (!order) throw notFound('ORDER_NOT_FOUND');
  return resolveEbookFilePath(order.ebook_id);
}

export function resolveEbookFilePath(ebookId) {
  const row = getStmt.get(ebookId);
  if (!row || !row.file_path) throw notFound('EBOOK_FILE_NOT_FOUND');
  return { absPath: resolveProtected(row.file_path), downloadName: row.file_name || `${row.title}.pdf` };
}

const uploadsDir = path.resolve(config.ebook.storageDir, '..', '..', 'uploads');

function removeUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const target = path.resolve(uploadsDir, path.basename(url));
  if (target !== uploadsDir && target.startsWith(uploadsDir + path.sep)) {
    try {
      rmSync(target, { force: true });
    } catch {
      /* arquivo já sumiu */
    }
  }
}

function safeRemoveProtected(relPath) {
  try {
    removeProtected(relPath);
  } catch {
    /* caminho inválido / já removido */
  }
}
