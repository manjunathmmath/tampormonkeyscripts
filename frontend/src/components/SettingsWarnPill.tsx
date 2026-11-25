import { useEffect, useState } from 'react';
import { api } from '../api';
import { useRefresh } from '../lib/refresh';

export interface SettingWarning {
  key: string;
  level: 'error' | 'warn' | 'info';
  text: string;
}

export const SETTINGS_CHANGED = 'groot:settings-changed';

/** Top-bar badge: shows when a Setting looks wrong (a date in the future or on a holiday, a stale expiry, a typo-sized number). Click to open Settings. */
export function SettingsWarnPill() {
  const { tick } = useRefresh();
  const [list, setList] = useState<SettingWarning[]>([]);
  useEffect(() => {
    let live = true;
    const load = (): void => {
      api<{ warnings: SettingWarning[] }>('/settings/warnings')
        .then((r) => live && setList(r.warnings))
        .catch(() => undefined);
    };
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(SETTINGS_CHANGED, load);
    };
  }, [tick]);
  const bad = list.filter((w) => w.level !== 'info');
  if (!bad.length) return null;
  const errors = bad.filter((w) => w.level === 'error').length;
  return (
    <a href="#/settings" className={`pill ${errors ? 'bad' : 'warn'}`} title={bad.map((w) => w.text).join('\n')}>
      ⚠ {bad.length}<span className="wp-text"> setting{bad.length === 1 ? '' : 's'} to check</span>
    </a>
  );
}
