import { create } from 'zustand';
import { toQapik } from '../../../shared/utils/money';
import {
  PosCartItem,
  CartTotals,
  CartPromotion,
  CustomerLoyalty,
  PosShift,
  PosRegister,
  LineDiscountType,
  Receipt,
} from '../types';
import { PosService, posServer } from '../services/posService';
import { CatalogProduct, ProductVariant } from '../../catalog/types/catalog';

const CART_STORAGE_KEY = 'bh_pos_active_cart';

interface CartStoragePayload {
  items: PosCartItem[];
  customer?: CustomerLoyalty;
  receiptDiscountType: LineDiscountType;
  receiptDiscountValue: number;
  promoCode?: string;
  redeemPoints: boolean;
  selectedRegisterId?: string;
}

// Accessible Audio Feedback using Web Audio API
class PosAudioFeedback {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  playSuccess() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.08); // A6
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch {
      // Audio might be blocked by browser policy
    }
  }

  playError() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime); // A3
      osc.frequency.setValueAtTime(160, this.ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {
      // Audio block ignored
    }
  }
}

export const posAudio = new PosAudioFeedback();

interface PosState {
  // Session & Shift
  activeShift: PosShift | null;
  registers: PosRegister[];
  selectedRegisterId: string;
  isOnline: boolean;
  isLocked: boolean;
  soundEnabled: boolean;
  scanFeedback: 'success' | 'error' | null;

  // Cart
  items: PosCartItem[];
  selectedItemId: string | null;
  customer: CustomerLoyalty | null;
  receiptDiscountType: LineDiscountType;
  receiptDiscountValue: number;
  promoCode: string;
  redeemPoints: boolean;
  appliedPromotions: CartPromotion[];
  totals: CartTotals;
  currentIdempotencyKey: string;
  activeReceipt: Receipt | null;

  // Modals
  isPaymentModalOpen: boolean;
  isCustomerModalOpen: boolean;
  isDiscountModalOpen: boolean;
  isOpenShiftModalOpen: boolean;
  isCloseShiftModalOpen: boolean;
  isCashInOutModalOpen: boolean;
  isReceiptLookupModalOpen: boolean;
  isReceiptPrintModalOpen: boolean;
  isReturnExchangeModalOpen: boolean;
  isXReportModalOpen: boolean;
  isSuspendModalOpen: boolean;
  isRecallModalOpen: boolean;
  isShortcutsHelpOpen: boolean;
  isLockModalOpen: boolean;

  // Actions
  initialize: (branchId: string, cashierId: string) => Promise<void>;
  setOnline: (status: boolean) => void;
  toggleSound: () => void;
  lockTerminal: () => void;
  unlockTerminal: (pin: string) => boolean;
  selectRegister: (regId: string) => void;
  setActiveShift: (shift: PosShift | null) => void;

  // Cart Actions
  addItem: (product: CatalogProduct, variant?: ProductVariant, quantity?: number) => Promise<boolean>;
  updateQuantity: (lineId: string, quantity: number) => void;
  setLineDiscount: (lineId: string, type: LineDiscountType, value: number) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  setSelectedItemId: (lineId: string | null) => void;
  setCustomer: (customer: CustomerLoyalty | null) => void;
  setReceiptDiscount: (type: LineDiscountType, value: number) => void;
  setPromoCode: (code: string) => void;
  toggleRedeemPoints: () => void;
  recalculateTotals: () => Promise<void>;
  reconcileWithServer: (branchId: string) => Promise<void>;
  restoreCartFromSuspended: (items: PosCartItem[], customer?: CustomerLoyalty) => void;

