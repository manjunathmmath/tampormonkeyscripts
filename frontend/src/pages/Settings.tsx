import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, BASE } from '../api';
import { setDayOverride, setMcxDayOverride } from '../lib/format';
import { useRefresh } from '../lib/refresh';
import { SETTINGS_CHANGED, type SettingWarning } from '../components/SettingsWarnPill';

type Value = string | number | boolean;

interface FieldView {
  key: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'select' | 'date' | 'secret';
  default: Value;
  help?: string;
  usedBy: string;
  min?: number;
  max?: number;
  value: Value | null;
  set?: boolean;
  choices?: string[];
  changed: boolean;
}
interface GroupView {
  id: string;
  title: string;
  note?: string;
  fields: FieldView[];
}
interface SystemLite {
  kite: { configured: boolean; token: string };
}

/** The Market Trend Settings of the userscript, kept on the backend: edit, press Save, and the engines use the new values on their next read. */
export function Settings() {
  const [groups, setGroups] = useState<GroupView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Value>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sys, setSys] = useState<SystemLite | null>(null);
  const [warnings, setWarnings] = useState<SettingWarning[]>([]);
  const [find, setFind] = useState('');
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 760px)');
    const f = (): void => setNarrow(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  const { refresh } = useRefresh();

  const load = useCallback(async () => {
    try {
      const r = await api<{ groups: GroupView[]; warnings: SettingWarning[] }>('/settings');
      setGroups(r.groups);
      setWarnings(r.warnings);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
    api<SystemLite>('/system').then(setSys).catch(() => undefined);
  }, [load]);

  const needle = find.trim().toLowerCase();
  const shown = useMemo(
    () => (groups ?? []).map((g) => ({ ...g, fields: needle ? g.fields.filter((f) => `${f.label} ${f.key} ${f.help ?? ''}`.toLowerCase().includes(needle)) : g.fields })).filter((g) => !needle || g.fields.length > 0),
    [groups, needle],
  );
  const badge = (g: GroupView): number => g.fields.filter((f) => f.key in draft || warnings.some((w) => w.key === f.key && w.level !== 'info')).length;
  const all = useMemo(() => (groups ?? []).flatMap((g) => g.fields), [groups]);
  const dirty = Object.keys(draft);
  const set = (f: FieldView, v: Value): void => {
    setMsg(null);
    setErrors((e) => {
      const n = { ...e };
      delete n[f.key];
      return n;
    });
    setDraft((d) => {
      const n = { ...d };
      const same = f.type !== 'secret' && String(v) === String(f.value ?? '');
      if (same) delete n[f.key];
      else n[f.key] = v;
      return n;
    });
  };

  const apply = async (path: string, init: { method: string; body: unknown }): Promise<{ groups: GroupView[]; saved?: string[]; warnings?: SettingWarning[] } | null> => {
    setBusy(true);
    try {
      return await api<{ groups: GroupView[]; saved?: string[]; warnings?: SettingWarning[] }>(path, init);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) return null;
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ groups: GroupView[]; saved: string[]; warnings: SettingWarning[] }>('/settings', { method: 'PATCH', body: { values: draft } });
      setGroups(r.groups);
      setWarnings(r.warnings);
      window.dispatchEvent(new Event(SETTINGS_CHANGED));
      setDraft({});
      setErrors({});
      const val = (k: string): string | null => {
        const v = r.groups.flatMap((g) => g.fields).find((f) => f.key === k)?.value;
        return typeof v === 'string' && v ? v : null;
      };
      setDayOverride(val('current_day_date'));
      setMcxDayOverride(val('mcx_current_day_date'));
      setMsg(r.saved.length ? `Saved ${r.saved.length} setting${r.saved.length === 1 ? '' : 's'}. The screens use them on their next read.` : 'Nothing changed.');
      if (r.saved.length) void refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const body = e.body as { errors?: Record<string, string> } | undefined;
        setErrors(body?.errors ?? {});
        setErr('Some values are not valid; nothing was saved.');
      } else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resetOne = async (f: FieldView): Promise<void> => {
    const r = await apply('/settings/reset', { method: 'POST', body: { keys: [f.key] } });
    if (r) {
      setGroups(r.groups);
      if (r.warnings) setWarnings(r.warnings);
      window.dispatchEvent(new Event(SETTINGS_CHANGED));
      setDraft((d) => {
        const n = { ...d };
        delete n[f.key];
        return n;
      });
      if (f.key === 'current_day_date') setDayOverride(null);
      if (f.key === 'mcx_current_day_date') setMcxDayOverride(null);
      void refresh();
    }
  };

  const input = (f: FieldView) => {
    const cur = f.key in draft ? draft[f.key]! : (f.value ?? '');
    const bad = errors[f.key];
    if (f.type === 'checkbox') return <input type="checkbox" checked={cur === true} onChange={(e) => set(f, e.target.checked)} />;
    if (f.type === 'select')
      return (
        <select value={String(cur)} onChange={(e) => set(f, e.target.value)} aria-invalid={!!bad}>
          <option value="">Nearest expiry (auto)</option>
          {(f.choices ?? []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          {String(cur) && !(f.choices ?? []).includes(String(cur)) && <option value={String(cur)}>{String(cur)} (not listed)</option>}
        </select>
      );
    if (f.type === 'secret') return <input type="password" autoComplete="off" placeholder={f.set ? 'saved (type to replace)' : 'not set'} value={key(draft, f.key)} onChange={(e) => set(f, e.target.value)} aria-invalid={!!bad} />;
    return (
      <input
        type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
        step={f.type === 'number' ? 'any' : undefined}
        min={f.min}
        max={f.max}
        value={String(cur)}
        placeholder={f.key === 'OVX' || f.key === 'GVZ' || f.key === 'VXSLV' || f.key === 'VIX' ? 'automatic' : undefined}
        onChange={(e) => set(f, e.target.value)}
        aria-invalid={!!bad}
      />
    );
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Market Trend Settings, kept on the backend. Blank expiry and volatility fields mean automatic.</p>
        </div>
        <div className="head-actions">
          <input className="set-search" type="search" placeholder="Find a setting" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find a setting" />
        </div>
      </header>
      {err && <p className="banner err" role="alert">{err}</p>}
      {warnings.filter((w) => w.level !== 'info').length > 0 && (
        <p className="banner" role="status">
          {warnings.filter((w) => w.level !== 'info').length} setting{warnings.filter((w) => w.level !== 'info').length === 1 ? '' : 's'} to check: see the messages under the fields marked below.
        </p>
      )}
      {msg && <p className="banner ok" role="status">{msg}</p>}
      {!groups && !err && <p className="muted">Loading the settings…</p>}
      {groups && !needle && (
        <nav className="set-nav" aria-label="Setting groups">
          {groups.map((g) => (
            <button key={g.id} onClick={() => { setOpened((o) => ({ ...o, [g.id]: true })); window.setTimeout(() => document.getElementById(`sg-${g.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); }}>
              {g.title}
              {badge(g) > 0 && <b className="set-badge">{badge(g)}</b>}
            </button>
          ))}
        </nav>
      )}
      {needle && shown.length === 0 && <p className="muted">No setting matches "{find}".</p>}
      {shown.map((g) => (
        <section key={g.id} id={`sg-${g.id}`} className="card settings-group" aria-label={g.title}>
          <button className="card-head set-head" onClick={() => setOpened((o) => ({ ...o, [g.id]: !(o[g.id] || badge(g) > 0 || !narrow) }))} aria-expanded={!narrow || !!needle || !!opened[g.id] || badge(g) > 0}>
            <h2>{g.title}</h2>
            {narrow && <span className="chev" aria-hidden="true">{opened[g.id] || badge(g) > 0 ? '▾' : '▸'}</span>}
          </button>
          <div className={narrow && !needle && !opened[g.id] && badge(g) === 0 ? 'set-body collapsed' : 'set-body'}>
          {g.id === 'auth' && (
            <ul className="srlist">
              <li>
                <b>Kite API key and secret</b>
                <span>{sys ? (sys.kite.configured ? 'set in the backend .env' : 'NOT set in the backend .env') : '…'}</span>
              </li>
              <li>
                <b>Kite access token</b>
                <span>
                  {sys ? sys.kite.token : '…'} · <a href={`${BASE}/auth/kite/start`} target="_blank" rel="noreferrer">Log in to Kite</a>
                </span>
              </li>
            </ul>
          )}
          {g.note && <p className="small-note">{g.note}</p>}
          {g.fields.length === 0 && <p className="muted">Nothing to set here: no commodity futures were found in the instrument list.</p>}
          <div className="settings-fields">
            {g.fields.map((f) => (
              <div key={f.key} className={`field ${errors[f.key] ? 'bad' : ''}`}>
                <label className={f.type === 'checkbox' ? 'field-check' : ''}>
                  {f.type === 'checkbox' && input(f)}
                  <span className="field-label">{f.label}</span>
                  {f.type !== 'checkbox' && input(f)}
                </label>
                <div className="field-meta">
                  <span className="muted">{f.usedBy === 'saved' ? 'saved; the screen that uses it is not built yet' : `used by: ${f.usedBy}`}</span>
                  {(f.changed || f.key in draft) && f.type !== 'secret' && (
                    <button className="link-btn" onClick={() => void resetOne(f)} title={`Back to the default (${String(f.default) || 'automatic'})`}>reset</button>
                  )}
                </div>
                {f.help && <p className="small-note">{f.help}</p>}
                {warnings.filter((w) => w.key === f.key).map((w, i) => (
                  <p key={i} className={`small-note ${w.level === 'error' ? 'warn-note bad-note' : w.level === 'warn' ? 'warn-note' : 'info-note'}`} role={w.level === 'info' ? undefined : 'alert'}>
                    {w.level === 'info' ? 'ⓘ ' : '⚠ '}
                    {w.text}
                  </p>
                ))}
                {errors[f.key] && <p className="small-note warn-note" role="alert">{errors[f.key]}</p>}
              </div>
            ))}
          </div>
          </div>
        </section>
      ))}
      {dirty.length > 0 && createPortal(
        <div className="save-bar" role="region" aria-label="Unsaved changes">
          <span>{dirty.length} unsaved change{dirty.length === 1 ? '' : 's'}</span>
          <button className="btn" disabled={busy} onClick={() => { setDraft({}); setErrors({}); setMsg(null); }}>Discard</button>
          <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      , document.body)}
      {all.length > 0 && <p className="small-note">Changes are saved in the backend data folder (settings.json). A change drops the cached reads, so the next refresh recomputes with it.</p>}
    </div>
  );
}

const key = (d: Record<string, Value>, k: string): string => (k in d ? String(d[k]) : '');
