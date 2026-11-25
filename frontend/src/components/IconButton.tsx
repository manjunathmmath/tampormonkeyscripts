import type { MouseEventHandler } from 'react';
import { Icon } from './Icon';

/** A button that shows an icon and nothing else; the label is the tooltip and what a screen reader reads. */
export function IconButton({ icon, label, onClick, on = false, disabled = false, size = 18, tone }: { icon: string; label: string; onClick?: MouseEventHandler<HTMLButtonElement>; on?: boolean; disabled?: boolean; size?: number; tone?: 'up' | 'dn' }) {
  return (
    <button type="button" className={`icon-btn ibtn${on ? ' on' : ''}${tone ? ` ${tone}` : ''}`} title={label} aria-label={label} aria-pressed={on || undefined} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={size} />
    </button>
  );
}
