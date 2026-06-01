"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface LogEntry {
  _id: string;
  type: 'cron' | 'scrape' | 'product' | 'system';
  status: 'started' | 'success' | 'error' | 'info';
  details: Record<string, unknown>;
  timestamp: string;
}

const TYPE_LABELS: Record<string, string> = {
  cron: '⏰ Cron',
  scrape: '🔍 Fiyat Çekme',
  product: '📦 Ürün',
  system: '⚙️ Sistem',
};

const STATUS_STYLES: Record<string, string> = {
  started: 'bg-yellow-500/15 border-yellow-400/40 text-yellow-200',
  success: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200',
  error: 'bg-red-500/15 border-red-400/40 text-red-200',
  info: 'bg-blue-500/15 border-blue-400/40 text-blue-200',
};

const TYPE_FILTERS = ['all', 'cron', 'scrape', 'product'] as const;

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function DetailBlock({ details }: { details: Record<string, unknown> }) {
  const keys = Object.keys(details).filter(
    (k) => k !== 'results' && details[k] !== undefined && details[k] !== null && details[k] !== ''
  );
  if (!keys.length) return null;
  return (
    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 text-xs">
      {keys.map((k) => (
        <div
          key={k}
          className="flex items-baseline gap-1 bg-white/5 rounded px-2 py-1 overflow-hidden"
        >
          <span className="text-white/40 shrink-0">{k}:</span>
          <span className="text-white/80 truncate">
            {typeof details[k] === 'number' && k.includes('Ms')
              ? `${details[k]}ms`
              : String(details[k])}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = useCallback(async (type?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (type && type !== 'all') params.set('type', type);
      params.set('limit', '100');
      const res = await fetch(`/api/logs?${params.toString()}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      setError('Loglar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(filter);
  }, [filter, fetchLogs]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchLogs(filter), 10000);
    return () => clearInterval(id);
  }, [autoRefresh, filter, fetchLogs]);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            📋 Sistem Logları
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Cron, fiyat çekme ve ürün işlemlerinin kaydı
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Ana Sayfa
          </Link>
          <button
            onClick={() => fetchLogs(filter)}
            className="glass px-3 py-1.5 rounded-lg text-sm text-white/80 hover:text-white transition-all"
          >
            🔄 Yenile
          </button>
          <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-blue-500"
            />
            Otomatik (10s)
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === t
                ? 'bg-blue-500/20 border border-blue-400/40 text-blue-200 shadow-[0_0_12px_rgba(37,99,235,0.2)]'
                : 'glass text-white/60 hover:text-white/90'
            }`}
          >
            {t === 'all' ? '🌐 Tümü' : TYPE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {/* Content */}
      {error && (
        <div className="glass rounded-xl p-4 text-red-300 text-sm mb-4 border-red-400/30">
          {error}
        </div>
      )}

      {loading && !logs.length ? (
        <div className="glass rounded-xl p-12 text-center text-white/40">
          <div className="inline-block w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mb-3" />
          <p>Loglar yükleniyor...</p>
        </div>
      ) : !logs.length ? (
        <div className="glass rounded-xl p-12 text-center text-white/40">
          <p className="text-lg mb-1">📭</p>
          <p>Henüz log kaydı yok.</p>
          <p className="text-xs mt-1 text-white/25">
            Cron çalıştığında veya fiyat güncellemesi yapıldığında burada görünecek.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log._id}
              className="glass rounded-xl p-3 sm:p-4 transition-all hover:bg-white/[0.09]"
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {/* Type badge */}
                <span className="text-xs font-medium text-white/50 bg-white/5 px-2 py-0.5 rounded-full">
                  {TYPE_LABELS[log.type] || log.type}
                </span>

                {/* Status badge */}
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[log.status] || 'bg-white/5 border-white/10 text-white/60'}`}
                >
                  {log.status === 'started' && '▶ Başladı'}
                  {log.status === 'success' && '✓ Başarılı'}
                  {log.status === 'error' && '✗ Hata'}
                  {log.status === 'info' && 'ℹ Bilgi'}
                </span>

                {/* Timestamp */}
                <span className="text-xs text-white/30 ml-auto">
                  {formatTime(log.timestamp)}
                </span>
              </div>

              {/* Details */}
              {log.details && Object.keys(log.details).length > 0 && (
                <DetailBlock details={log.details} />
              )}

              {/* Scrape results summary */}
              {log.type === 'cron' && log.status === 'success' && log.details && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {(log.details.results as Array<Record<string, unknown>>)?.map(
                    (r: Record<string, unknown>, i: number) => (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded-full border ${
                          r.status === 'success'
                            ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300'
                            : 'bg-red-500/10 border-red-400/20 text-red-300'
                        }`}
                      >
                        {String(r.retailer)}: {r.status === 'success' ? `₺${r.price}` : String(r.reason)?.slice(0, 40)}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-white/20">
        {logs.length > 0 && `Son ${logs.length} kayıt gösteriliyor`}
      </div>
    </div>
  );
}
