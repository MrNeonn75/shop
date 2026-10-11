import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { catalogRepository } from '../../../shared/adapters';
import { ProductCategoryTaxonomy, ProductSection, ProductType } from '../types/catalog';
import {
  Plus,
  Edit2,
  Trash2,
  Tag,
  ShieldAlert,
} from 'lucide-react';
import { useToast } from '../../../components/ui';

export const CategoriesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const [activeSection, setActiveSection] = useState<ProductSection | 'all'>('all');
  const [activeType, setActiveType] = useState<ProductType | 'all'>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<ProductCategoryTaxonomy> | null>(null);

  // Delete / Reassign safety modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<ProductCategoryTaxonomy | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => catalogRepository.getCategories(),
  });

  const saveMutation = useMutation({
    mutationFn: (cat: Partial<ProductCategoryTaxonomy>) => catalogRepository.saveCategory(cat),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      setIsModalOpen(false);
      setEditingCategory(null);
      success('Kateqoriya uğurla yadda saxlanıldı.');
    },
    onError: (err: Error) => {
      toastError(err.message || 'Xəta baş verdi.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reassignToId }: { id: string; reassignToId?: string }) =>
      catalogRepository.deleteCategory(id, reassignToId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      setIsDeleteModalOpen(false);
      setCategoryToDelete(null);
      setReassignTargetId('');
      success('Kateqoriya uğurla silindi / birləşdirildi.');
    },
    onError: (err: Error) => {
      toastError(err.message || 'Silinmə zamanı xəta baş verdi.');
    },
  });

  const filteredCategories = categories.filter((c) => {
    if (activeSection !== 'all' && c.section !== activeSection) return false;
    if (activeType !== 'all' && c.type !== activeType) return false;
    return true;
  });

  const handleOpenCreate = () => {
    setEditingCategory({
      name: '',
      slug: '',
      section: 'kisi',
      type: 'geyim',
      parentId: null,
      isActive: true,
      sortOrder: categories.length + 1,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: ProductCategoryTaxonomy) => {
    setEditingCategory({ ...cat });
    setIsModalOpen(true);
  };

  const handleOpenDelete = (cat: ProductCategoryTaxonomy) => {
    setCategoryToDelete(cat);
    const fallback = categories.find((c) => c.id !== cat.id);
    setReassignTargetId(fallback?.id || '');
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kateqoriya Ağacı və Təsnifat"
        description="Bölmə (Kişi, Qadın, Uşaq, Digər) və Məhsul Tipi (Geyim, Ayaqqabı, Aksesuar) üzrə iyerarxik kataloq taksonomiyası."
        breadcrumbs={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Kataloq', href: '/catalog' },
          { label: 'Kateqoriyalar' },
        ]}
        actions={
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={handleOpenCreate}
          >
            Yeni Kateqoriya
          </Button>
        }
      />

      {/* Filter Tabs by Section & Type */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Bölmə:</span>
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg text-xs">
                {(['all', 'kisi', 'qadin', 'usaq', 'diger'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setActiveSection(s)}
                    className={`px-3 py-1 rounded-md font-medium capitalize transition-all ${
                      activeSection === s
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {s === 'all'
                      ? 'Hamısı'
                      : s === 'kisi'
                      ? 'Kişi'
                      : s === 'qadin'
                      ? 'Qadın'
                      : s === 'usaq'
                      ? 'Uşaq'
                      : 'Digər'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Məhsul Tipi:</span>
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg text-xs">
                {(['all', 'geyim', 'ayaqqabi', 'aksesuar'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveType(t)}
                    className={`px-3 py-1 rounded-md font-medium capitalize transition-all ${
                      activeType === t
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t === 'all'
                      ? 'Hamısı'
                      : t === 'geyim'
                      ? 'Geyim'
                      : t === 'ayaqqabi'
                      ? 'Ayaqqabı'
                      : 'Aksesuar'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Tree Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
            Kateqoriyalar yüklənir...
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
            Seçilmiş filtr üzrə kateqoriya tapılmadı.
          </div>
        ) : (
          filteredCategories.map((cat) => (
            <Card key={cat.id} className="relative group hover:border-primary/50 transition-colors">
              <CardContent className="p-4 flex items-start justify-between">
                <div className="space-y-1.5 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{cat.name}</span>
                    <Badge variant={cat.isActive ? 'neutral' : 'warning'} size="sm">
                      {cat.isActive ? 'Aktiv' : 'Deaktiv'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{cat.section}</span>
                    <span>•</span>
                    <span className="capitalize">{cat.type}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1">
                    <Tag className="h-3 w-3" />
                    <span>{cat.productCount} bağlı məhsul</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => handleOpenEdit(cat)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleOpenDelete(cat)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && editingCategory && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingCategory.id ? 'Kateqoriyanı Redaktə Et' : 'Yeni Kateqoriya Əlavə Et'}
          description="Kataloq məhsullarının düzgün qruplaşdırılması üçün təsnifat məlumatları."
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                İmtina
              </Button>
              <Button
                size="sm"
                isLoading={saveMutation.isPending}
                onClick={() => {
                  if (!editingCategory.name) {
                    toastError('Kateqoriya adı tələb olunur.');
                    return;
                  }
                  saveMutation.mutate(editingCategory);
                }}
              >
                Yadda Saxla
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Kateqoriya Adı *</label>
              <Input
                value={editingCategory.name || ''}
                onChange={(e) =>
                  setEditingCategory((prev) => ({
                    ...prev,
                    name: e.target.value,
                    slug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                  }))
                }
                placeholder="məs: Köynək, Don, Şalvar..."
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Bölmə</label>
                <Select
                  value={editingCategory.section || 'kisi'}
                  onValueChange={(v: string) =>
                    setEditingCategory((prev) => ({ ...prev, section: v as ProductSection }))
                  }
                  options={[
                    { value: 'kisi', label: 'Kişi' },
                    { value: 'qadin', label: 'Qadın' },
                    { value: 'usaq', label: 'Uşaq' },
                    { value: 'diger', label: 'Digər' },
                  ]}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Məhsul Tipi</label>
                <Select
                  value={editingCategory.type || 'geyim'}
                  onValueChange={(v: string) =>
                    setEditingCategory((prev) => ({ ...prev, type: v as ProductType }))
                  }
                  options={[
                    { value: 'geyim', label: 'Geyim' },
                    { value: 'ayaqqabi', label: 'Ayaqqabı' },
                    { value: 'aksesuar', label: 'Aksesuar' },
                  ]}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Valideyn Kateqoriya (İstəyə bağlı)</label>
              <Select
                value={editingCategory.parentId || ''}
                onValueChange={(v: string) =>
                  setEditingCategory((prev) => ({ ...prev, parentId: v || null }))
                }
                options={[
                  { value: '', label: 'Yoxdur (Əsas kateqoriya)' },
                  ...categories
                    .filter((c) => c.id !== editingCategory.id)
                    .map((c) => ({ value: c.id, label: `${c.name} (${c.section})` })),
                ]}
                className="mt-1"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Delete / Merge Safety Modal */}
      {isDeleteModalOpen && categoryToDelete && (
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Kateqoriyanın Silinməsi və ya Birləşdirilməsi"
          description={`"${categoryToDelete.name}" kateqoriyasına bağlı ${categoryToDelete.productCount} məhsul qeydiyyatdadır.`}
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsDeleteModalOpen(false)}>
                İmtina
              </Button>
              <Button
                variant="destructive"
                size="sm"
                isLoading={deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate({
                    id: categoryToDelete.id,
                    reassignToId: reassignTargetId || undefined,
                  })
                }
              >
                Köçür və Sil
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning-foreground text-xs">
              <ShieldAlert className="h-5 w-5 text-warning flex-shrink-0" />
              <div>
                ERP məlumat tamlığı qaydalarına görə bağlı məhsulları olan kateqoriya birbaşa
                silinə bilməz. Mövcud məhsulları başqa kateqoriyaya yönləndirməlisiniz.
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Məhsulları Köçür (Hədəf Kateqoriya):
              </label>
              <Select
                value={reassignTargetId}
                onValueChange={(v: string) => setReassignTargetId(v)}
                options={categories
                  .filter((c) => c.id !== categoryToDelete.id)
                  .map((c) => ({ value: c.id, label: `${c.name} (${c.section} - ${c.type})` }))}
                className="mt-1"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
