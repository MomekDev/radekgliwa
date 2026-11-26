// Generowanie stron przez AI – zadania działające w tle, niezależnie od połączenia przeglądarki.
import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { parseResponse, applyHunks } from '../public/parser.js';
import { mockResponse } from './mock.js';
import * as D from './db.js';
import { safePath, shortName } from './util.js';

export const MODEL = process.env.MODEL || 'claude-opus-5-5';
export const EFFORT = process.env.EFFORT || 'medium';
export const DEMO = process.env.DEMO === '1' || !process.env.ANTHROPIC_API_KEY;
const client = DEMO ? null : new Anthropic();

export const SYSTEM_PROMPT = `Jesteś ekspertem od tworzenia stron i aplikacji internetowych wbudowanym w kreator „Kreator” (podobny do Lovable / Base44).
Użytkownik opisuje, co chce zbudować, a Ty to budujesz i poprawiasz w kolejnych wiadomościach. Użytkownik zwykle nie jest programistą.

TECHNOLOGIA
- Czysty HTML, CSS i JavaScript, bez kroku budowania (bez npm, JSX, TypeScriptu, importów z node_modules).
- Plik startowy to zawsze index.html. Możesz tworzyć więcej plików (style.css, app.js, podstrony .html) i łączyć je ścieżkami względnymi.
- Biblioteki tylko z CDN, np. Tailwind (<script src="https://cdn.tailwindcss.com"></script>), Google Fonts, Lucide, Alpine.js, Chart.js.
- Zdjęcia: https://picsum.photos/seed/<słowo>/<szer>/<wys>, pliki użytkownika z folderu assets/ (lista niżej) albo SVG / gradienty.
- Twórz kompletne, dopracowane wizualnie, responsywne (mobile-first) strony z realistyczną treścią po polsku (lub w języku użytkownika) – nigdy „lorem ipsum”. Wszystkie przyciski, menu, formularze i interakcje mają naprawdę działać.

WBUDOWANY BACKEND (baza danych i logowanie) – obiekt window.app (alias: window.kreator) jest dostępny automatycznie na każdej stronie, nie dołączaj żadnego skryptu.
NIGDY nie twórz własnej zmiennej globalnej o nazwie „app” (np. const app = document.getElementById('app')) – przesłoni backend. Używaj innych nazw (np. root, appEl).
Używaj go zawsze, gdy aplikacja ma zapisywać dane (formularze, listy, rezerwacje, komentarze, konta) zamiast localStorage.
  // baza danych – kolekcje tworzą się same
  const todos = app.db.collection('todos');
  await todos.create({ title: 'Kupić mleko', done: false });   // -> rekord {id, ...dane, created_at, updated_at, owner_id}
  await todos.list({ where: { done: false }, sort: '-created_at', limit: 50, mine: true }); // mine: tylko rekordy zalogowanego
  await todos.get(id); await todos.update(id, { done: true }); await todos.remove(id);
  // logowanie użytkowników aplikacji
  await app.auth.signUp({ email, password, name }); await app.auth.signIn({ email, password }); await app.auth.signOut();
  app.auth.user();            // aktualny użytkownik {id, email, name} lub null (synchronicznie)
  app.auth.onChange(user => { ... });  // wywoływane od razu i przy każdej zmianie
- UPRAWNIENIA: każdą kolekcję opisz w pliku database.rules.json (zawsze go twórz/aktualizuj, gdy używasz bazy), np.:
  { "kontakt": { "read": "private", "write": "public" },
    "zadania": { "read": "owner", "write": "auth" },
    "posty":   { "read": "public", "write": "auth" },
    "notatki": { "read": "public", "write": "public", "edit": "public" } }
  read: public (każdy czyta) | auth (tylko zalogowani) | owner (każdy widzi tylko swoje rekordy) | private (nikt przez stronę – tylko właściciel w panelu kreatora)
  write: public (każdy może dodać) | auth (tylko zalogowani) | none
  edit: owner (domyślnie: rekord zalogowanego zmienia tylko on, rekordy anonimowe są tylko do odczytu) | public (każdy może zmieniać i usuwać rekordy anonimowe – np. prosta lista bez logowania)
  Dane osobowe z formularzy (kontakt, zgłoszenia, rezerwacje, zamówienia) ZAWSZE jako "read": "private" – strona tylko je zapisuje i nie wyświetla.
  Domyślnie (bez wpisu) kolekcja ma read: public, write: public, edit: owner. Odmowa dostępu rzuca Error – obsłuż to w interfejsie.
- Wszystkie metody są asynchroniczne i rzucają Error z polskim komunikatem – obsłuż błędy (try/catch) i pokaż je użytkownikowi.
- Hasło musi mieć min. 6 znaków. Daty created_at/updated_at to liczby (ms).

FORMAT ODPOWIEDZI (ściśle przestrzegaj)
1. Najpierw 1–3 zdania, co robisz.
2. Nowy plik albo plik przepisywany w całości:
<file path="index.html">
...pełna zawartość pliku...
</file>
3. Drobne zmiany w istniejącym pliku – zamiast przepisywać cały plik, użyj edycji (może być kilka bloków SEARCH/REPLACE w jednym <edit>):
<edit path="index.html">
<<<<<<< SEARCH
dokładnie skopiowany fragment obecnego pliku (kilka linii, unikalny)
=======
nowy fragment
>>>>>>> REPLACE
</edit>
   Fragment SEARCH musi być dosłowną kopią z aktualnego pliku. Przy dużych zmianach (ponad ~40% pliku) użyj <file>.
4. Usunięcie pliku: <delete path="nazwa.js" />
5. W PIERWSZEJ odpowiedzi w projekcie (gdy projekt jest pusty) dodaj krótką nazwę projektu (2–4 słowa): <project-name>Kawiarnia Pod Lipą</project-name>
6. Na końcu krótkie podsumowanie zmian (lista punktów), a potem 2–3 propozycje kolejnych kroków, każda w osobnym znaczniku:
<suggestion>Dodaj formularz kontaktowy</suggestion>
Zasady: nie używaj bloków \`\`\` wokół plików. Nie zostawiaj „...reszta bez zmian” w <file>. Jeśli użytkownik tylko o coś pyta, odpowiedz bez zmian w plikach.
Gdy użytkownik zgłasza błędy z konsoli, znajdź przyczynę i napraw ją.
Odpowiadaj w języku, w którym pisze użytkownik.`;

