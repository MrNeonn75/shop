import { Qapik } from '../../shared/utils/money';

export type TransferStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'picking'
  | 'dispatched'
  | 'in_transit'
  | 'partially_received'
  | 'received'
  | 'rejected'
  | 'cancelled';

export interface TransferItem {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantSku: string;
  variantBarcode: string;
  size: string;
  color: string;
  availableAtSource: number; // Snapshot of source available stock at time of selection
  requestedQty: number;      // Tələb olunan say
  pickedQty: number;         // Yığılan faktiki say
  shortPickReason?: string;  // Əskik yığım səbəbi
  dispatchedQty: number;     // Yola salınan say
  receivedQty: number;       // Çatdırılan və qəbul edilən yararlı say
  damagedQty: number;        // Çatdırılmada zədələnmiş say
  missingQty: number;        // Yolda itmiş / çatışmayan say
  remainingInTransit: number;// Hələ də yolda qalan say
  discrepancyReason?: string;// Fərq izahatı
  unitCostQapik: Qapik;
}

export interface TransferTimelineEvent {
  id: string;
  status: TransferStatus;
  timestamp: string; // ISO 8601
  userId: string;
  userName: string;
  userRole: string;
  comment?: string;
}

export interface Transfer {
  id: string;
  transferNumber: string; // e.g. "TR-28M-2026-00012"
  sourceWarehouseId: string;
  sourceWarehouseName: string;
  sourceBranchId: string;
  sourceBranchName: string;
  destinationWarehouseId: string;
  destinationWarehouseName: string;
  destinationBranchId: string;
  destinationBranchName: string;
  status: TransferStatus;
  requestedDate: string;
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  pickingStartedAt?: string;
  dispatchedAt?: string;
  receivedAt?: string;
  createdById: string;
  createdByName: string;
  approvedById?: string;
  approvedByName?: string;
  dispatchedById?: string;
  dispatchedByName?: string;
  receivedById?: string;
  receivedByName?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  notes?: string;
  items: TransferItem[];
  timeline: TransferTimelineEvent[];
}

export interface TransferFilterParams {
  search?: string;
  status?: TransferStatus | 'all';
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateTransferPayload {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  requestedDate: string;
  notes?: string;
  items: Array<{
    variantId: string;
    requestedQty: number;
  }>;
}

export interface UpdatePickingPayload {
  items: Array<{
    itemId: string;
    pickedQty: number;
    shortPickReason?: string;
  }>;
}

export interface ReceiveTransferPayload {
  items: Array<{
    itemId: string;
    receivedQty: number;
    damagedQty: number;
    missingQty: number;
    discrepancyReason?: string;
  }>;
  notes?: string;
}
