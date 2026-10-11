import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { SEEDED_CATALOG_PRODUCTS, SEEDED_CATEGORIES } from '../../catalog/data/taxonomyData';
import { CatalogProduct, ProductVariant } from '../../catalog/types/catalog';
import { formatMoney } from '../../../shared/utils/formatters';
import { Search, Barcode, AlertCircle } from 'lucide-react';

export const ProductCatalogPanel: React.FC = () => {
  const { t } = useTranslation('pos');
  const { addItem, activeShift, scanFeedback } = usePosStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({}); // productId -> variantId
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keep search input focused for barcode scanner
  useEffect(() => {
    const focusInput = () => {
      // Only refocus if no dialog is currently focused
      const activeEl = document.activeElement;
      const isInputOrButton =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.getAttribute('role') === 'dialog';
      if (!isInputOrButton && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    };

    focusInput();
    const interval = setInterval(focusInput, 3000);
    return () => clearInterval(interval);
  }, []);

  // Quick categories
  const categories = useMemo(() => {
    return [{ id: 'all', name: 'Bütün Kateqoriyalar' }, ...SEEDED_CATEGORIES.slice(0, 7)];
  }, []);

  // Filter products
  const filteredProducts = useMemo(() => {
    let prods = SEEDED_CATALOG_PRODUCTS;

    if (selectedCategory !== 'all') {
      prods = prods.filter((p) => p.categoryId === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      prods = prods.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.includes(q) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(q) || v.barcode?.includes(q))
      );
    }

    return prods;
  }, [searchQuery, selectedCategory]);

  // Handle barcode scanner input (rapid keystrokes ending with Enter)
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchQuery.trim();
      if (!query) return;

      // Check if scanner read exact barcode or exact SKU
      const exactMatch = SEEDED_CATALOG_PRODUCTS.find(
        (p) =>
          p.barcode === query ||
          p.sku.toLowerCase() === query.toLowerCase() ||
          p.variants.some(
            (v) => v.barcode === query || v.sku.toLowerCase() === query.toLowerCase()
          )
      );

      if (exactMatch) {
        let matchingVariant: ProductVariant | undefined;
        matchingVariant = exactMatch.variants.find(
          (v) => v.barcode === query || v.sku.toLowerCase() === query.toLowerCase()
        );
        if (!matchingVariant) {
          matchingVariant = exactMatch.variants[0];
        }

        const success = await addItem(exactMatch, matchingVariant, 1);
        if (success) {
          setSearchQuery('');
          setErrorMessage(null);
        } else {
          setErrorMessage('Məhsulun qalığı tükənib!');
          setTimeout(() => setErrorMessage(null), 3000);
        }
      } else if (filteredProducts.length === 1) {
        // If query resolved to exactly one product
        const prod = filteredProducts[0];
        const chosenVariantId = selectedVariants[prod.id];
        const variant = prod.variants.find((v) => v.id === chosenVariantId) || prod.variants[0];
        const success = await addItem(prod, variant, 1);
        if (success) {
          setSearchQuery('');
          setErrorMessage(null);
        }
      } else if (filteredProducts.length === 0) {
        setErrorMessage(`Barkod və ya SKU tapılmadı: "${query}"`);
        setTimeout(() => setErrorMessage(null), 3000);
      }
    }
  };

  const handleSelectProduct = async (product: CatalogProduct) => {
    if (!activeShift) {
      setErrorMessage('Satış etmək üçün əvvəlcə kassa növbəsi açılmalıdır!');
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    const chosenVariantId = selectedVariants[product.id];
    const variant = product.variants.find((v) => v.id === chosenVariantId) || product.variants[0];

    const success = await addItem(product, variant, 1);
    if (!success) {
      setErrorMessage(`${product.name} üçün yetərli qalıq yoxdur!`);
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  const handleSelectVariant = (productId: string, variantId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedVariants((prev) => ({ ...prev, [productId]: variantId }));
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white overflow-hidden border-r border-zinc-800">
      {/* Scanner & Search Input Box */}
      <div className="p-3 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div
          className={`relative flex items-center rounded border transition-all ${
            scanFeedback === 'success'
              ? 'border-emerald-500 bg-emerald-950/30 ring-2 ring-emerald-500/50'
              : scanFeedback === 'error'
              ? 'border-red-500 bg-red-950/30 ring-2 ring-red-500/50'
              : 'border-zinc-700 bg-black focus-within:border-white focus-within:ring-1 focus-within:ring-white'
          }`}
        >
          <div className="pl-3 pr-2 text-zinc-400">
            <Barcode className="w-6 h-6" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('cart.scanPlaceholder')}
            className="w-full h-12 bg-transparent text-white placeholder-zinc-500 text-sm font-medium focus:outline-none pr-3"
            autoComplete="off"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mr-2 text-zinc-400 hover:text-white px-2 py-1 text-xs uppercase font-bold"
            >
              Təmizlə
            </button>
          )}
        </div>

        {/* Scan / Stock Feedback Message */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-2 p-2 rounded bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Quick Category Touch Buttons */}
      <div className="p-2.5 bg-zinc-900/60 border-b border-zinc-800 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-2 rounded text-xs font-semibold transition-all whitespace-nowrap min-h-[44px] flex items-center justify-center ${
                  isSelected
                    ? 'bg-white text-black shadow-sm'
                    : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700/60'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Products Grid / Results List */}
      <div className="flex-1 overflow-y-auto p-3">
        {filteredProducts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-center p-6">
            <Search className="w-10 h-10 mb-2 stroke-1" />
            <p className="text-sm font-medium">Məhsul tapılmadı</p>
            <p className="text-xs text-zinc-600 mt-1">Barkodu və ya axtarış sorğusunu yoxlayın</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {filteredProducts.map((prod) => {
              const activeVariantId = selectedVariants[prod.id] || prod.variants[0]?.id;
              const activeVariant =
                prod.variants.find((v) => v.id === activeVariantId) || prod.variants[0];
              const availableStock = activeVariant?.stockQty ?? prod.stockQty;
              const isOutOfStock = availableStock <= 0;

              return (
                <div
                  key={prod.id}
                  onClick={() => !isOutOfStock && handleSelectProduct(prod)}
                  className={`flex flex-col justify-between p-3 rounded border text-left transition-all min-h-[140px] cursor-pointer ${
                    isOutOfStock
                      ? 'bg-zinc-900/40 border-zinc-800 opacity-60 cursor-not-allowed'
                      : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 hover:border-zinc-700 active:scale-[0.99]'
                  }`}
                >
                  {/* Top: SKU & Price */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-[11px] font-mono text-zinc-400 truncate uppercase">
                        {prod.sku}
                      </span>
                      <span className="text-sm font-bold text-white tabular-nums shrink-0">
                        {formatMoney(prod.priceQapik)}
                      </span>
                    </div>

                    <h3 className="text-xs font-semibold text-zinc-100 line-clamp-2 leading-tight mb-2">
                      {prod.name}
                    </h3>
                  </div>

                  {/* Middle: Variant Chips (Size / Color) */}
                  {prod.variants.length > 0 && (
                    <div className="my-2 pt-2 border-t border-zinc-800/80">
                      <div className="flex flex-wrap gap-1">
                        {prod.variants.map((v) => {
                          const isVarSelected = activeVariantId === v.id;
                          const varOutOfStock = v.stockQty <= 0;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={(e) => handleSelectVariant(prod.id, v.id, e)}
                              className={`px-2 py-1 text-[11px] rounded font-mono font-medium transition-all ${
                                isVarSelected
                                  ? 'bg-white text-black font-bold ring-1 ring-white'
                                  : varOutOfStock
                                  ? 'bg-zinc-800 text-zinc-600 line-through'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                              }`}
                              title={`${v.size} / ${v.color} (Qalıq: ${v.stockQty})`}
                            >
                              <span>{v.size}</span>
                              <span className="text-[9px] opacity-75 ml-0.5">· {v.stockQty}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bottom: Stock indicator & Add action */}
                  <div className="flex items-center justify-between text-[11px] pt-1 text-zinc-400">
                    <span
                      className={`font-medium ${
                        isOutOfStock
                          ? 'text-red-400'
                          : availableStock <= 3
                          ? 'text-amber-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {isOutOfStock ? 'Bitib' : `Qalıq: ${availableStock} əd.`}
                    </span>

                    <button
                      type="button"
                      disabled={isOutOfStock}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectProduct(prod);
                      }}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-white hover:text-black text-white text-xs font-bold transition-colors min-h-[36px]"
                    >
                      + Əlavə et
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
