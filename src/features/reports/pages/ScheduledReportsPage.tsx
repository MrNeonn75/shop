import React, { useState, useEffect } from 'react';
import {
  CalendarClock,
  Plus,
  Mail,
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  Trash2,
  Info,
} from 'lucide-react';
import { reportsRepository } from '../../../shared/adapters';
import { ScheduledReportDelivery, ReportDefinition } from '../types';

export const ScheduledReportsPage: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduledReportDelivery[]>([]);
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  // New Schedule Modal
  const [showModal, setShowModal] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState('sales_daily');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [channel, setChannel] = useState<'email' | 'telegram' | 'whatsapp'>('email');
  const [recipientsInput, setRecipientsInput] = useState('menecer@brandhouse.az');
  const [format, setFormat] = useState<'pdf' | 'xlsx' | 'csv'>('pdf');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [schedList, repList] = await Promise.all([
        reportsRepository.getScheduledReports(),
        reportsRepository.getReportsCatalog(),
      ]);
      setSchedules(schedList);
      setReports(repList);
    } catch (err) {
      console.error('Failed to load scheduled reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (item: ScheduledReportDelivery) => {
    try {
      const updated = await reportsRepository.updateScheduledReport(item.id, {
        isActive: !item.isActive,
      });
      setSchedules(schedules.map((s) => (s.id === item.id ? updated : s)));
    } catch (err) {
      console.error('Failed to toggle schedule:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await reportsRepository.deleteScheduledReport(id);
      setSchedules(schedules.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete schedule:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const rep = reports.find((r) => r.id === selectedReportId);
    const recipients = recipientsInput
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    try {
      const created = await reportsRepository.createScheduledReport({
        reportId: selectedReportId,
        reportTitle: rep?.azTitle || 'Gündəlik Satış Hesabatı',
        frequency,
        channel,
        recipients,
        format,
        isActive: true,
      });
      setSchedules([...schedules, created]);
      setShowModal(false);
      setRecipientsInput('');
    } catch (err) {
      console.error('Failed to create scheduled report:', err);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider flex items-center">
              <CalendarClock className="w-3 h-3 mr-1" /> Avtomatik Çatdırılma
            </span>
            <span className="text-xs text-gray-400">• Email & Mesajlaşma</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Cədvəl Üzrə Hesabat Çatdırılmaları</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Gündəlik, həftəlik və ya aylıq olaraq icra edilən və rəhbərliyə göndərilən avtomatlaşdırılmış hesabatlar.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Cədvəl Əlavə Et</span>
        </button>
      </div>

      {/* Provider Status Caution Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start space-x-3 text-xs text-amber-900">
        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="font-semibold block">Çatdırılma Kanalları Haqqında Xəbərdarlıq</strong>
          <p className="text-amber-800 leading-relaxed">
            Xarici bildiriş provayderləri (SMTP Server, Telegram Bot, WhatsApp Business API) konfiqurasiya edilmədiyi üçün status strictly{' '}
            <strong className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-950">"Konfiqurasiya olunmayıb"</strong> olaraq saxlanılır. Fiktiv və ya simulyasiya edilmiş göndərişlər aparılmır.
          </p>
        </div>
      </div>

      {/* Schedules List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Qeydiyyatdakı Cədvəllər</h3>
          <span className="text-xs text-gray-400">{schedules.length} cədvəl</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-gray-400">Yüklənir...</div>
        ) : schedules.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-400">
            Hələlik heç bir avtomatik çatdırılma cədvəli yaradılmayıb.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Hesabat</th>
                  <th className="px-4 py-3">Tezlik</th>
                  <th className="px-4 py-3">Kanal</th>
                  <th className="px-4 py-3">Qəbul Edənlər</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">Provayder Statusu</th>
                  <th className="px-4 py-3">Aktivlik</th>
                  <th className="px-4 py-3 text-right">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {schedules.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {item.reportTitle}
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                        {item.frequency === 'daily' ? 'Gündəlik' : item.frequency === 'weekly' ? 'Həftəlik' : 'Aylıq'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1.5 text-gray-700">
                        {item.channel === 'email' && <Mail className="w-3.5 h-3.5 text-blue-600" />}
                        {item.channel === 'telegram' && <Send className="w-3.5 h-3.5 text-sky-500" />}
                        {item.channel === 'whatsapp' && <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />}
                        <span className="capitalize">{item.channel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600">
                      {item.recipients.join(', ')}
                    </td>
                    <td className="px-4 py-3 uppercase font-mono font-bold text-gray-500">
                      {item.format}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        {item.providerStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(item)}
                        className="flex items-center space-x-1 text-xs"
                      >
                        {item.isActive ? (
                          <span className="text-emerald-600 font-semibold flex items-center">
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aktiv
                          </span>
                        ) : (
                          <span className="text-gray-400 font-medium flex items-center">
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Deaktiv
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-gray-400 hover:text-rose-600 p-1 rounded"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-200"
          >
            <h3 className="text-sm font-bold text-gray-900">Yeni Cədvəl Hesabatı Əlavə Et</h3>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Hesabatı Seçin
              </label>
              <select
                value={selectedReportId}
                onChange={(e) => setSelectedReportId(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-lg p-2"
              >
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.azTitle} ({r.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Tezlik
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
                  className="w-full text-xs border border-gray-300 rounded-lg p-2"
                >
                  <option value="daily">Gündəlik</option>
                  <option value="weekly">Həftəlik</option>
                  <option value="monthly">Aylıq</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'pdf' | 'xlsx' | 'csv')}
                  className="w-full text-xs border border-gray-300 rounded-lg p-2"
                >
                  <option value="pdf">PDF</option>
                  <option value="xlsx">Excel (XLSX)</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Çatdırılma Kanalı
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as 'email' | 'telegram' | 'whatsapp')}
                className="w-full text-xs border border-gray-300 rounded-lg p-2"
              >
                <option value="email">Email (E-poçt)</option>
                <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Qəbul Edənlər (Vergüllə ayırın)
              </label>
              <input
                type="text"
                placeholder="menecer@brandhouse.az, audit@brandhouse.az"
                value={recipientsInput}
                onChange={(e) => setRecipientsInput(e.target.value)}
                required
                className="w-full text-xs border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                İmtina
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700"
              >
                Əlavə Et
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
