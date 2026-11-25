type Req = { name: string; day: string; asOf?: string };

export interface Mark {
  name: string;
  /** LONG, SHORT, WAIT or NO TRADE: the Trade Focus call */
  call: string;
  /** HIGH, MEDIUM, LOW or null */
  conf: string | null;
  dir: number;
  headline: string;
}

export interface MarksDeps {
  focus: { load(r: Req): Promise<{ v: { call: string; conf: string | null; dir: number; headline: string } }> };
  now?: () => number;
}

/** The Trade Focus call of many names at once, for the marks on the Chart View board. Each name is read on its own and cached for the 5-minute slot; a failing name is left out. */
export class MarksService {
  private cache = new Map<string, { slot: number; v: Mark }>();
  constructor(private readonly d: MarksDeps) {}

  invalidate(): void {
    this.cache.clear();
  }

  async load(names: string[], req: { day: string; asOf?: string }): Promise<Mark[]> {
    const slot = req.asOf ? 0 : Math.floor(((this.d.now ?? Date.now)()) / 300000);
    const list = [...new Set(names)].slice(0, 12);
    const out: (Mark | null)[] = new Array(list.length).fill(null);
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, list.length) }, async () => {
        while (i < list.length) {
          const k = i++;
          const name = list[k]!;
          const key = `${name}|${req.day}|${req.asOf ?? ''}`;
          const hit = this.cache.get(key);
          if (hit && hit.slot === slot) {
            out[k] = hit.v;
            continue;
          }
          try {
            const f = await this.d.focus.load({ ...req, name });
            const v: Mark = { name, call: f.v.call, conf: f.v.conf, dir: f.v.dir, headline: f.v.headline };
            this.cache.set(key, { slot, v });
            out[k] = v;
          } catch {
            out[k] = null;
          }
        }
      }),
    );
    return out.filter((x): x is Mark => x !== null);
  }
}
