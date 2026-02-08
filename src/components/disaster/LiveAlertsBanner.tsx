import { AlertTriangle, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

const API_BASE = '/api';

type AlertItem = {
  id: string;
  alertText: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  date: string;
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/15 border-red-500/30 text-red-600',
  high: 'bg-disaster-amber/10 border-disaster-amber/20 text-disaster-amber',
  medium: 'bg-amber-500/10 border-amber-500/20 text-amber-600',
  low: 'bg-slate-500/10 border-slate-500/20 text-slate-500',
};

const SEVERITY_ICON_STYLES: Record<string, string> = {
  critical: 'text-red-500 animate-pulse',
  high: 'text-disaster-amber',
  medium: 'text-amber-500',
  low: 'text-slate-500',
};

export function LiveAlertsBanner() {
  const [visible, setVisible] = useState(true);
  const [index, setIndex] = useState(0);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(`${API_BASE}/alerts`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const items: AlertItem[] = (data.alerts || []).map((a: AlertItem) => ({
        id: a.id,
        alertText: a.alertText,
        severity: a.severity,
        category: a.category,
        date: a.date,
      }));
      setAlerts(items);
      setIndex(0);
    } catch {
      setError(true);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    // Refresh alerts every 2 minutes
    const interval = setInterval(fetchAlerts, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Auto-rotate through alerts every 6 seconds
  useEffect(() => {
    if (alerts.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % alerts.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [alerts.length]);

  if (!visible) return null;
  if (loading) {
    return (
      <div className="bg-disaster-amber/10 border-b border-disaster-amber/20 px-4 py-2 text-sm flex items-center gap-2">
        <Loader2 className="h-4 w-4 text-disaster-amber animate-spin" />
        <span className="text-muted-foreground">Loading live alerts…</span>
      </div>
    );
  }
  if (error || alerts.length === 0) return null;

  const current = alerts[index];
  const severity = current?.severity || 'medium';
  const styles = SEVERITY_STYLES[severity] || SEVERITY_STYLES.medium;
  const iconStyle = SEVERITY_ICON_STYLES[severity] || SEVERITY_ICON_STYLES.medium;

  return (
    <div className={`${styles} border-b px-4 py-2 text-sm flex items-center justify-between gap-3`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <AlertTriangle className={`h-4 w-4 shrink-0 ${iconStyle}`} />
        <span className="font-medium truncate">{current.alertText}</span>
        {alerts.length > 1 && (
          <>
            <span className="text-xs opacity-60 shrink-0">
              {index + 1}/{alerts.length}
            </span>
            <button
              onClick={() => setIndex((i) => (i + 1) % alerts.length)}
              className="text-muted-foreground hover:text-foreground text-xs underline shrink-0"
            >
              Next
            </button>
          </>
        )}
      </div>
      <button onClick={() => setVisible(false)} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
