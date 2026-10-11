import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { catalogRepository } from '../../../shared/adapters';
import { Brand } from '../types/catalog';
import { Plus, Edit2, Trash2, Search, Globe, Tag } from 'lucide-react';
import { useToast } from '../../../components/ui';

export const BrandsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Partial<Brand> | null>(null);

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['catalog-brands'],
    queryFn: () => catalogRepository.getBrands(),
  });

  const saveMutation = useMutation({
    mutationFn: (brand: Partial<Brand>) => catalogRepository.saveBrand(brand),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-brands'] });
      setIsModalOpen(false);
      setEditingBrand(null);
      success('Brend uğurla yadda saxlanıldı.');
    },
    onError: (err: Error) => {
      toastError(err.message || 'Xəta baş verdi.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogRepository.deleteBrand(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-brands'] });
      success('Brend uğurla silindi.');
    },
    onError: (err: Error) => {
      toastError(err.message || 'Silinmə zamanı xəta baş verdi.');
    },
  });

  const filteredBrands = brands.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.code.toLowerCase().includes(q) ||
      (b.country && b.country.toLowerCase().includes(q))
    );
  });

  const handleOpenCreate = () => {
    setEditingBrand({
      name: '',
      code: '',
      country: 'Azərbaycan',
      description: '',
      isActive: true,
      productCount: 0,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (brand: Brand) => {
    setEditingBrand({ ...brand });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brendlərin İdarə Edilməsi"
        description="Satışda olan bütün yerli və xarici geyim brendlərinin siyahısı, loqoları və təsvirləri."
        breadcrumbs={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Kataloq', href: '/catalog' },
          { label: 'Brendlər' },
        ]}
        actions={
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={handleOpenCreate}
          >
            Yeni Brend
          </Button>
        }
      />

      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Brend adı və ya ölkə ilə axtar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Cəmi: <strong className="text-foreground">{brands.length}</strong> brend
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
            Brendlər yüklənir...
          </div>
        ) : filteredBrands.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
            Axtarışa uyğun brend tapılmadı.
          </div>
        ) : (
          filteredBrands.map((brand) => (
            <Card key={brand.id} className="relative group hover:border-primary/50 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-border flex items-center justify-center font-bold text-sm text-foreground uppercase">
                    {brand.code}
                  </div>
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => handleOpenEdit(brand)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-danger"
                      onClick={() => {
                        if (brand.productCount > 0) {
                          toastError(`Bu brendə bağlı ${brand.productCount} məhsul var. Silinə bilməz.`);
                          return;
                        }
                        if (confirm(`"${brand.name}" brendini silmək istədiyinizə əminsiniz?`)) {
                          deleteMutation.mutate(brand.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                    {brand.name}
                  </h3>
                  {brand.country && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Globe className="h-3 w-3" />
                      <span>{brand.country}</span>
                    </div>
                  )}
                </div>

                {brand.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {brand.description}
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Tag className="h-3 w-3" />
                    <span>{brand.productCount} məhsul</span>
                  </div>
                  <Badge variant={brand.isActive ? 'neutral' : 'warning'} size="sm">
                    {brand.isActive ? 'Aktiv' : 'Passiv'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Brand Create/Edit Modal */}
      {isModalOpen && editingBrand && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingBrand.id ? 'Brendi Redaktə Et' : 'Yeni Brend Qeydiyyatı'}
          description="Kataloqda məhsulların brend mənsubiyyətini təyin etmək üçün məlumatlar."
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                İmtina
              </Button>
              <Button
                size="sm"
                isLoading={saveMutation.isPending}
                onClick={() => {
                  if (!editingBrand.name || !editingBrand.code) {
                    toastError('Brend adı və qısa kod tələb olunur.');
                    return;
                  }
                  saveMutation.mutate(editingBrand);
                }}
              >
                Yadda Saxla
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Brendin Adı *</label>
              <Input
                value={editingBrand.name || ''}
                onChange={(e) =>
                  setEditingBrand((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="məs: Massimo Dutti, Zara..."
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Qısa Kod (SKU üçün) *</label>
                <Input
                  value={editingBrand.code || ''}
                  onChange={(e) =>
                    setEditingBrand((prev) => ({
                      ...prev,
                      code: e.target.value.toUpperCase().slice(0, 4),
                    }))
                  }
                  placeholder="məs: MD, ZR, TH"
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Mənşə Ölkəsi</label>
                <Input
                  value={editingBrand.country || ''}
                  onChange={(e) =>
                    setEditingBrand((prev) => ({ ...prev, country: e.target.value }))
                  }
                  placeholder="məs: İspaniya, Almaniya..."
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Təsvir</label>
              <Input
                value={editingBrand.description || ''}
                onChange={(e) =>
                  setEditingBrand((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Qısa məlumat və ya kolleksiya xüsusiyyətləri"
                className="mt-1"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
