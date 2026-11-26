// Własne domeny dla opublikowanych stron (jak w Lovable / Base44).
// Weryfikacja: rekord TXT _kreator.<domena> = kreator-verify=<token> (dowód własności)
// oraz rekord A (DOMAIN_IP) lub CNAME (DOMAIN_CNAME_TARGET) wskazujący na serwer.
import dns from 'dns/promises';
import { domainToASCII } from 'url';
import * as D from './db.js';

D.db.exec(`CREATE TABLE IF NOT EXISTS domains (
  domain TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  verified_at INTEGER,
  last_check_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
)`);
D.db.exec('CREATE INDEX IF NOT EXISTS domains_project ON domains(project_id)');

const resolver = new dns.Resolver({ timeout: 4000, tries: 2 });
if (process.env.DNS_SERVERS) resolver.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));
else resolver.setServers(['1.1.1.1', '8.8.8.8']);

export function normalizeDomain(input) {
  let d = String(input || '').trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  d = domainToASCII(d);
  if (!d || d.length > 253) return null;
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) && !/^([a-z0-9-]+\.)+xn--[a-z0-9-]+$/.test(d)) return null;
  return d;
}

// konfiguracja docelowa DNS
export function dnsTargets() {
  const cname = process.env.DOMAIN_CNAME_TARGET || (process.env.SITES_HOST || '').split(':')[0] || null;
  const ip = process.env.DOMAIN_IP || null;
  return { cname, ip };
}

export function instructionsFor(domain, token) {
  const { cname, ip } = dnsTargets();
  const labels = domain.split('.');
  // domena główna (example.pl, sklep.com.pl) – CNAME nie jest tam dozwolony, potrzebny rekord A
  const SECOND = ['com', 'net', 'org', 'co', 'gov', 'edu', 'info', 'biz', 'waw', 'krakow', 'gda', 'wroc', 'poznan', 'lodz'];
  const isApex = labels.length === 2 || (labels.length === 3 && SECOND.includes(labels[1]));
  const records = [{ type: 'TXT', name: `_kreator.${domain}`, value: `kreator-verify=${token}`, purpose: 'potwierdzenie, że domena należy do Ciebie' }];
  if (isApex || !cname) {
    if (ip) records.push({ type: 'A', name: domain, value: ip, purpose: 'kieruje domenę na serwer' });
  } else {
    records.push({ type: 'CNAME', name: domain, value: cname, purpose: 'kieruje domenę na serwer' });
  }
  if (isApex && ip) records.push({ type: 'A', name: `www.${domain}`, value: ip, purpose: 'opcjonalnie: wersja z www (dodaj ją też jako osobną domenę)' });
  return records;
}

export function domainView(row) {
  return {
    domain: row.domain,
    verified: !!row.verified_at,
    verifiedAt: row.verified_at,
    lastCheckAt: row.last_check_at,
    lastError: row.last_error,
    records: instructionsFor(row.domain, row.token),
  };
}

async function safe(fn) {
  try {
    return await fn();
  } catch {
    return [];
  }
}

// sprawdza DNS; zwraca { ok, problems: [] }
export async function checkDomain(row) {
  if (process.env.DOMAIN_VERIFY === 'off') return { ok: true, problems: [] }; // tylko do testów lokalnych
  const problems = [];
  const txt = (await safe(() => resolver.resolveTxt(`_kreator.${row.domain}`))).map((parts) => parts.join(''));
  if (!txt.includes(`kreator-verify=${row.token}`)) problems.push(`Brak rekordu TXT _kreator.${row.domain} z wartością kreator-verify=${row.token}`);
  const { cname, ip } = dnsTargets();
  if (cname || ip) {
    const cnames = (await safe(() => resolver.resolveCname(row.domain))).map((c) => c.replace(/\.$/, '').toLowerCase());
    const ips = await safe(() => resolver.resolve4(row.domain));
    let routed = (cname && cnames.includes(cname)) || (ip && ips.includes(ip));
    // CNAME prowadzi przez inną nazwę (np. CDN) – sprawdź, czy kończy się na naszym IP
    if (!routed && ip && cnames.length) routed = (await safe(() => resolver.resolve4(cnames[0]))).includes(ip);
    if (!routed) {
      const want = [ip && `A → ${ip}`, cname && `CNAME → ${cname}`].filter(Boolean).join(' lub ');
      problems.push(`Domena nie wskazuje jeszcze na serwer (oczekiwano ${want}${ips.length ? `, jest A → ${ips.join(', ')}` : cnames.length ? `, jest CNAME → ${cnames.join(', ')}` : ''})`);
    }
  }
  return { ok: !problems.length, problems };
}

// projekt dla zweryfikowanej domeny (do serwowania strony)
const cache = new Map();
export function projectForHost(host) {
  const h = String(host || '').toLowerCase();
  const hit = cache.get(h);
  if (hit && Date.now() - hit.t < 10_000) return hit.pid;
  const row = D.one('SELECT project_id FROM domains WHERE domain = ? AND verified_at IS NOT NULL', h);
  const pid = row ? row.project_id : null;
  cache.set(h, { pid, t: Date.now() });
  if (cache.size > 5000) cache.clear();
  return pid;
}
export function invalidateDomainCache() {
  cache.clear();
}
