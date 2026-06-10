'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface PriceAlert {
  _id: string;
  groupId: string;
  groupName: string;
  retailer: string;
  oldPrice: number;
  newPrice: number;
  currency: string;
  dropAmount: number;
  dropPercent: number;
  timestamp: string;
  read: boolean;
}

export default function NotificationPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | 'unavailable'>(
    typeof Notification === 'undefined' ? 'unavailable' : Notification.permission
  );
  const [alertCount, setAlertCount] = useState(0);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Service Worker'ı kaydet
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        swRegistrationRef.current = reg;
        console.log('SW registered');
      }).catch((err) => {
        console.warn('SW registration failed:', err);
      });
    }
  }, []);

  // Bildirim izni iste
  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        // İzin verildiyse hemen alertleri kontrol et
        checkAlerts();
      }
    } catch {
      setPermission('unavailable');
    }
  }, []);

  // Alertleri kontrol et
  const checkAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/price-alerts');
      const data = await res.json();
      if (data.success && Array.isArray(data.alerts)) {
        setAlerts(data.alerts);
        setAlertCount(data.alerts.length);

        // Yeni alert varsa bildirim göster
        if (data.alerts.length > 0 && swRegistrationRef.current && Notification.permission === 'granted') {
          for (const alert of data.alerts) {
            swRegistrationRef.current.showNotification('📉 Fiyat Düştü!', {
              body: `${alert.groupName} — ${alert.retailer}\n${alert.oldPrice.toLocaleString('tr-TR')} ₺ → ${alert.newPrice.toLocaleString('tr-TR')} ₺ (🟢 -%${alert.dropPercent})`,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: `price-drop-${alert._id}`,
              data: {
                url: '/',
                groupId: alert.groupId,
                alertId: alert._id,
              },
            });
          }
        }
      }
    } catch {
      // sessiz kal
    }
  }, []);

  // Sayfa görünür olduğunda ve periyodik olarak alertleri kontrol et
  useEffect(() => {
    if (permission !== 'granted') return;

    // İlk yüklemede kontrol et
    checkAlerts();

    // Her 30 saniyede bir kontrol et
    pollingRef.current = setInterval(checkAlerts, 30000);

    // Sayfa görünür hale geldiğinde kontrol et
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkAlerts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [permission, checkAlerts]);

  // Alertleri okundu olarak işaretle
  const dismissAlerts = useCallback(async () => {
    try {
      await fetch('/api/price-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });
      setAlerts([]);
      setAlertCount(0);
      setShowDropdown(false);
    } catch {
      // sessiz kal
    }
  }, []);

  // Bildirim izni yok / kullanılamıyor
  if (permission === 'unavailable') return null;

  return (
    <div className="relative">
      {/* Bildirim izni butonu */}
      {permission !== 'granted' && (
        <button
          onClick={requestPermission}
          className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 hover:bg-amber-500/30 transition-all flex items-center gap-1.5"
          title="Fiyat düşüş bildirimlerini aç"
        >
          <span>🔔</span>
          <span className="hidden sm:inline">Bildirim</span>
        </button>
      )}

      {/* Bildirim zili — izin varsa */}
      {permission === 'granted' && (
        <>
          <button
            onClick={() => {
              checkAlerts();
              setShowDropdown(!showDropdown);
            }}
            className="relative text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 hover:bg-blue-500/30 transition-all flex items-center gap-1.5"
            title="Fiyat düşüş bildirimleri"
          >
            <span>🔔</span>
            {alertCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold shadow-lg shadow-red-500/40">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-80 glass rounded-2xl border border-white/15 shadow-2xl overflow-hidden">
                <div className="p-3 border-b border-white/10 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white/80">Fiyat Düşüşleri</h3>
                  {alertCount > 0 && (
                    <button
                      onClick={dismissAlerts}
                      className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Tümünü Okundu İşaretle
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <div className="p-6 text-center text-white/30 text-xs">
                      <p className="text-xl mb-1">✅</p>
                      <p>Henüz fiyat düşüşü yok</p>
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert._id}
                        className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg shrink-0 mt-0.5">📉</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white truncate">{alert.groupName}</p>
                            <p className="text-[10px] text-white/50 mt-0.5">{alert.retailer}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[11px] text-white/60 line-through">{alert.oldPrice.toLocaleString('tr-TR')} ₺</span>
                              <span className="text-[11px] text-emerald-400 font-bold">{alert.newPrice.toLocaleString('tr-TR')} ₺</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                                -%{alert.dropPercent}
                              </span>
                            </div>
                            <p className="text-[9px] text-white/25 mt-1">
                              {new Date(alert.timestamp).toLocaleString('tr-TR')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