const CHAT_MODE_NOTE = `TRYB ROZMOWY: użytkownik chce teraz tylko porozmawiać / zaplanować. NIE twórz ani nie zmieniaj plików (żadnych <file>, <edit>, <delete>). Odpowiedz, doradź, zaproponuj plan. Na końcu możesz dodać <suggestion> z konkretnymi poleceniami do zbudowania.`;

// ---------- kontekst dla modelu ----------
function filesDump(files, assets) {
  const names = Object.keys(files);
  let out = names.length
    ? 'AKTUALNE PLIKI PROJEKTU:\n\n' + names.map((n) => `<file path="${n}">\n${files[n]}\n</file>`).join('\n\n')
    : 'Projekt jest pusty – nie ma jeszcze żadnych plików.';
  if (assets.length) {
    out += '\n\nPLIKI WGRANE PRZEZ UŻYTKOWNIKA (binarne, użyj ich ścieżek w kodzie):\n' + assets.map((a) => `- ${a.name} (${a.mime}, ${Math.round(a.size / 1024)} KB)`).join('\n');
  }
  return out;
}

export function summarizeAssistant(raw) {
  const { chat, blocks, deletes } = parseResponse(raw);
  const parts = [chat || '(brak opisu)'];
  const changed = [...new Set(blocks.map((b) => b.path))];
  if (changed.length) parts.push(`[Zmienione pliki: ${changed.join(', ')}]`);
  if (deletes.length) parts.push(`[Usunięte pliki: ${deletes.join(', ')}]`);
  return parts.join('\n');
}

function userPromptText(req) {
  let t = req.message;
  if (req.selection) {
    t += `\n\n[Użytkownik zaznaczył na stronie ${req.selection.page || 'index.html'} element – zmiana dotyczy właśnie jego]\nSelektor: ${req.selection.selector}\nHTML elementu:\n${req.selection.html}`;
  }
  if (req.errors?.length) {
    t += `\n\n[Błędy z konsoli przeglądarki]\n${req.errors.map((e) => '- ' + e).join('\n')}`;
  }
  return t;
}

