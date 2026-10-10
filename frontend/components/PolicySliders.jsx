import { POLICY_LABELS, POLICY_ICONS } from '@/types';
import {
  TrendingUp,
  Leaf,
  HeartPulse,
  GraduationCap,
  Scale,
  ShieldCheck,
  Circle,
} from 'lucide-react';

const POLICY_ICON_MAP = {
  TrendingUp,
  Leaf,
  HeartPulse,
  GraduationCap,
  Scale,
  ShieldCheck,
};

export function PolicySliders({ stance, onChange, disabled }) {
  return (
    <div className="space-y-4">
      {Object.keys(POLICY_LABELS).map(key => {
        const IconComp = POLICY_ICON_MAP[POLICY_ICONS[key]] || Circle;
        const value = stance[key] ?? 0.5;
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <IconComp className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-700">{POLICY_LABELS[key]}</span>
              </div>
              <span className="font-mono text-xs font-bold text-blue-700 tabular-nums">{value.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={value}
              disabled={disabled}
              onChange={e => onChange(key, parseFloat(e.target.value))}
              className="w-full accent-blue-600 bg-slate-200 rounded-lg cursor-pointer h-2"
            />
          </div>
        );
      })}
    </div>
  );
}

export function createEmptyStance() {
  return {
    economy: 0.5,
    environment: 0.5,
    healthcare: 0.5,
    education: 0.5,
    civilRights: 0.5,
    security: 0.5,
  };
}
