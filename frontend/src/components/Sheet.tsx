import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Bottom sheet on a phone, side panel on a wide screen (the layout is in CSS). Esc or the backdrop closes it. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true">
      <div className="sheet-backdrop" onClick={onClose} />
      <aside className="sheet">
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </aside>
    </div>
  );
}
