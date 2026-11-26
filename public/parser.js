// Wspólny parser odpowiedzi AI (serwer + przeglądarka).
// Format odpowiedzi modelu:
//   tekst dla użytkownika
//   <file path="index.html">...pełna zawartość...</file>
//   <edit path="index.html">
//   <<<<<<< SEARCH
//   stary fragment
//   =======
//   nowy fragment
//   >>>>>>> REPLACE
//   </edit>
//   <delete path="stary.js" />
//   <suggestion>Dodaj formularz kontaktowy</suggestion>

function stripFence(content) {
  const m = content.match(/^\s*```[\w-]*\n([\s\S]*?)\n?```\s*$/);
  return m ? m[1] + '\n' : content;
}

export function parseHunks(body) {
  const hunks = [];
  const re = /<<<<<<< SEARCH\n([\s\S]*?)\n?=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g;
  let m;
  while ((m = re.exec(body))) hunks.push({ search: m[1], replace: m[2] });
  return hunks;
}

export function parseResponse(text) {
  const blocks = []; // {kind:'file'|'edit', path, content, hunks, complete}
  const deletes = [];
  const suggestions = [];
  let chat = '';
  const open = /<(file|edit)\s+path="([^"]+)"\s*>\n?/g;
  let pos = 0;
  while (true) {
    open.lastIndex = pos;
    const m = open.exec(text);
    chat += text.slice(pos, m ? m.index : text.length);
    if (!m) break;
    const kind = m[1];
    const start = m.index + m[0].length;
    const closeTag = `</${kind}>`;
    // znacznik zamykający liczy się tylko na początku linii (np. "</file>" w stringu JS nie ucina pliku)
    const closeRe = new RegExp(`(^|\\n)</${kind}>`, 'g');
    closeRe.lastIndex = start;
    const cm = closeRe.exec(text);
    let end = text.startsWith(closeTag, start) ? start : cm ? cm.index + cm[1].length : -1;
    // zapas: znacznik zamykający w tej samej linii co kod (np. "}</file>")
    if (end === -1) end = text.indexOf(closeTag, start);
    const body = end === -1 ? text.slice(start) : text.slice(start, end);
    const complete = end !== -1;
    if (kind === 'file') blocks.push({ kind, path: m[2], content: complete ? stripFence(body) : body, complete });
    else blocks.push({ kind, path: m[2], hunks: parseHunks(body), complete, content: body });
    if (!complete) {
      pos = text.length;
      break;
    }
    pos = end + closeTag.length;
  }
  chat = chat.replace(/<delete\s+path="([^"]+)"\s*\/?>/g, (_, p) => {
    deletes.push(p);
    return '';
  });
  chat = chat.replace(/<project-name>[\s\S]*?(<\/project-name>|$)/g, '');
  chat = chat.replace(/<suggestion>[^<]*$/, '');
  chat = chat.replace(/<suggestion>([\s\S]*?)<\/suggestion>/g, (_, s) => {
    if (s.trim()) suggestions.push(s.trim());
    return '';
  });
  // ukryj niedokończony tag na końcu strumienia
  chat = chat.replace(/<\/?[a-z]*(\s[^<>]*)?$/i, '');
  chat = chat.replace(/\n{3,}/g, '\n\n').trim();
  return { chat, blocks, deletes, suggestions };
}

// Zastosuj edycje SEARCH/REPLACE. Zwraca nową treść i listę nieudanych fragmentów.
export function applyHunks(content, hunks) {
  const failed = [];
  for (const h of hunks) {
    if (!h.search.trim()) {
      failed.push(h);
      continue;
    }
    const idx = content.indexOf(h.search);
    if (idx !== -1) {
      // fragment musi być jednoznaczny – inaczej zmiana mogłaby trafić w złe miejsce
      if (content.indexOf(h.search, idx + 1) !== -1) {
        failed.push({ ...h, reason: 'niejednoznaczny' });
        continue;
      }
      content = content.slice(0, idx) + h.replace + content.slice(idx + h.search.length);
      continue;
    }
    // dopasowanie z pominięciem wcięć i białych znaków na końcach linii
    const lines = content.split('\n');
    const sLines = h.search.split('\n');
    while (sLines.length && !sLines[sLines.length - 1].trim()) sLines.pop();
    while (sLines.length && !sLines[0].trim()) sLines.shift();
    const matches = [];
    for (let i = 0; i + sLines.length <= lines.length && sLines.length; i++) {
      let ok = true;
      for (let j = 0; j < sLines.length; j++) {
        if (lines[i + j].trim() !== sLines[j].trim()) {
          ok = false;
          break;
        }
      }
      if (ok) matches.push(i);
    }
    if (matches.length !== 1) {
      failed.push(h);
      continue;
    }
    const found = matches[0];
    // przenieś różnicę wcięcia z dopasowanego miejsca na nowy fragment
    const indentOf = (l) => l.match(/^\s*/)[0];
    const fileIndent = indentOf(lines[found]);
    const searchIndent = indentOf(sLines[0]);
    const rLines = h.replace.split('\n').map((l) => {
      if (!l.trim()) return l;
      if (searchIndent && l.startsWith(searchIndent)) return fileIndent + l.slice(searchIndent.length);
      return searchIndent ? l : fileIndent + l;
    });
    lines.splice(found, sLines.length, ...rLines);
    content = lines.join('\n');
  }
  return { content, failed };
}