function buildMessages(project, history, req) {
  const msgs = [];
  for (const m of history.slice(-20)) {
    if (m.meta?.status === 'running') continue;
    const content = m.role === 'assistant' ? summarizeAssistant(m.content) : m.content;
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + content;
    else msgs.push({ role: m.role, content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.push({ role: 'assistant', content: '(brak odpowiedzi)' });

  const content = [];
  for (const img of req.images || []) content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  content.push({
    type: 'text',
    text: `${project.instructions ? `INSTRUKCJE PROJEKTU (stałe wytyczne właściciela – zawsze ich przestrzegaj):\n${project.instructions}\n\n` : ''}${filesDump(project.files, D.listAssets(project.id))}\n\n---\n${req.mode === 'chat' ? CHAT_MODE_NOTE + '\n\n' : ''}WIADOMOŚĆ UŻYTKOWNIKA:\n${userPromptText(req)}`,
  });
  msgs.push({ role: 'user', content });
  return msgs;
}

// ---------- wywołanie modelu (lub trybu demo) ----------
function callModel(messages, signal, onText, project, req, repair) {
  if (DEMO) {
    return (async () => {
      const text = repair ? mockRepair(repair) : mockResponse(project, req);
      for (let i = 0; i < text.length; i += 40) {
        if (signal.aborted) throw Object.assign(new Error('aborted'), { aborted: true });
        await new Promise((r) => setTimeout(r, 25));
        onText(text.slice(i, i + 40));
      }
      return { stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } };
    })();
  }
  return (async () => {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: EFFORT },
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages,
      },
      { signal }
    );
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') onText(ev.delta.text);
    }
    return stream.finalMessage();
  })();
}

function mockRepair(failedPaths) {
  return `\n\n(Tryb demo) Poprawiam pliki, których edycja się nie udała: ${failedPaths.join(', ')}.`;
}

// ---------- zastosowanie zmian ----------
export function applyResponse(files, raw) {
  const parsed = parseResponse(raw);
  const next = Object.assign(Object.create(null), files);
  const changed = new Set();
  const failed = [];
  for (const b of parsed.blocks) {
    const fp = safePath(b.path);
    if (!fp || !b.complete) continue;
    if (b.kind === 'file') {
      next[fp] = b.content;
      changed.add(fp);
    } else {
      if (!Object.hasOwn(next, fp)) {
        failed.push({ path: fp, reason: 'plik nie istnieje' });
        continue;
      }
      const r = applyHunks(next[fp], b.hunks);
      if (r.content !== next[fp]) changed.add(fp);
      next[fp] = r.content;
      if (r.failed.length || !b.hunks.length) failed.push({ path: fp, hunks: r.failed, reason: b.hunks.length ? 'fragment SEARCH nie pasuje' : 'brak bloków SEARCH/REPLACE' });
    }
  }
  for (const d of parsed.deletes) {
    const fp = safePath(d);
    if (fp && Object.hasOwn(next, fp)) {
      delete next[fp];
      changed.add(fp);
    }
  }
  return { files: { ...next }, changed: [...changed], failed, parsed };
}

// ---------- zadania ----------
const jobs = new Map(); // projectId -> job

export function getJob(projectId) {
  return jobs.get(projectId) || null;
}

export function stopJob(projectId) {
  const j = jobs.get(projectId);
  if (!j) return false;
  j.controller.abort();
  return true;
}

