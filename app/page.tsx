"use client";

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const PriceChart = dynamic(() => import('../components/PriceChart'), { ssr: false });

const RETAILERS = ['Vatan Bilgisayar', 'MediaMarkt', 'Teknosa'] as const;
type Retailer = typeof RETAILERS[number];

const RETAILER_GLASS: Record<Retailer, { pill: string; label: string }> = {
  'Vatan Bilgisayar': { pill: 'bg-blue-500/15 border-blue-400/40 text-blue-200', label: 'text-blue-300' },
  'MediaMarkt':       { pill: 'bg-red-500/15 border-red-400/40 text-red-200',   label: 'text-red-300'  },
  'Teknosa':          { pill: 'bg-green-500/15 border-green-400/40 text-green-200', label: 'text-green-300' },
};

function urlKey(retailer: Retailer): 'vatanUrl' | 'mediamarktUrl' | 'teknosaUrl' {
  if (retailer === 'Vatan Bilgisayar') return 'vatanUrl';
  if (retailer === 'MediaMarkt') return 'mediamarktUrl';
  return 'teknosaUrl';
}

interface LatestPriceEntry {
  groupId: string;
  retailer: string;
  price: number;
  currency: string;
  timestamp: string;
}

interface ProductGroup {
  groupId: string;
  name: string;
  vatanUrl: string | null;
  mediamarktUrl: string | null;
  teknosaUrl: string | null;
  latestPrices: Record<Retailer, LatestPriceEntry | null>;
}

interface PriceEntry {
  groupId: string;
  retailer: string;
  price: number;
  currency: string;
  timestamp: string;
}

