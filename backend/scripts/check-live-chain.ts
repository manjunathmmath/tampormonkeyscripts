/**
 * Live-day check of the option chain's tick-built candles (read-only; places no orders).
 *
 * The running backend (npm run start) seeds each option contract from Kite history once on a live day and then builds its 5-minute candles
 * from ticker ticks (LiveMarket). This script compares, for ATM +-N strikes (CE and PE), the tick-built series (GET /live/candles) with the
 * same contract's 5-minute candles with OI read fresh from the Kite historical API, candle by candle, and then rebuilds the chain-level
 * results (OI score, PCR, max pain) from each source.
 *
 *   npx tsx scripts/check-live-chain.ts [name=NIFTY 50] [strikesEachSide=2]
 * Needs the backend running on 127.0.0.1:4000, a valid Kite token, and /oi or /chain called at least once for the name today.
 */
import { loadConfig } from '../src/config/index.js';
import { FileStore } from '../src/store/fileStore.js';
import { KiteTokenStore } from '../src/auth/kiteAuth.js';
import { KiteClient, type Candle } from '../src/kite/client.js';
import { buildChain, type ChainRow, type FetchedStrike, type StrikeEntry } from '../src/engine/optionChain.js';
import { computeMaxPainGEX, computeOIScore, oiPriceChange, type OiRow } from '../src/engine/oi.js';
import { dayOf } from '../src/marketdata/candles.js';

const NAME = process.argv[2] ?? 'NIFTY 50';
const EACH = Number(process.argv[3] ?? 2);
const BASE = 'http://127.0.0.1:4000';

const cfg = loadConfig();
const auth = { Authorization: `Bearer ${cfg.APP_SECRET}` };
const api = async <T>(path: string): Promise<T> => {
  const r = await fetch(BASE + path, { headers: auth });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
};

const tokens = new KiteTokenStore(new FileStore(cfg.DATA_DIR));
const kite = new KiteClient({ apiKey: cfg.KITE_API_KEY, getAccessToken: () => tokens.validToken() });

interface ChainResp {
  day: string;
  prevDay: string;
  expiry: string;
  atmStrike: number;
  chain: { tableData: ChainRow[]; spotCandles: Candle[] };
}

const FIELDS = ['open', 'high', 'low', 'close', 'volume', 'oi'] as const;
const startMs = (c: Candle): number => Date.parse(String(c[0]).replace('+0530', '+05:30'));

interface Diff { field: string; contract: string; time: string; live: number; hist: number; d: number }

