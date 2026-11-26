// Wspólny parser odpowiedzi AI (używany przez serwer i przeglądarkę).
// Format odpowiedzi modelu:
//   tekst dla użytkownika
//   <file path="index.html">...pełna zawartość...</file>
//   <delete path="stary.js" />

function stripFence(content) {
  const m = content.match(/^\s*```[\w-]*\n([\s\S]*?)\n?```\s*$/);
  return m ? m[1] + '\n' : content;
}

export function parseResponse(text) {
  const files = [];
  const deletes = [];
  let chat = '';
  const open = /<file\s+path="([^"]+)"\s*>\n?/g;
  let pos = 0;
  while (true) {
    open.lastIndex = pos;
    const m = open.exec(text);
    chat += text.slice(pos, m ? m.index : text.length);
    if (!m) break;
    const start = m.index + m[0].length;
    const end = text.indexOf('</file>', start);
    if (end === -1) {
      files.push({ path: m[1], content: text.slice(start), complete: false });
      pos = text.length;
      break;
    }
    files.push({ path: m[1], content: stripFence(text.slice(start, end)), complete: true });
    pos = end + '</file>'.length;
  }
  chat = chat.replace(/<delete\s+path="([^"]+)"\s*\/?>/g, (_, p) => {
    deletes.push(p);
    return '';
  });
  // ukryj niedokończony tag na końcu strumienia
  chat = chat.replace(/<[a-z]*(\s[^<>]*)?$/i, '');
  chat = chat.replace(/\n{3,}/g, '\n\n').trim();
  return { chat, files, deletes };
}
