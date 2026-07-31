// Accent/case-insensitive comparison, e.g. so "acao" matches "Ação".
// Built from character codes (rather than a \uXXXX regex literal) to avoid
// any ambiguity between an escape sequence and a literal combining mark.
const DIACRITICS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

export function normalize(str) {
  return (str || '').normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}
