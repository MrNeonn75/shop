import React from 'react';
import { usePosStore } from '../stores/posStore';
import { X, Keyboard } from 'lucide-react';

export const ShortcutsHelpModal: React.FC = () => {
  const { isShortcutsHelpOpen, setShortcutsHelpOpen } = usePosStore();

  if (!isShortcutsHelpOpen) return null;

  const shortcuts = [
    { key: 'F1', label: 'Qısayollar Köməkçisi', desc: 'Bütün klaviatura düymələrinin siyahısı' },
    { key: 'F2', label: 'Müştəri Seçimi', desc: 'Müştəri axtarışı, loyallıq xalları və qeydiyyat' },
    { key: 'F4', label: 'Endirim Tətbiqi', desc: 'Çek və ya sətir üzrə faiz/məbləğ endirimi' },
    { key: 'F7', label: 'Qaytarılma / Dəyişmə', desc: 'Köhnə çek nömrəsi ilə məhsul qaytarılması' },
    { key: 'F8', label: 'Səbəti Gözlət (Park)', desc: 'Aktiv səbəti serverdə saxlayıb ekranı təmizləyir' },
    { key: 'F9', label: 'Səbəti Geri Çağır', desc: 'Gözləmədə saxlanılan səbətlərin siyahısı və bərpası' },
    { key: 'F10', label: 'Ödəniş Ekranı', desc: 'Nağd, kart, qarışıq ödəniş və çekin vurulması' },
    { key: '+', label: 'Sayı Artır', desc: 'Seçilmiş məhsul sətrinin sayını 1 vahid artırır' },
    { key: '-', label: 'Sayı Azalt', desc: 'Seçilmiş məhsul sətrinin sayını 1 vahid azaldır' },
    { key: 'Del / Backspace', label: 'Sətri Sil', desc: 'Seçilmiş məhsulu səbətdən çıxarır' },
    { key: 'Esc', label: 'İmtina / Pəncərəni Bağla', desc: 'Aktiv açıq modal pəncərəni bağlayır' },
    { key: 'Enter', label: 'Barkod Oxutma', desc: 'Skan edilmiş barkodu dərhal səbətə əlavə edir' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-lg w-full text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-white" />
            <h2 className="text-base font-bold text-white tracking-tight">
              POS Klaviatura Qısayolları
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShortcutsHelpOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-2">
          {shortcuts.map((sc, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2.5 rounded bg-zinc-900 border border-zinc-800 text-xs"
            >
              <div>
                <span className="font-bold text-white block">{sc.label}</span>
                <span className="text-[11px] text-zinc-400">{sc.desc}</span>
              </div>
              <kbd className="px-2.5 py-1 bg-black border border-zinc-700 rounded font-mono font-bold text-zinc-200 shadow-sm shrink-0">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-zinc-900 border-t border-zinc-800 text-right">
          <button
            type="button"
            onClick={() => setShortcutsHelpOpen(false)}
            className="px-4 py-2 rounded bg-white text-black font-bold text-xs uppercase"
          >
            Bağla
          </button>
        </div>
      </div>
    </div>
  );
};
