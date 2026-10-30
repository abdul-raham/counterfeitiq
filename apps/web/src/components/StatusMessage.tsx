import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleHelp, OctagonAlert, type LucideIcon } from 'lucide-react';

export type Tone = 'ok' | 'warn' | 'risk' | 'neutral';

export const toneStyles: Record<Tone, { box: string; text: string; icon: LucideIcon }> = {
  ok: { box: 'border-ok-line bg-ok-soft', text: 'text-ok', icon: CircleCheck },
  warn: { box: 'border-warn-line bg-warn-soft', text: 'text-warn', icon: CircleAlert },
  risk: { box: 'border-risk-line bg-risk-soft', text: 'text-risk', icon: OctagonAlert },
  neutral: { box: 'border-line bg-surface', text: 'text-ink', icon: CircleHelp },
};

interface StatusMessageProps {
  tone: Tone;
  title: string;
  children?: ReactNode;
  role?: 'alert' | 'status';
}

export function StatusMessage({ tone, title, children, role }: StatusMessageProps) {
  const { box, text, icon: Icon } = toneStyles[tone];
  return (
    <div role={role} className={`flex gap-3 rounded-lg border p-4 ${box}`}>
      <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${text}`} />
      <div className="min-w-0">
        <p className={`font-medium ${text}`}>{title}</p>
        {children && <div className="mt-1 text-sm leading-relaxed text-ink">{children}</div>}
      </div>
    </div>
  );
}
