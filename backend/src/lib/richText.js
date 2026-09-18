import sanitizeHtml from 'sanitize-html';

// Sanitiza a descrição de curso vinda do editor rico (Quill) do admin/autor.
// Só permite os formatos que o toolbar do editor de fato oferece (negrito,
// itálico, sublinhado, listas e alinhamento) — qualquer outra tag/atributo
// (script, iframe, onerror, etc.) é descartado antes de chegar ao banco.
//
// Alinhamento é sempre por CLASSE (ql-align-*), nunca por atributo style:
// o CSP do site bloqueia style="" (style-src sem unsafe-inline), então um
// text-align inline nunca seria aplicado no navegador de qualquer forma.
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li'];
const ALIGN_CLASSES = ['ql-align-left', 'ql-align-center', 'ql-align-right', 'ql-align-justify'];

export function sanitizeDescriptionHtml(value) {
  const raw = value == null ? '' : String(value);
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { p: ['class'], li: ['class'] },
    allowedClasses: { p: ALIGN_CLASSES, li: ALIGN_CLASSES },
    disallowedTagsMode: 'discard',
  }).trim();
}