  // Modal Toggles
  setPaymentModalOpen: (open: boolean) => void;
  setCustomerModalOpen: (open: boolean) => void;
  setDiscountModalOpen: (open: boolean) => void;
  setOpenShiftModalOpen: (open: boolean) => void;
  setCloseShiftModalOpen: (open: boolean) => void;
  setCashInOutModalOpen: (open: boolean) => void;
  setReceiptLookupModalOpen: (open: boolean) => void;
  setReceiptPrintModalOpen: (open: boolean) => void;
  setReturnExchangeModalOpen: (open: boolean) => void;
  setXReportModalOpen: (open: boolean) => void;
  setSuspendModalOpen: (open: boolean) => void;
  setRecallModalOpen: (open: boolean) => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  setLockModalOpen: (open: boolean) => void;
  setActiveReceipt: (receipt: Receipt | null) => void;
  generateNewIdempotencyKey: () => void;
}

export const usePosStore = create<PosState>((set, get) => ({
  activeShift: null,
  registers: [],
  selectedRegisterId: '',
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isLocked: false,
  soundEnabled: true,
  scanFeedback: null,

  items: [],
  selectedItemId: null,
  customer: null,
  receiptDiscountType: 'none',
  receiptDiscountValue: 0,
  promoCode: '',
  redeemPoints: false,
  appliedPromotions: [],
  totals: PosService.calculateTotals([]),
  currentIdempotencyKey: `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
  activeReceipt: null,

  isPaymentModalOpen: false,
  isCustomerModalOpen: false,
  isDiscountModalOpen: false,
  isOpenShiftModalOpen: false,
  isCloseShiftModalOpen: false,
  isCashInOutModalOpen: false,
  isReceiptLookupModalOpen: false,
  isReceiptPrintModalOpen: false,
  isReturnExchangeModalOpen: false,
  isXReportModalOpen: false,
  isSuspendModalOpen: false,
  isRecallModalOpen: false,
  isShortcutsHelpOpen: false,
  isLockModalOpen: false,

  initialize: async (branchId: string, _cashierId: string) => {
    // 1. Listen for network changes
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => set({ isOnline: true }));
      window.addEventListener('offline', () => set({ isOnline: false }));
    }

    // 2. Fetch registers
    const registers = await PosService.getRegisters(branchId);
    let selectedReg = registers[0]?.id || '';

    // 3. Try to restore saved cart
    let restoredPayload: CartStoragePayload | null = null;
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        restoredPayload = JSON.parse(raw);
        if (restoredPayload?.selectedRegisterId) {
          selectedReg = restoredPayload.selectedRegisterId;
        }
      }
    } catch {
      // Ignored
    }

    set({ registers, selectedRegisterId: selectedReg });

    // 4. Fetch active shift for register
    if (selectedReg) {
      const shift = await PosService.getActiveShift(branchId, selectedReg);
      set({ activeShift: shift });
    }

    // 5. Restore cart items
    if (restoredPayload && restoredPayload.items?.length > 0) {
      set({
        items: restoredPayload.items,
        customer: restoredPayload.customer || null,
        receiptDiscountType: restoredPayload.receiptDiscountType || 'none',
        receiptDiscountValue: restoredPayload.receiptDiscountValue || 0,
        promoCode: restoredPayload.promoCode || '',
        redeemPoints: restoredPayload.redeemPoints || false,
      });
      await get().reconcileWithServer(branchId);
    }
  },

  setOnline: (status) => set({ isOnline: status }),

  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),

  lockTerminal: () => set({ isLocked: true, isLockModalOpen: true }),

  unlockTerminal: (pin) => {
    // Allow cashier/manager PIN (e.g. 1234 or 9999 or any 4 digit)
    if (pin.length >= 4) {
      set({ isLocked: false, isLockModalOpen: false });
      return true;
    }
    return false;
  },

  selectRegister: async (regId) => {
    set({ selectedRegisterId: regId });
    const shift = await PosService.getActiveShift(
      get().registers.find((r) => r.id === regId)?.branchId || 'branch-2',
      regId
    );
    set({ activeShift: shift });
  },

  setActiveShift: (shift) => set({ activeShift: shift }),

  generateNewIdempotencyKey: () =>
    set({
      currentIdempotencyKey: `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    }),

  addItem: async (product, variant, quantity = 1) => {
    const state = get();
    const selVariant = variant || product.variants[0];
    const variantId = selVariant?.id || 'default';
    const size = selVariant?.size || 'Standart';
    const color = selVariant?.color || 'Standart';
    const availableStock = selVariant?.stockQty ?? product.stockQty;

    // Check negative stock policy
    if (availableStock <= 0 && posServer.negativeStockPolicy === 'blocked') {
      if (state.soundEnabled) posAudio.playError();
      set({ scanFeedback: 'error' });
      setTimeout(() => set({ scanFeedback: null }), 800);
      return false;
    }

    // Check if line already exists
    const existingIndex = state.items.findIndex(
      (i) => i.productId === product.id && i.variantId === variantId
    );

    let nextItems: PosCartItem[];

    if (existingIndex >= 0) {
      const existing = state.items[existingIndex];
      const newQty = existing.quantity + quantity;

      if (newQty > availableStock && posServer.negativeStockPolicy === 'blocked') {
        if (state.soundEnabled) posAudio.playError();
        set({ scanFeedback: 'error' });
        setTimeout(() => set({ scanFeedback: null }), 800);
        return false;
      }

      const updatedItem: PosCartItem = {
        ...existing,
        quantity: newQty,
        lineTotalQapik: toQapik(existing.unitPriceQapik * newQty - existing.lineDiscountAmountQapik),
      };

      nextItems = [...state.items];
      nextItems[existingIndex] = updatedItem;
    } else {
      const unitPriceQapik = product.priceQapik;
      const newItem: PosCartItem = {
        id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        barcode: product.barcode,
        variantId,
        size,
        color,
        unitPriceQapik,
        originalUnitPriceQapik: unitPriceQapik,
        quantity,
        lineDiscountType: 'none',
        lineDiscountValue: 0,
        lineDiscountAmountQapik: toQapik(0),
        lineTotalQapik: toQapik(unitPriceQapik * quantity),
        taxRatePercent: 18,
        taxAmountQapik: toQapik(Math.round((unitPriceQapik * quantity * 18) / 118)),
        serverStockAvailable: availableStock,
      };

      nextItems = [newItem, ...state.items];
    }

    if (state.soundEnabled) posAudio.playSuccess();
    set({ items: nextItems, scanFeedback: 'success' });
    setTimeout(() => set({ scanFeedback: null }), 500);

    await get().recalculateTotals();
    return true;
  },

  updateQuantity: (lineId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(lineId);
      return;
    }

    const nextItems = get().items.map((item) => {
      if (item.id === lineId) {
        let discountQapik = toQapik(0);
        if (item.lineDiscountType === 'percent') {
          discountQapik = toQapik(
            Math.round((item.unitPriceQapik * quantity * item.lineDiscountValue) / 100)
          );
        } else if (item.lineDiscountType === 'fixed') {
          discountQapik = toQapik(item.lineDiscountValue);
        }

        const lineTotal = toQapik(
          Math.max(0, item.unitPriceQapik * quantity - discountQapik)
        );

        return {
          ...item,
          quantity,
          lineDiscountAmountQapik: discountQapik,
          lineTotalQapik: lineTotal,
        };
      }
      return item;
    });

    set({ items: nextItems });
    get().recalculateTotals();
  },

  setLineDiscount: (lineId, type, value) => {
    const nextItems = get().items.map((item) => {
      if (item.id === lineId) {
        let discountQapik = toQapik(0);
        if (type === 'percent') {
          const pct = Math.min(100, Math.max(0, value));
          discountQapik = toQapik(
            Math.round((item.unitPriceQapik * item.quantity * pct) / 100)
          );
        } else if (type === 'fixed') {
          discountQapik = toQapik(Math.min(item.unitPriceQapik * item.quantity, value));
        }

        const lineTotal = toQapik(
          Math.max(0, item.unitPriceQapik * item.quantity - discountQapik)
        );

        return {
          ...item,
          lineDiscountType: type,
          lineDiscountValue: value,
          lineDiscountAmountQapik: discountQapik,
          lineTotalQapik: lineTotal,
        };
      }
      return item;
    });

    set({ items: nextItems });
    get().recalculateTotals();
  },

  removeItem: (lineId) => {
    const nextItems = get().items.filter((i) => i.id !== lineId);
    set({
      items: nextItems,
      selectedItemId: get().selectedItemId === lineId ? null : get().selectedItemId,
    });
    get().recalculateTotals();
  },

  clearCart: () => {
    set({
      items: [],
      selectedItemId: null,
      customer: null,
      receiptDiscountType: 'none',
      receiptDiscountValue: 0,
      promoCode: '',
      redeemPoints: false,
      appliedPromotions: [],
      totals: PosService.calculateTotals([]),
    });
    localStorage.removeItem(CART_STORAGE_KEY);
    get().generateNewIdempotencyKey();
  },

  setSelectedItemId: (lineId) => set({ selectedItemId: lineId }),

  setCustomer: (customer) => {
    set({ customer });
    get().recalculateTotals();
  },

  setReceiptDiscount: (type, value) => {
    set({ receiptDiscountType: type, receiptDiscountValue: value });
    get().recalculateTotals();
  },

  setPromoCode: (code) => {
    set({ promoCode: code });
    get().recalculateTotals();
  },

  toggleRedeemPoints: () => {
    set((s) => ({ redeemPoints: !s.redeemPoints }));
    get().recalculateTotals();
  },

  recalculateTotals: async () => {
    const s = get();
    const promotions = await PosService.evaluatePromotions(
      s.items,
      s.customer || undefined,
      s.promoCode,
      s.redeemPoints
    );

    const totals = PosService.calculateTotals(
      s.items,
      s.receiptDiscountType,
      s.receiptDiscountValue,
      promotions
    );

    set({ appliedPromotions: promotions, totals });

    // Persist cart to localStorage
    const payload: CartStoragePayload = {
      items: s.items,
      customer: s.customer || undefined,
      receiptDiscountType: s.receiptDiscountType,
      receiptDiscountValue: s.receiptDiscountValue,
      promoCode: s.promoCode,
      redeemPoints: s.redeemPoints,
      selectedRegisterId: s.selectedRegisterId,
    };
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Local storage full/error ignored
    }
  },

  reconcileWithServer: async (branchId: string) => {
    const s = get();
    if (s.items.length === 0) return;

    try {
      const res = await PosService.validateCart(s.items, branchId);
      if (res.updatedItems) {
        set({ items: res.updatedItems });
      }
      await get().recalculateTotals();
    } catch {
      // Offline or network error
    }
  },

  restoreCartFromSuspended: (items, customer) => {
    set({
      items,
      customer: customer || null,
      selectedItemId: null,
      receiptDiscountType: 'none',
      receiptDiscountValue: 0,
      promoCode: '',
      redeemPoints: false,
    });
    get().recalculateTotals();
  },

  setPaymentModalOpen: (open) => set({ isPaymentModalOpen: open }),
  setCustomerModalOpen: (open) => set({ isCustomerModalOpen: open }),
  setDiscountModalOpen: (open) => set({ isDiscountModalOpen: open }),
  setOpenShiftModalOpen: (open) => set({ isOpenShiftModalOpen: open }),
  setCloseShiftModalOpen: (open) => set({ isCloseShiftModalOpen: open }),
  setCashInOutModalOpen: (open) => set({ isCashInOutModalOpen: open }),
  setReceiptLookupModalOpen: (open) => set({ isReceiptLookupModalOpen: open }),
  setReceiptPrintModalOpen: (open) => set({ isReceiptPrintModalOpen: open }),
  setReturnExchangeModalOpen: (open) => set({ isReturnExchangeModalOpen: open }),
  setXReportModalOpen: (open) => set({ isXReportModalOpen: open }),
  setSuspendModalOpen: (open) => set({ isSuspendModalOpen: open }),
  setRecallModalOpen: (open) => set({ isRecallModalOpen: open }),
  setShortcutsHelpOpen: (open) => set({ isShortcutsHelpOpen: open }),
  setLockModalOpen: (open) => set({ isLockModalOpen: open }),
  setActiveReceipt: (receipt) => set({ activeReceipt: receipt }),
}));
