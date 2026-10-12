import React, { useState } from 'react';
import { Tag, Calendar, Plus, MessageSquare, Megaphone, Check } from 'lucide-react';
import { ChartAnnotation } from '../types';
import { biRepository } from '../../../shared/adapters';

interface ChartAnnotationsPanelProps {
  annotations: ChartAnnotation[];
  onAnnotationAdded?: (newAnnotation: ChartAnnotation) => void;
}

export const ChartAnnotationsPanel: React.FC<ChartAnnotationsPanelProps> = ({
  annotations,
  onAnnotationAdded,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('2026-10-12');
  const [note, setNote] = useState('');
  const [type, setType] = useState<'campaign' | 'manager_note'>('manager_note');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !note.trim()) return;

    try {
      setLoading(true);
      const created = await biRepository.addChartAnnotation({
        title: title.trim(),
        date,
        note: note.trim(),
        author: 'Cari İstifadəçi (Menecer)',
        type,
      });

      if (onAnnotationAdded) {
        onAnnotationAdded(created);
      }

      setTitle('');
      setNote('');
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to add annotation:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center space-x-2">
          <Tag className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-gray-900">Qrafik Qeydləri və Tədbirlər</h3>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center space-x-1 border border-indigo-200"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Yeni Hadisə Qeydi</span>
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-gray-600 font-medium mb-1">Başlıq</label>
              <input
                type="text"
                placeholder="Məs: Endirim kampaniyası startı"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-gray-600 font-medium mb-1">Tarix</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-gray-600 font-medium mb-1">Növ</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'manager_note' | 'campaign')}
                className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5"
              >
                <option value="manager_note">Menecer Qeydi</option>
                <option value="campaign">Marketinq Kampaniyası</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-gray-600 font-medium mb-1">Ətraflı İzah</label>
            <textarea
              rows={2}
              placeholder="Qrafikdəki sıçrayış və ya enişin səbəbini qeyd edin..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1 bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
            >
              İmtina
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded flex items-center space-x-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Əlavə Et</span>
            </button>
          </div>
        </form>
      )}

      {/* Annotations Timeline List */}
      <div className="space-y-2.5">
        {annotations.map((item) => (
          <div
            key={item.id}
            className="p-3 rounded-lg border border-gray-100 bg-gray-50/60 hover:bg-gray-50 flex items-start space-x-3 transition-colors"
          >
            <div
              className={`p-1.5 rounded-md mt-0.5 ${
                item.type === 'campaign'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {item.type === 'campaign' ? (
                <Megaphone className="w-4 h-4" />
              ) : (
                <MessageSquare className="w-4 h-4" />
              )}
            </div>

            <div className="flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">{item.title}</span>
                <span className="text-[11px] text-gray-400 flex items-center font-mono">
                  <Calendar className="w-3 h-3 mr-1" />
                  {item.date}
                </span>
              </div>
              <p className="text-gray-600 mt-1 leading-relaxed">{item.note}</p>
              <p className="text-[10px] text-gray-400 mt-1">Müəllif: {item.author}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

