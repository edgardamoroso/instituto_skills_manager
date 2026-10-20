// Arquivos de aula — fora da árvore servida estaticamente. Só saem pela rota
// autenticada da aula (GET /api/courses/:id/lessons/:lessonId/file), que confere
// matrícula e sequência. No banco, o recurso fica como "stored:<arquivo>".
import crypto from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const PREFIX = 'stored:';
const LEGACY_PREFIX = '/uploads/';

export const isStoredFile = (resource) => String(resource || '').startsWith(PREFIX);
// Uploads antigos ainda servidos por /uploads (migrados no boot — ver db/index.js).
export const isLegacyUpload = (resource) => String(resource || '').startsWith(LEGACY_PREFIX);
export const isLessonFile = (resource) => isStoredFile(resource) || isLegacyUpload(resource);

function moveFile(from, to) {
  try {
    renameSync(from, to);
  } catch {
    // rename falha entre dispositivos diferentes; cai para copy + unlink.
    copyFileSync(from, to);
    rmSync(from, { force: true });
  }
}

// Move o arquivo temporário do multer para o storage e devolve o recurso a gravar.
export function saveLessonFile(tmpPath, originalName) {
  mkdirSync(config.lessonStorageDir, { recursive: true });
  const ext = path.extname(String(originalName || '')).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const name = `${crypto.randomUUID()}${ext}`;
  moveFile(tmpPath, path.join(config.lessonStorageDir, name));
  return `${PREFIX}${name}`;
}

// Caminho absoluto do arquivo de um recurso; null se não for arquivo de aula.
// basename impede path traversal mesmo que o banco tenha algo inesperado.
export function lessonFilePath(resource) {
  if (isStoredFile(resource)) return path.join(config.lessonStorageDir, path.basename(resource.slice(PREFIX.length)));
  if (isLegacyUpload(resource)) return path.join(config.uploadsDir, path.basename(resource));
  return null;
}

export function removeLessonFile(resource) {
  const file = lessonFilePath(resource);
  if (!file) return;
  try {
    rmSync(file, { force: true });
  } catch (error) {
    console.error('Falha ao remover arquivo de aula:', error.message);
  }
}

// Migra um upload antigo (/uploads/x) para o storage protegido. Devolve o novo
// recurso, ou null se o arquivo não existir mais (aí o registro fica como está).
export function migrateLegacyUpload(resource) {
  if (!isLegacyUpload(resource)) return null;
  const from = path.join(config.uploadsDir, path.basename(resource));
  if (!existsSync(from)) return null;
  mkdirSync(config.lessonStorageDir, { recursive: true });
  const name = path.basename(resource);
  moveFile(from, path.join(config.lessonStorageDir, name));
  return `${PREFIX}${name}`;
}
