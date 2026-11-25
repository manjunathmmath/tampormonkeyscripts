import type { KeyValueStore } from '../store/fileStore.js';
import { buildGroups, type Field, type Group } from './schema.js';
import { checkSettings, type Warning } from './warnings.js';

export type SettingValue = string | number | boolean;

export interface FieldView extends Omit<Field, 'secret'> {
  /** the saved value; a secret is never sent, only whether it is set */
  value: SettingValue | null;
  set?: boolean;
  choices?: string[];
  /** true when the value differs from the default */
  changed: boolean;
}

export interface GroupView extends Omit<Group, 'fields'> {
  fields: FieldView[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SettingsDeps {
  store: KeyValueStore;
  /** the commodities that get expiry fields */
  commodities: () => string[];
  /** the listed expiries (ISO dates, soonest first) a select field may take; null = no list known */
  choicesFor: (key: string) => string[] | null;
  /** NSE holidays, for the date checks */
  holidays?: () => ReadonlySet<string>;
  now?: () => number;
}

/**
 * The saved settings: defaults from the schema, your changes on top, kept in one file. Engines read the current value through `get`, so a change
 * applies on the next read (the live feed switch applies at once through `onChange`).
 */
export class SettingsService {
  private readonly listeners: ((key: string, v: SettingValue) => void)[] = [];
  constructor(private readonly d: SettingsDeps) {}

  private groups(): Group[] {
    return buildGroups(this.d.commodities());
  }

  private fields(): Field[] {
    return this.groups().flatMap((g) => g.fields);
  }

  private saved(): Record<string, SettingValue> {
    return this.d.store.get<Record<string, SettingValue>>('settings') ?? {};
  }

  /** the value of a setting: your saved value, else the default; '' when a blank means automatic */
  get<T extends SettingValue = SettingValue>(key: string): T {
    const f = this.fields().find((x) => x.key === key);
    const s = this.saved();
    return (key in s ? s[key] : f?.default ?? '') as T;
  }

  /** a number setting; null when blank or not a number (so "automatic" reads as null) */
  num(key: string): number | null {
    const v = this.get(key);
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) && String(v).trim() !== '' ? n : null;
  }

  bool(key: string): boolean {
    return this.get(key) === true;
  }

  /** an expiry setting that must be a listed expiry; anything else reads as blank (the nearest) */
  expiry(key: string): string | undefined {
    const v = String(this.get(key) || '');
    if (!v) return undefined;
    const list = this.d.choicesFor(key);
    return list && !list.includes(v) ? undefined : v;
  }

  onChange(cb: (key: string, v: SettingValue) => void): void {
    this.listeners.push(cb);
  }

  /** things that look wrong in the current values: dates in the future or on a weekend / holiday, a day left on from earlier, stale expiries, typo-sized numbers */
  warnings(): Warning[] {
    const expiryKeys = this.fields().map((f) => f.key).filter((k) => k.startsWith('mcx_expiry_') || k.startsWith('mcx_opt_expiry_'));
    return checkSettings({ value: (k) => this.get(k), now: (this.d.now ?? Date.now)(), holidays: this.d.holidays?.() ?? new Set(), choices: (k) => this.d.choicesFor(k), expiryKeys });
  }

  view(): GroupView[] {
    const s = this.saved();
    return this.groups().map((g) => ({
      ...g,
      fields: g.fields.map((f): FieldView => {
        const { secret, ...rest } = f;
        const cur = f.key in s ? s[f.key]! : f.default;
        const choices = f.dynamicChoices ? this.d.choicesFor(f.key) ?? [] : undefined;
        return { ...rest, value: secret ? null : cur, ...(secret ? { set: String(cur) !== '' } : {}), ...(choices ? { choices } : {}), changed: f.key in s && s[f.key] !== f.default };
      }),
    }));
  }

  /** validates one value against its field; returns the cleaned value or an error text */
  private check(f: Field, raw: unknown): { ok: true; v: SettingValue } | { ok: false; error: string } {
    if (f.type === 'checkbox') return typeof raw === 'boolean' ? { ok: true, v: raw } : { ok: false, error: 'must be on or off' };
    if (f.type === 'number') {
      if (raw === '' || raw === null) return f.default === '' ? { ok: true, v: '' } : { ok: false, error: 'a number is required' };
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!Number.isFinite(n)) return { ok: false, error: 'must be a number' };
      if (f.min !== undefined && n < f.min) return { ok: false, error: `must be at least ${f.min}` };
      if (f.max !== undefined && n > f.max) return { ok: false, error: `must be at most ${f.max}` };
      return { ok: true, v: n };
    }
    const s = String(raw ?? '').trim();
    if (f.type === 'date') return s === '' || DATE_RE.test(s) ? { ok: true, v: s } : { ok: false, error: 'use the form YYYY-MM-DD' };
    if (f.type === 'select') {
      const list = this.d.choicesFor(f.key);
      if (s !== '' && list && !list.includes(s)) return { ok: false, error: 'not a listed expiry' };
      return { ok: true, v: s };
    }
    if (s.length > 200) return { ok: false, error: 'too long' };
    return { ok: true, v: s };
  }

  /** saves the valid fields and reports the invalid ones (nothing is saved when any value is invalid) */
  update(patch: Record<string, unknown>): { ok: boolean; errors: Record<string, string>; saved: string[] } {
    const fields = this.fields();
    const errors: Record<string, string> = {};
    const clean: Record<string, SettingValue> = {};
    for (const [k, raw] of Object.entries(patch)) {
      const f = fields.find((x) => x.key === k);
      if (!f) {
        errors[k] = 'unknown setting';
        continue;
      }
      const r = this.check(f, raw);
      if (r.ok) clean[k] = r.v;
      else errors[k] = r.error;
    }
    // a previous day needs its current day and must be earlier than it (for each market)
    const eff = (k: string): string => String(k in clean ? clean[k] : this.get(k) ?? '');
    for (const [cur, prev] of [['current_day_date', 'previous_day_date'], ['mcx_current_day_date', 'mcx_previous_day_date']] as const) {
      if (!(prev in clean) && !(cur in clean)) continue;
      const c = eff(cur);
      const p = eff(prev);
      if (p && !c) errors[prev] = 'set the current day as well: the previous day is used for that day';
      else if (p && c && p >= c) errors[prev] = 'must be earlier than the current day';
    }
    if (Object.keys(errors).length) return { ok: false, errors, saved: [] };
    const cur = { ...this.saved() };
    const changed: string[] = [];
    for (const [k, v] of Object.entries(clean)) {
      const before = this.get(k);
      const f = fields.find((x) => x.key === k)!;
      if (v === f.default) delete cur[k];
      else cur[k] = v;
      if (before !== v) changed.push(k);
    }
    this.d.store.set('settings', cur);
    for (const k of changed) for (const cb of this.listeners) cb(k, this.get(k));
    return { ok: true, errors: {}, saved: changed };
  }

  reset(keys: string[]): string[] {
    const cur = { ...this.saved() };
    const done: string[] = [];
    for (const k of keys) {
      if (k in cur) {
        delete cur[k];
        done.push(k);
      }
    }
    this.d.store.set('settings', cur);
    for (const k of done) for (const cb of this.listeners) cb(k, this.get(k));
    return done;
  }
}