export default function Home() {
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ProductGroup | null>(null);
  const [prices, setPrices] = useState<PriceEntry[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [vatanUrl, setVatanUrl] = useState('');
  const [mediamarktUrl, setMediamarktUrl] = useState('');
  const [teknosaUrl, setTeknosaUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState<string | null>(null); // groupId being scraped
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<ProductGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) setGroups(data.groups);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleAddGroup = async () => {
    setError('');
    setSuccess('');
    if (!name.trim()) {
      setError('Ürün adı zorunludur.');
      return;
    }
    if (!vatanUrl && !mediamarktUrl && !teknosaUrl) {
      setError('En az bir mağaza URL\'si girilmelidir.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          vatanUrl: vatanUrl.trim() || null,
          mediamarktUrl: mediamarktUrl.trim() || null,
          teknosaUrl: teknosaUrl.trim() || null
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Immediately scrape each retailer separately
      setScraping(data.groupId);
      const newUrls = [
        { retailer: 'Vatan Bilgisayar', url: vatanUrl.trim() || null },
        { retailer: 'MediaMarkt', url: mediamarktUrl.trim() || null },
        { retailer: 'Teknosa', url: teknosaUrl.trim() || null },
      ].filter((r) => r.url);
      for (const { retailer } of newUrls) {
        await scrapeRetailer(data.groupId, retailer);
      }
      setScraping(null);

      setName('');
      setVatanUrl('');
      setMediamarktUrl('');
      setTeknosaUrl('');
      setSuccess('Ürün grubu eklendi ve fiyatlar güncellendi.');
      await fetchGroups();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
      setScraping(null);
    }
  };

  const scrapeRetailer = async (groupId: string, retailer: string) => {
    await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, retailer })
    });
  };

  const handleScrapeNow = async (group: ProductGroup) => {
    setScraping(group.groupId);
    setError('');
    try {
      // Fire one request per retailer sequentially — each stays within Vercel's 60s limit
      const retailers = [
        { retailer: 'Vatan Bilgisayar', url: group.vatanUrl },
        { retailer: 'MediaMarkt', url: group.mediamarktUrl },
        { retailer: 'Teknosa', url: group.teknosaUrl },
      ].filter((r) => r.url);

      for (const { retailer } of retailers) {
        await scrapeRetailer(group.groupId, retailer);
      }

      await fetchGroups();
      if (selectedGroup?.groupId === group.groupId) {
        await loadPrices(group.groupId);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Güncelleme başarısız.');
    } finally {
      setScraping(null);
    }
  };

  const handleDeleteGroup = async (group: ProductGroup) => {
    setDeleting(true);
    try {
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.groupId })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDeleteConfirm(null);
      if (selectedGroup?.groupId === group.groupId) {
        setSelectedGroup(null);
        setPrices([]);
      }
      await fetchGroups();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Silme başarısız.');
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const loadPrices = async (groupId: string) => {
    const res = await fetch(`/api/prices?groupId=${groupId}`);
    const data = await res.json();
    if (data.success) setPrices(data.prices);
  };

  const handleSelectGroup = async (group: ProductGroup) => {
    setSelectedGroup(group);
    setPrices([]);
    await loadPrices(group.groupId);
  };

  const cheapestRetailer = (group: ProductGroup): Retailer | null => {
    let min: number | null = null;
    let winner: Retailer | null = null;
    for (const retailer of RETAILERS) {
      const entry = group.latestPrices?.[retailer];
      if (entry && (min === null || entry.price < min)) {
        min = entry.price;
        winner = retailer;
      }
    }
    return winner;
  };

  const priceSavingPct = (group: ProductGroup): number | null => {
    const vals = RETAILERS.map((r) => group.latestPrices?.[r]?.price).filter((p): p is number => p != null);
    if (vals.length < 2) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max === 0) return null;
    return Math.round(((max - min) / max) * 100);
  };

  return (
    <div className="min-h-screen">
      {/* ─── Header ─────────────────────────────────────── */}
      <header className="glass border-b border-white/10 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3.5 max-w-6xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/40 text-lg shrink-0">
              🏷️
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-none">Fiyat Karşılaştırma</h1>
              <p className="text-[11px] text-white/40 mt-0.5">Her gün 12:00&apos;de otomatik güncellenir</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300">Vatan</span>
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-red-500/20 border border-red-400/30 text-red-300 hidden sm:inline-flex">MediaMarkt</span>
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/30 text-green-300 hidden sm:inline-flex">Teknosa</span>
            {groups.length > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white/60 ml-1">
                {groups.length} ürün
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-6xl space-y-5">

        {/* ─── Add group form ──────────────────────────────── */}
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm shadow-blue-600/40">+</span>
            Yeni Ürün Grubu Ekle
          </h2>
          <div className="grid grid-cols-1 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ürün adı — örn: Ecovacs Deebot T30C Omni"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/8 border border-white/15 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-blue-300 mb-1.5 block">Vatan Bilgisayar</label>
                <input
                  type="url"
                  value={vatanUrl}
                  onChange={(e) => setVatanUrl(e.target.value)}
                  placeholder="https://www.vatanbilgisayar.com/..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/8 border border-white/15 text-white placeholder:text-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-red-300 mb-1.5 block">MediaMarkt</label>
                <input
                  type="url"
                  value={mediamarktUrl}
                  onChange={(e) => setMediamarktUrl(e.target.value)}
                  placeholder="https://www.mediamarkt.com.tr/..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/8 border border-white/15 text-white placeholder:text-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-green-300 mb-1.5 block">Teknosa</label>
                <input
                  type="url"
                  value={teknosaUrl}
                  onChange={(e) => setTeknosaUrl(e.target.value)}
                  placeholder="https://www.teknosa.com/..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/8 border border-white/15 text-white placeholder:text-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleAddGroup}
                disabled={loading || scraping !== null}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 hover:-translate-y-px active:translate-y-0"
              >
                {loading ? 'Kaydediliyor...' : scraping ? '⏳ Fiyatlar çekiliyor...' : '+ Ekle ve Fiyatları Getir'}
              </button>
              {error && (
                <p className="text-red-400 text-sm flex items-center gap-1.5">
                  <span>⚠</span> {error}
                </p>
              )}
              {success && (
                <p className="text-emerald-400 text-sm flex items-center gap-1.5">
                  <span>✓</span> {success}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─── Product cards ───────────────────────────────── */}
        {groups.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {groups.map((group) => {
              const best = cheapestRetailer(group);
              const saving = priceSavingPct(group);
              const isSelected = selectedGroup?.groupId === group.groupId;
              const isScrapingThis = scraping === group.groupId;
              return (
                <div
                  key={group.groupId}
                  onClick={() => handleSelectGroup(group)}
                  className={`glass rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:border-white/25 ${
                    isSelected ? 'glow-blue' : ''
                  } ${isScrapingThis ? 'pulse-ring' : ''}`}
                >
                  <div className="p-4">
                    {/* Card header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm leading-snug">{group.name}</h3>
                        {saving !== null && saving > 0 && (
                          <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                            %{saving} tasarruf mümkün
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleScrapeNow(group); }}
                          disabled={scraping !== null}
                          className="text-[11px] bg-white/8 hover:bg-white/15 disabled:opacity-50 text-white/60 hover:text-white px-2.5 py-1 rounded-lg transition-all border border-white/10 hover:border-white/25"
                        >
                          {isScrapingThis ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                              Yükleniyor
                            </span>
                          ) : '↻ Güncelle'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(group); }}
                          disabled={scraping !== null}
                          className="text-[11px] bg-red-500/10 hover:bg-red-500/25 disabled:opacity-50 text-red-400 hover:text-red-300 px-2.5 py-1 rounded-lg transition-all border border-red-500/20 hover:border-red-400/40"
                        >
                          🗑
                        </button>
                      </div>
                    </div>

                    {/* Retailer rows */}
                    <div className="space-y-1.5">
                      {RETAILERS.map((retailer) => {
                        const entry = group.latestPrices?.[retailer];
                        const key = urlKey(retailer);
                        const url = group[key];
                        if (!url) return null;
                        const isBest = best === retailer;
                        return (
                          <a
                            key={retailer}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition-all hover:scale-[1.015] ${RETAILER_GLASS[retailer].pill} ${isBest ? 'ring-1 ring-emerald-400/50' : ''}`}
                          >
                            <span className="font-medium flex items-center gap-1.5">
                              {isBest && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/40">
                                  EN UCUZ
                                </span>
                              )}
                              {retailer}
                            </span>
                            {entry && entry.price != null ? (
                              <span className="font-bold tracking-tight">
                                {entry.price.toLocaleString('tr-TR')} {entry.currency}
                              </span>
                            ) : (
                              <span className="text-white/30 italic text-[10px]">Veri yok</span>
                            )}
                          </a>
                        );
                      })}
                    </div>

                    {/* Update timestamp */}
                    {(() => {
                      const times = RETAILERS.map((r) => group.latestPrices?.[r]?.timestamp).filter(Boolean) as string[];
                      if (!times.length) return null;
                      const latest = new Date(Math.max(...times.map((t) => new Date(t).getTime())));
                      return (
                        <p className="text-[10px] text-white/25 mt-2.5">
                          Son güncelleme: {latest.toLocaleString('tr-TR')}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Empty state ─────────────────────────────────── */}
        {groups.length === 0 && (
          <div className="glass rounded-2xl py-20 text-center">
            <div className="text-5xl mb-4">🏷️</div>
            <h3 className="text-white/80 font-semibold text-base mb-1">Henüz ürün eklenmedi</h3>
            <p className="text-white/35 text-sm">Yukarıdaki formu kullanarak takip etmek istediğiniz ürünleri ekleyin.</p>
          </div>
        )}

        {/* ─── Price history panel ─────────────────────────── */}
        {selectedGroup && (
          <div className="glass rounded-2xl p-5">
            {/* Panel header */}
            <div className="flex items-start justify-between mb-5 gap-3">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  📈 {selectedGroup.name}
                </h2>
                <p className="text-xs text-white/35 mt-0.5">Fiyat Geçmişi</p>
                <div className="flex flex-wrap gap-3 mt-2">
                  {selectedGroup.vatanUrl && (
                    <a href={selectedGroup.vatanUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-300 hover:text-blue-200 underline decoration-blue-400/40 transition">
                      Vatan ↗
                    </a>
                  )}
                  {selectedGroup.mediamarktUrl && (
                    <a href={selectedGroup.mediamarktUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-red-300 hover:text-red-200 underline decoration-red-400/40 transition">
                      MediaMarkt ↗
                    </a>
                  )}
                  {selectedGroup.teknosaUrl && (
                    <a href={selectedGroup.teknosaUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-green-300 hover:text-green-200 underline decoration-green-400/40 transition">
                      Teknosa ↗
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedGroup(null)}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white/8 hover:bg-white/15 text-white/50 hover:text-white text-sm font-bold transition-all border border-white/10 hover:border-white/25"
              >
                ×
              </button>
            </div>

            {/* Stats row */}
            {prices.length > 0 && (() => {
              const stats = RETAILERS.map((retailer) => {
                const rp = prices.filter((p) => p.retailer === retailer).map((p) => p.price);
                if (!rp.length) return null;
                return {
                  retailer,
                  min: Math.min(...rp),
                  max: Math.max(...rp),
                  currency: prices.find((p) => p.retailer === retailer)?.currency ?? '₺',
                };
              }).filter(Boolean);
              if (!stats.length) return null;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                  {stats.map((s) => {
                    if (!s) return null;
                    const c = RETAILER_GLASS[s.retailer as Retailer];
                    return (
                      <div key={s.retailer} className={`rounded-xl px-3.5 py-3 border ${c.pill}`}>
                        <p className={`text-[10px] font-bold mb-2 tracking-wide uppercase ${c.label}`}>{s.retailer}</p>
                        <div className="flex gap-4 text-xs">
                          <div>
                            <span className="text-white/35 block text-[9px] uppercase tracking-wide mb-0.5">En Düşük</span>
                            <span className="font-bold text-white">{s.min.toLocaleString('tr-TR')} {s.currency}</span>
                          </div>
                          <div>
                            <span className="text-white/35 block text-[9px] uppercase tracking-wide mb-0.5">En Yüksek</span>
                            <span className="font-bold text-white">{s.max.toLocaleString('tr-TR')} {s.currency}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <PriceChart prices={prices} />

            {/* Price table */}
            {prices.length > 0 && (
              <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="py-2.5 px-4 text-left font-semibold text-white/40 uppercase tracking-wide text-[10px]">Tarih</th>
                      <th className="py-2.5 px-4 text-left font-semibold text-white/40 uppercase tracking-wide text-[10px]">Mağaza</th>
                      <th className="py-2.5 px-4 text-left font-semibold text-white/40 uppercase tracking-wide text-[10px]">Fiyat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...prices]
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((p, i) => (
                        <tr key={i} className={`border-b border-white/5 last:border-0 ${i % 2 !== 0 ? 'bg-white/[0.03]' : ''}`}>
                          <td className="py-2.5 px-4 text-white/35 whitespace-nowrap">{new Date(p.timestamp).toLocaleString('tr-TR')}</td>
                          <td className="py-2.5 px-4 text-white/60">{p.retailer}</td>
                          <td className="py-2.5 px-4 font-semibold text-white">{p.price.toLocaleString('tr-TR')} {p.currency}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {prices.length === 0 && (
              <div className="flex flex-col items-center justify-center h-28 text-white/25 text-sm gap-2">
                <span className="text-3xl">📊</span>
                Henüz fiyat verisi yok. &quot;Güncelle&quot; butonuna basın.
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Delete confirmation modal ───────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="glass rounded-2xl p-6 max-w-sm w-full border border-white/20 shadow-2xl">
            <div className="text-center">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="text-base font-semibold text-white mb-1">Emin misin?</h3>
              <p className="text-sm text-white/50 mb-1">
                <span className="font-medium text-white/80">{deleteConfirm.name}</span>
              </p>
              <p className="text-xs text-white/35 mb-5">Bu ürün ve tüm fiyat geçmişi kalıcı olarak silinecek.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-white/70 hover:text-white text-sm font-medium transition-all border border-white/10 hover:border-white/25 disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  onClick={() => handleDeleteGroup(deleteConfirm)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-all shadow-lg shadow-red-600/30 disabled:opacity-50"
                >
                  {deleting ? 'Siliniyor...' : 'Evet, Sil'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
