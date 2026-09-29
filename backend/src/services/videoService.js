import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { str, optionalStr, oneOf } from '../lib/validate.js';

// Vídeos da página "Novidades". O vídeo fica hospedado no Google Drive (ou no
// YouTube); aqui guardamos só o provedor + o id do arquivo e montamos a URL do
// player incorporado. Nunca guardamos nem devolvemos a URL colada como veio.

const listPublishedStmt = db.prepare("SELECT * FROM videos WHERE status = 'publicado' ORDER BY created_at DESC, rowid DESC");
const listAllStmt = db.prepare('SELECT * FROM videos ORDER BY created_at DESC, rowid DESC');
const getStmt = db.prepare('SELECT * FROM videos WHERE id = ?');
const insertStmt = db.prepare(
  `INSERT INTO videos (id, title, description, provider, video_ref, status)
   VALUES (@id, @title, @description, @provider, @video_ref, @status)`,
);
const updateStmt = db.prepare(
  `UPDATE videos SET title = @title, description = @description, provider = @provider,
   video_ref = @video_ref, status = @status WHERE id = @id`,
);
const deleteStmt = db.prepare('DELETE FROM videos WHERE id = ?');

const DRIVE_ID = /^[A-Za-z0-9_-]{20,100}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// Extrai { provider, ref } de um link do Google Drive ou do YouTube.
// Aceita os formatos de "Compartilhar"/"Copiar link" dessas plataformas.
export function parseVideoLink(value) {
  const text = String(value || '').trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw badRequest('VIDEO_LINK_INVALID');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw badRequest('VIDEO_LINK_INVALID');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'drive.google.com' || host === 'docs.google.com') {
    // /file/d/<id>/view · /file/d/<id>/preview · /open?id=<id> · /uc?id=<id>
    const fromPath = /\/file\/d\/([^/?#]+)/.exec(url.pathname)?.[1];
    const ref = fromPath || url.searchParams.get('id');
    if (ref && DRIVE_ID.test(ref)) return { provider: 'drive', ref };
    throw badRequest('VIDEO_LINK_INVALID');
  }

  if (host === 'youtu.be') {
    const ref = url.pathname.slice(1).split('/')[0];
    if (YOUTUBE_ID.test(ref)) return { provider: 'youtube', ref };
    throw badRequest('VIDEO_LINK_INVALID');
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    // /watch?v=<id> · /embed/<id> · /shorts/<id> · /live/<id>
    const fromPath = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname)?.[1];
    const ref = fromPath || url.searchParams.get('v');
    if (ref && YOUTUBE_ID.test(ref)) return { provider: 'youtube', ref };
    throw badRequest('VIDEO_LINK_INVALID');
  }

  throw badRequest('VIDEO_LINK_UNSUPPORTED');
}

function embedUrl(provider, ref) {
  return provider === 'drive'
    ? `https://drive.google.com/file/d/${ref}/preview`
    : `https://www.youtube-nocookie.com/embed/${ref}`;
}

function watchUrl(provider, ref) {
  return provider === 'drive'
    ? `https://drive.google.com/file/d/${ref}/view`
    : `https://www.youtube.com/watch?v=${ref}`;
}

function toApi(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    provider: row.provider,
    embedUrl: embedUrl(row.provider, row.video_ref),
    watchUrl: watchUrl(row.provider, row.video_ref),
    status: row.status,
    createdAt: row.created_at,
  };
}

function normalize(input = {}, current = null) {
  const title = input.title === undefined && current
    ? current.title
    : str(input.title, { code: 'VIDEO_FIELDS_REQUIRED', min: 1, max: 160 });
  const description = input.description === undefined && current
    ? current.description
    : optionalStr(input.description, { max: 2000 });
  const link = input.link === undefined && current
    ? { provider: current.provider, ref: current.video_ref }
    : parseVideoLink(input.link);
  const status = input.status === undefined
    ? (current ? current.status : 'rascunho')
    : oneOf(input.status, ['rascunho', 'publicado'], { code: 'VIDEO_STATUS_INVALID' });
  return { title, description, provider: link.provider, video_ref: link.ref, status };
}

export function listPublishedVideos() {
  return listPublishedStmt.all().map(toApi);
}

export function listAllVideos() {
  return listAllStmt.all().map(toApi);
}

export function getVideo(id) {
  const row = getStmt.get(id);
  if (!row) throw notFound('VIDEO_NOT_FOUND');
  return toApi(row);
}

export function createVideo(input) {
  const id = crypto.randomUUID();
  insertStmt.run({ id, ...normalize(input) });
  return getVideo(id);
}

export function updateVideo(id, input = {}) {
  const current = getStmt.get(id);
  if (!current) throw notFound('VIDEO_NOT_FOUND');
  updateStmt.run({ id, ...normalize(input, current) });
  return getVideo(id);
}

export function deleteVideo(id) {
  if (!deleteStmt.run(id).changes) throw notFound('VIDEO_NOT_FOUND');
}
