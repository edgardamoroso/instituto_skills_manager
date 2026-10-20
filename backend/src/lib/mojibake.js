// Conserta nomes de arquivo gravados antes do upload em UTF-8: o multer lia o
// nome como latin1, então "Aula 01 – Vídeo.pdf" virava "Aula 01 â\u0080\u0093 VÃ­deo.pdf".
// Só reinterpreta quando o resultado é UTF-8 válido e diferente — um nome correto
// com acento ("Vídeo") não é UTF-8 válido lido como latin1, então fica intacto.
export function fixMojibake(value) {
  const text = String(value ?? '');
  if (!/[\u0080-ÿ]/.test(text) || /[^\u0000-ÿ]/.test(text)) return text;
  const decoded = Buffer.from(text, 'latin1').toString('utf8');
  return decoded.includes('�') ? text : decoded;
}
