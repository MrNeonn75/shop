import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { PosService } from '../services/posService';
import { CustomerLoyalty } from '../types';
import { X, User, Search, Plus } from 'lucide-react';

export const CustomerModal: React.FC = () => {
  const { t } = useTranslation('pos');
  const {
    isCustomerModalOpen,
    setCustomerModalOpen,
    customer,
    setCustomer,
    redeemPoints,
    toggleRedeemPoints,
  } = usePosStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [customersList, setCustomersList] = useState<CustomerLoyalty[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('+994 ');
  const [marketingConsent, setMarketingConsent] = useState(true);

  useEffect(() => {
    if (isCustomerModalOpen) {
      PosService.searchCustomers(searchQuery).then(setCustomersList);
    }
  }, [isCustomerModalOpen, searchQuery]);

  if (!isCustomerModalOpen) return null;

  const handleSelect = (cust: CustomerLoyalty) => {
    setCustomer(cust);
    setCustomerModalOpen(false);
  };

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newPhone.trim().length < 8) return;

    const created = await PosService.createCustomer({
      name: newName.trim(),
      phone: newPhone.trim(),
      marketingConsent,
    });

    setCustomer(created);
    setCustomerModalOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-lg w-full max-h-[90vh] flex flex-col text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              {t('customer.selectCustomer')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setCustomerModalOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Active Customer Card if already attached */}
          {customer && (
            <div className="p-3 bg-zinc-900 border border-zinc-750 rounded space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm text-white">{customer.name}</span>
                  <div className="text-xs text-zinc-400 font-mono">
                    {customer.phone} · {customer.cardNumber}
                  </div>
                </div>
                <span className="bg-amber-400 text-black text-xs font-black uppercase px-2 py-0.5 rounded">
                  {customer.tier}
                </span>
              </div>

              {/* Points Redemption Option */}
              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                <div className="text-xs text-zinc-300">
                  <span>Mövcud Bonus: </span>
                  <span className="font-bold font-mono text-emerald-400">
                    {(customer.pointsAvailable / 100).toFixed(2)} ₼ ({customer.pointsAvailable} xal)
                  </span>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={redeemPoints}
                    onChange={toggleRedeemPoints}
                    className="w-4 h-4 rounded accent-emerald-500"
                  />
                  <span>Bonus Xalları Sil</span>
                </label>
              </div>
            </div>
          )}

          {!isCreating ? (
            <>
              {/* Search Box */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('customer.searchPlaceholder')}
                  className="w-full h-11 bg-black border border-zinc-700 rounded pl-9 pr-3 text-sm text-white focus:outline-none focus:border-white"
                  autoFocus
                />
              </div>

              {/* Results List */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {customersList.map((cust) => (
                  <div
                    key={cust.id}
                    onClick={() => handleSelect(cust)}
                    className="p-3 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="font-bold text-xs text-white">{cust.name}</div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        {cust.phone} · {cust.cardNumber}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono uppercase bg-zinc-800 px-1.5 py-0.5 rounded font-bold text-amber-400 block mb-0.5">
                        {cust.tier}
                      </span>
                      <span className="text-xs text-zinc-300 font-mono">
                        {(cust.pointsAvailable / 100).toFixed(2)} ₼
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Switch to Quick Create */}
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full py-2.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 flex items-center justify-center gap-1.5 min-h-[44px]"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>{t('customer.quickCreate')}</span>
              </button>
            </>
          ) : (
            /* Quick Create Form */
            <form onSubmit={handleQuickCreate} className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-200">{t('customer.quickCreate')}</h4>
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1 font-semibold">
                  {t('customer.fullName')} *:
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Məs: Rəşad Quliyev"
                  className="w-full h-10 bg-black border border-zinc-700 rounded px-3 text-xs text-white focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1 font-semibold">
                  {t('customer.phone')} *:
                </label>
                <input
                  type="tel"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+994 50 123 45 67"
                  className="w-full h-10 bg-black border border-zinc-700 rounded px-3 text-xs text-white font-mono focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                <span>{t('customer.consentMarketing')}</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded bg-white text-black hover:bg-zinc-200 text-xs font-bold"
                >
                  Yarat və Seç
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