export function startJob(project, userId, req) {
  if (jobs.has(project.id)) throw Object.assign(new Error('Ten projekt już się generuje'), { status: 409 });
  const job = new EventEmitter();
  job.setMaxListeners(50);
  job.projectId = project.id;
  job.text = '';
  job.controller = new AbortController();
  jobs.set(project.id, job);

  const history = D.getMessages(project.id);
  D.addMessage(project.id, 'user', req.message, {
    images: (req.images || []).length,
    mode: req.mode,
    selection: req.selection ? { selector: req.selection.selector } : undefined,
    errors: req.errors?.length || undefined,
  });
  job.messageId = D.addMessage(project.id, 'assistant', '', { status: 'running' });
  D.touchProject(project.id);

  const onText = (t) => {
    job.text += t;
    job.emit('delta', t);
  };

  let lastSave = Date.now();
  job.on('delta', () => {
    if (Date.now() - lastSave > 3000) {
      lastSave = Date.now();
      D.updateMessage(job.messageId, job.text, { status: 'running' });
    }
  });

  (async () => {
    const meta = {};
    let usage = { input: 0, output: 0 };
    const addUsage = (msg) => {
      const u = msg?.usage || {};
      usage.input += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      usage.output += u.output_tokens || 0;
    };
    let files = project.files;
    let changed = [];
    try {
      const messages = buildMessages(project, history, req);
      const msg = await callModel(messages, job.controller.signal, onText, project, req);
      addUsage(msg);
      if (msg.stop_reason === 'refusal') meta.note = 'Model odmówił wykonania tej prośby. Spróbuj ją sformułować inaczej.';
      else if (msg.stop_reason === 'max_tokens') meta.note = 'Odpowiedź została ucięta (limit długości) – zapisano tylko kompletne pliki. Napisz „kontynuuj”.';

      if (req.mode !== 'chat') {
        let r = applyResponse(files, job.text);
        files = r.files;
        changed = r.changed;
        // automatyczna naprawa nieudanych edycji – jedna dodatkowa runda
        if (r.failed.length && !job.controller.signal.aborted) {
          const paths = [...new Set(r.failed.map((f) => f.path))];
          const before = job.text;
          onText(`\n\n_(Poprawiam edycje, które się nie zastosowały: ${paths.join(', ')})_\n\n`);
          const repairMsgs = [
            ...messages,
            { role: 'assistant', content: before },
            {
              role: 'user',
              content: `Część edycji się nie zastosowała (${r.failed.map((f) => `${f.path}: ${f.reason}`).join('; ')}). Aktualny stan plików po udanych zmianach:\n\n${paths
                .filter((p) => Object.hasOwn(files, p))
                .map((p) => `<file path="${p}">\n${files[p]}\n</file>`)
                .join('\n\n')}\n\nPodaj PEŁNĄ poprawioną zawartość tych plików w blokach <file> (bez <edit>), uwzględniając zamierzone zmiany. Bez dodatkowych wyjaśnień poza jednym zdaniem.`,
            },
          ];
          const startLen = job.text.length;
          const m2 = await callModel(repairMsgs, job.controller.signal, onText, project, req, paths);
          addUsage(m2);
          const r2 = applyResponse(files, job.text.slice(startLen));
          files = r2.files;
          changed = [...new Set([...changed, ...r2.changed])];
          const stillBad = paths.filter((p) => !r2.changed.includes(p));
          if (r2.failed.length || stillBad.length) meta.note = `Nie udało się zastosować części zmian w: ${(stillBad.length ? stillBad : paths).join(', ')}. Opisz zmianę jeszcze raz.`;
        }
      }
    } catch (err) {
      const aborted = err?.aborted || job.controller.signal.aborted || err instanceof Anthropic.APIUserAbortError;
      meta.note = aborted ? 'Generowanie zatrzymane.' : `Błąd AI: ${friendlyError(err)}`;
      if (!aborted) console.error('[AI]', err);
      // przy przerwaniu zachowaj kompletne pliki, które już powstały
      if (req.mode !== 'chat' && job.text) {
        try {
          const r = applyResponse(project.files, job.text);
          files = r.files;
          changed = r.changed;
        } catch (e) {
          console.error('[AI] applyResponse', e);
        }
      }
    }

    try {
      if (changed.length) {
        meta.versionId = D.saveFiles(project.id, files, req.message.split('\n')[0]);
        meta.changed = changed;
      }
      const parsed = parseResponse(job.text);
      if (parsed.suggestions.length) meta.suggestions = parsed.suggestions.slice(0, 4);
      meta.usage = usage;
      D.updateMessage(job.messageId, job.text, meta);
      if (usage.input || usage.output) {
        D.run('INSERT INTO usage (user_id, project_id, input_tokens, output_tokens, ts) VALUES (?, ?, ?, ?, ?)', userId, project.id, usage.input, usage.output, Date.now());
      }
      // pierwsza wiadomość nadaje nazwę projektowi
      const p = D.getProject(project.id);
      if (p && p.name === 'Nowy projekt') {
        const proposed = job.text.match(/<project-name>([^<]{2,80})<\/project-name>/)?.[1].trim();
        D.run('UPDATE projects SET name = ? WHERE id = ?', proposed ? shortName(proposed, 60) : shortName(req.message), project.id);
      }
      D.touchProject(project.id);
    } catch (e) {
      console.error('[AI] zapis wyniku', e);
      meta.note = meta.note || 'Nie udało się zapisać wyniku generowania.';
      try {
        D.updateMessage(job.messageId, job.text, { note: meta.note });
      } catch {}
    } finally {
      jobs.delete(project.id);
      try {
        job.emit('done', { changed, note: meta.note || null });
      } catch (e) {
        console.error('[AI] done listener', e);
      }
    }
  })().catch((e) => {
    console.error('[AI] nieoczekiwany błąd zadania', e);
    jobs.delete(project.id);
  });

  return job;
}

function friendlyError(err) {
  const s = err?.status;
  if (s === 401) return 'nieprawidłowy klucz API (ANTHROPIC_API_KEY).';
  if (s === 429) return 'przekroczono limit zapytań – spróbuj za chwilę.';
  if (s === 529 || s === 503) return 'serwery AI są przeciążone – spróbuj za chwilę.';
  if (s === 400) return `nieprawidłowe zapytanie (${err?.error?.error?.message || err.message}).`;
  return err?.message || String(err);
}