async function main(): Promise<void> {
  const day = dayOf(Date.now());
  const now = Date.now();
  const doneBefore = now - 5 * 60000 - 60000; // a candle counts as complete (and final at Kite) a minute after its slot ends

  const ch = await api<ChainResp>(`/chain?name=${encodeURIComponent(NAME)}&day=${day}`);
  const oi = await api<{ oiScore: number; pcr: string; changePct: number | null; maxPain: { maxPainK: number } | null }>(`/oi?name=${encodeURIComponent(NAME)}&day=${day}`);
  const rows = ch.chain.tableData;
  const strikes = rows.map((r) => Number(r.STRIKE)).sort((a, b) => a - b);
  const ai = strikes.indexOf(Number(ch.atmStrike));
  const near = new Set(strikes.slice(Math.max(0, ai - EACH), ai + EACH + 1));
  console.log(`${NAME} ${day}  expiry ${ch.expiry}  ATM ${ch.atmStrike}  chain strikes ${strikes.join(', ')}  comparing ${[...near].join(', ')}`);

  const histOf = new Map<number, Candle[]>();
  const liveOf = new Map<number, Candle[]>();
  for (const r of rows) {
    for (const side of ['CE', 'PE'] as const) {
      const c = r[side];
      if (!c) continue;
      histOf.set(c.token, await kite.historical(c.token, '5minute', ch.prevDay, day, true));
      try {
        liveOf.set(c.token, (await api<{ candles: Candle[] }>(`/live/candles?token=${c.token}`)).candles);
      } catch (e) {
        console.log(`  ${c.symbol}: no live series (${(e as Error).message.slice(0, 80)})`);
      }
    }
  }

  // ── candle by candle ──
  let compared = 0;
  let exact = 0;
  const fieldExact: Record<string, number> = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  const worst: Record<string, Diff | undefined> = {};
  const extraLive: string[] = [];
  const missingLive: string[] = [];
  const perContract: string[] = [];
  for (const r of rows) {
    if (!near.has(Number(r.STRIKE))) continue;
    for (const side of ['CE', 'PE'] as const) {
      const c = r[side];
      if (!c) continue;
      const live = (liveOf.get(c.token) ?? []).filter((k) => String(k[0]).startsWith(day));
      const hist = (histOf.get(c.token) ?? []).filter((k) => String(k[0]).startsWith(day));
      const hMap = new Map(hist.map((k) => [String(k[0]).slice(0, 16), k]));
      const lMap = new Map(live.map((k) => [String(k[0]).slice(0, 16), k]));
      let n = 0;
      let ex = 0;
      for (const l of live) {
        if (startMs(l) > doneBefore) continue;
        const h = hMap.get(String(l[0]).slice(0, 16));
        if (!h) {
          extraLive.push(`${c.symbol} ${String(l[0]).slice(11, 16)} vol ${l[5]}`);
          continue;
        }
        n++;
        let all = true;
        FIELDS.forEach((f, i) => {
          const lv = Number(l[i + 1] ?? 0);
          const hv = Number(h[i + 1] ?? 0);
          if (lv === hv) fieldExact[f]!++;
          else {
            all = false;
            const d = Math.abs(lv - hv);
            if (!worst[f] || d > worst[f]!.d) worst[f] = { field: f, contract: c.symbol, time: String(l[0]).slice(11, 16), live: lv, hist: hv, d };
          }
        });
        if (all) ex++;
      }
      for (const h of hist) if (startMs(h) <= doneBefore && !lMap.has(String(h[0]).slice(0, 16))) missingLive.push(`${c.symbol} ${String(h[0]).slice(11, 16)}`);
      compared += n;
      exact += ex;
      perContract.push(`  ${c.symbol.padEnd(24)} live ${String(live.length).padStart(3)}  hist ${String(hist.length).padStart(3)}  compared ${String(n).padStart(3)}  exact ${ex}`);
    }
  }
  console.log('\nPer contract (today, complete candles only):');
  console.log(perContract.join('\n'));
  console.log(`\nCandles compared: ${compared}, exact on all six fields: ${exact}`);
  for (const f of FIELDS) {
    const w = worst[f];
    console.log(`  ${f.padEnd(6)} exact ${fieldExact[f]}/${compared}` + (w ? `   largest diff ${w.d} (${w.contract} ${w.time}: live ${w.live} vs history ${w.hist})` : ''));
  }
  console.log(`Live candles history does not have: ${extraLive.length}${extraLive.length ? '  ' + extraLive.slice(0, 10).join('; ') : ''}`);
  console.log(`History candles missing from live: ${missingLive.length}${missingLive.length ? '  ' + missingLive.slice(0, 10).join('; ') : ''}`);

  // ── chain level: same spot, previous-day and strikes, only the intraday option candles differ ──
  const strikeData: StrikeEntry[] = rows.map((r) => ({ STRIKE: Number(r.STRIKE), ATM_STRIKE: r.ATM_STRIKE }));
  const build = (src: Map<number, Candle[]>) => {
    const fetched: Record<string, FetchedStrike> = {};
    for (const r of rows) {
      if (!r.CE || !r.PE) continue;
      fetched[String(r.STRIKE)] = { prevDataCE: r.prevDataCE, prevDataPE: r.prevDataPE, currDataCE: src.get(r.CE.token) ?? [], currDataPE: src.get(r.PE.token) ?? [], CE: r.CE, PE: r.PE };
    }
    const chain = buildChain({ strikeData, fetched, spotCandles: ch.chain.spotCandles, expiryDDMMYYYY: r0Expiry(rows), day, asOf: null, intervalStr: '5minute', nowMs: now });
    const t = chain.tableData as unknown as OiRow[];
    const pc = oiPriceChange(oi.changePct, ch.chain.spotCandles);
    return { score: computeOIScore(t, pc).score, pcr: chain.pcr, chPcr: chain.chPcr, maxPain: computeMaxPainGEX(t)?.maxPainK ?? null };
  };
  const L = build(liveOf);
  const H = build(histOf);
  console.log('\nChain level        live(ticks)   history     backend /oi');
  console.log(`  OI score         ${String(L.score).padEnd(13)} ${String(H.score).padEnd(11)} ${oi.oiScore}`);
  console.log(`  PCR              ${String(L.pcr).padEnd(13)} ${String(H.pcr).padEnd(11)} ${oi.pcr}`);
  console.log(`  change PCR       ${String(L.chPcr).padEnd(13)} ${String(H.chPcr)}`);
  console.log(`  max pain         ${String(L.maxPain).padEnd(13)} ${String(H.maxPain).padEnd(11)} ${oi.maxPain?.maxPainK ?? '-'}`);
  console.log(`  agree: score ${L.score === H.score}, PCR ${L.pcr === H.pcr}, max pain ${L.maxPain === H.maxPain}`);
}

const r0Expiry = (rows: ChainRow[]): string | null => rows.find((r) => r.CE)?.CE?.expiry ?? null;

main().catch((e) => {
  console.error('check failed:', (e as Error).message);
  process.exit(1);
});
