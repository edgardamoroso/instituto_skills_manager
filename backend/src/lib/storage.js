// Armazenamento dos arquivos principais de eBook — fora da árvore servida estaticamente.
// Só saem por download autenticado por token (ver ebookService/ebookRoutes).
import crypto from 'node:crypto';
import { mkdirSync, renameSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { badRequest } from './errors.js';

const storageDir = config.ebook.storageDir;

export function ensureStorage() {
  mkdirSync(storageDir, { recursive: true });
}

// Resolve um caminho relativo guardado no banco para o caminho absoluto real,
// recusando qualquer coisa que escape de storageDir (path traversal).
export function resolveProtected(relPath) {
  const clean = String(relPath || '').replace(/^[/\\]+/, '');
  const abs = path.resolve(storageDir, clean);
  const base = path.resolve(storageDir);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw badRequest('EBOOK_FILE_PATH_INVALID');
  }
  return abs;
}

// Move um arquivo temporário (do multer) para o storage protegido.
// Devolve o caminho relativo a guardar no banco.
export function saveProtected(tmpPath, originalExt) {
  ensureStorage();
  const ext = String(originalExt || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const relPath = `${crypto.randomUUID()}${ext}`;
  const dest = resolveProtected(relPath);
  try {
    renameSync(tmpPath, dest);
  } catch {
    // rename falha entre dispositivos diferentes; cai para copy + unlink.
    copyFileSync(tmpPath, dest);
    rmSync(tmpPath, { force: true });
  }
  return relPath;
}

export function removeProtected(relPath) {
  if (!relPath) return;
  rmSync(resolveProtected(relPath), { force: true });
}
