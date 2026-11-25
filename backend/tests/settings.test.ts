import { describe, it, expect } from 'vitest';
import { SettingsService } from '../src/settings/settings.js';
import type { KeyValueStore } from '../src/store/fileStore.js';

const mem = (): KeyValueStore => {
  const m = new Map<string, unknown>();
  return { get: <T>(k: string) => m.get(k) as T | undefined, set: (k, v) => void m.set(k, JSON.parse(JSON.stringify(v))), delete: (k) => void m.delete(k) };
};
const mk = (store = mem()) =>
  new SettingsService({
    store,
    commodities: () => ['GOLDM', 'CRUDEOILM'],
    choicesFor: (k) => (k === 'nifty_expiry_date' ? ['2026-11-24', '2026-12-01'] : k.startsWith('mcx_') ? ['2026-11-27', '2026-12-04'] : null),
  });

describe('SettingsService', () => {
  it('starts at the userscript defaults', () => {
    const s = mk();
    expect(s.get('margin')).toBe(100000);
    expect(s.get('risk_pct_per_trade')).toBe(1);
    expect(s.get('level_room_mult')).toBe(1.5);
    expect(s.bool('use_ltp_for_strike')).toBe(true);
    expect(s.bool('include_lagging')).toBe(true);
    expect(s.get('hedge_diff_nifty')).toBe(500);
    expect(s.get('vol_extreme_ovx')).toBe(35);
    expect(s.num('OVX')).toBeNull(); // blank = automatic
  });

  it('saves valid changes, keeps only what differs from the default and survives a reload', () => {
    const store = mem();
    const s = mk(store);
    const r = s.update({ margin: '250000', level_room_mult: 2, include_lagging: false, OVX: '41.5', nifty_expiry_date: '2026-12-01' });
    expect(r).toMatchObject({ ok: true, errors: {} });
    expect(r.saved.sort()).toEqual(['OVX', 'include_lagging', 'level_room_mult', 'margin', 'nifty_expiry_date']);
    const again = mk(store);
    expect(again.get('margin')).toBe(250000);
    expect(again.bool('include_lagging')).toBe(false);
    expect(again.num('OVX')).toBe(41.5);
    expect(again.expiry('nifty_expiry_date')).toBe('2026-12-01');
    // back to a default removes it from the file
    again.update({ margin: 100000 });
    expect((store.get('settings') as Record<string, unknown>)['margin']).toBeUndefined();
  });

  it('rejects bad values and saves nothing when any is bad', () => {
    const s = mk();
    const r = s.update({ margin: 'abc', level_room_mult: 0, current_day_date: '20-11-2026', nifty_expiry_date: '2030-01-01', nope: 1, include_lagging: 'yes' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['current_day_date', 'include_lagging', 'level_room_mult', 'margin', 'nifty_expiry_date', 'nope']);
    expect(s.get('margin')).toBe(100000);
    expect(s.update({ margin: 5, risk_pct_per_trade: 150 }).errors['risk_pct_per_trade']).toContain('at most 100');
  });

  it('a stale expiry that is no longer listed reads as automatic', () => {
    const store = mem();
    store.set('settings', { nifty_expiry_date: '2026-10-27' });
    expect(mk(store).expiry('nifty_expiry_date')).toBeUndefined();
  });

  it('never sends a secret back, only whether it is set', () => {
    const s = mk();
    s.update({ telegram_bot_token: '123:ABC', telegram_chat_id: '42' });
    const f = s.view().flatMap((g) => g.fields).find((x) => x.key === 'telegram_bot_token')!;
    expect(f.value).toBeNull();
    expect(f.set).toBe(true);
    expect(JSON.stringify(s.view())).not.toContain('123:ABC');
    expect(s.get('telegram_bot_token')).toBe('123:ABC'); // the backend itself can still use it
  });

  it('builds the commodity expiry fields and the dynamic choices; tells listeners what changed; reset', () => {
    const s = mk();
    const view = s.view();
    expect(view.map((g) => g.id)).toEqual(['auth', 'general', 'nse', 'hedge', 'mcxdays', 'vol', 'mcxfut', 'mcxopt']);
    expect(view.find((g) => g.id === 'mcxfut')!.fields.map((f) => f.key)).toEqual(['mcx_expiry_goldm', 'mcx_expiry_crudeoilm']);
    expect(view.find((g) => g.id === 'nse')!.fields[0]!.choices).toEqual(['2026-11-24', '2026-12-01']);
    const seen: string[] = [];
    s.onChange((k, v) => seen.push(`${k}=${String(v)}`));
    s.update({ live_feed_auto: false, margin: 100000 });
    expect(seen).toEqual(['live_feed_auto=false']); // an unchanged value is not reported
    expect(s.reset(['live_feed_auto', 'margin'])).toEqual(['live_feed_auto']);
    expect(s.bool('live_feed_auto')).toBe(true);
  });

  it('NSE and MCX have their own current and previous day; a previous day needs its current day and must be earlier', () => {
    const s = mk();
    expect(s.update({ current_day_date: '2026-11-20', previous_day_date: '2026-11-19', mcx_current_day_date: '2026-11-21', mcx_previous_day_date: '2026-11-20' })).toMatchObject({ ok: true });
    expect(s.get('mcx_current_day_date')).toBe('2026-11-21');
    expect(s.update({ previous_day_date: '2026-11-20' }).errors['previous_day_date']).toContain('earlier');
    expect(s.update({ mcx_previous_day_date: '2026-11-22' }).errors['mcx_previous_day_date']).toContain('earlier');
    const fresh = mk();
    expect(fresh.update({ mcx_previous_day_date: '2026-11-19' }).errors['mcx_previous_day_date']).toContain('current day');
    expect(fresh.update({ current_day_date: '' , previous_day_date: '' })).toMatchObject({ ok: true });
  });
});
