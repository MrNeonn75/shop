import { describe, it, expect, beforeEach } from 'vitest';
import { MockInventoryAdapter } from '../src/shared/adapters/mock/mockInventoryAdapter';
import { SEEDED_CATALOG_PRODUCTS } from '../src/features/catalog/data/taxonomyData';

describe('Transfer Lifecycle & State Machine Engine', () => {
  let adapter: MockInventoryAdapter;

  beforeEach(() => {
    adapter = new MockInventoryAdapter();
  });

  it('rejects transfer creation when source and destination warehouses are identical', async () => {
    const v = SEEDED_CATALOG_PRODUCTS[0].variants[0];

    await expect(
      adapter.createTransfer({
        sourceWarehouseId: 'wh-1',
        destinationWarehouseId: 'wh-1',
        requestedDate: '2026-10-15',
        items: [{ variantId: v.id, requestedQty: 2 }],
      })
    ).rejects.toThrow(/eyni ola bilməz/);
  });

  it('rejects transfer creation when requested quantity exceeds available stock at source', async () => {
    const v = SEEDED_CATALOG_PRODUCTS[0].variants[0];

    await expect(
      adapter.createTransfer({
        sourceWarehouseId: 'wh-1',
        destinationWarehouseId: 'wh-2',
        requestedDate: '2026-10-15',
        items: [{ variantId: v.id, requestedQty: 999999 }],
      })
    ).rejects.toThrow(/yetərli sərbəst qalıq yoxdur/);
  });

  it('executes full happy path transfer workflow from draft to received', async () => {
    const v = SEEDED_CATALOG_PRODUCTS[0].variants[0];

    // 1. Create Draft
    const transfer = await adapter.createTransfer({
      sourceWarehouseId: 'wh-1',
      destinationWarehouseId: 'wh-2',
      requestedDate: '2026-10-15',
      notes: 'Filial vitrin ehtiyacı',
      items: [{ variantId: v.id, requestedQty: 2 }],
    });
    expect(transfer.status).toBe('draft');
    expect(transfer.items[0].requestedQty).toBe(2);

    // 2. Submit for Approval
    const submitted = await adapter.submitTransfer(transfer.id);
    expect(submitted.status).toBe('submitted');

    // 3. Approve
    const approved = await adapter.approveTransfer(submitted.id, 'Təsdiqləndi');
    expect(approved.status).toBe('approved');

    // 4. Start Picking
    const picking = await adapter.startPicking(approved.id);
    expect(picking.status).toBe('picking');

    // 5. Dispatch (Stock leaves source warehouse and moves to transit)
    const dispatched = await adapter.dispatchTransfer(picking.id);
    expect(dispatched.status).toBe('dispatched');
    expect(dispatched.items[0].dispatchedQty).toBe(2);
    expect(dispatched.items[0].remainingInTransit).toBe(2);

    // Verify ledger has generated transfer_out movement
    const movements = await adapter.getMovements({ docNumber: dispatched.transferNumber });
    const outMv = movements.items.find((m) => m.type === 'transfer_out');
    expect(outMv).toBeDefined();
    expect(outMv?.fromWarehouseId).toBe('wh-1');
    expect(outMv?.toWarehouseId).toBe('wh-4'); // Transit warehouse
    expect(outMv?.quantity).toBe(2);

    // 6. Receive at Destination
    const received = await adapter.receiveTransfer(dispatched.id, {
      items: [
        {
          itemId: dispatched.items[0].id,
          receivedQty: 2,
          damagedQty: 0,
          missingQty: 0,
        },
      ],
    });

    expect(received.status).toBe('received');
    expect(received.items[0].receivedQty).toBe(2);
    expect(received.items[0].remainingInTransit).toBe(0);

    // Verify ledger has generated transfer_in movement to destination
    const updatedMovements = await adapter.getMovements({ docNumber: dispatched.transferNumber });
    const inMv = updatedMovements.items.find((m) => m.type === 'transfer_in');
    expect(inMv).toBeDefined();
    expect(inMv?.toWarehouseId).toBe('wh-2');
    expect(inMv?.quantity).toBe(2);
  });

  it('handles partial receiving keeping unfulfilled quantity in transit', async () => {
    const v = SEEDED_CATALOG_PRODUCTS[0].variants[0];

    // Create & Fast-forward to dispatched
    const transfer = await adapter.createTransfer({
      sourceWarehouseId: 'wh-1',
      destinationWarehouseId: 'wh-2',
      requestedDate: '2026-10-15',
      items: [{ variantId: v.id, requestedQty: 10 }],
    });
    await adapter.submitTransfer(transfer.id);
    await adapter.approveTransfer(transfer.id);
    await adapter.startPicking(transfer.id);
    const dispatched = await adapter.dispatchTransfer(transfer.id);

    // Receive only 6 of 10 items (partial receipt)
    const partial = await adapter.receiveTransfer(dispatched.id, {
      items: [
        {
          itemId: dispatched.items[0].id,
          receivedQty: 6,
          damagedQty: 0,
          missingQty: 0,
          discrepancyReason: 'Kuryer maşınına yalnız 1-ci hissə sığdı',
        },
      ],
    });

    expect(partial.status).toBe('partially_received');
    expect(partial.items[0].receivedQty).toBe(6);
    expect(partial.items[0].remainingInTransit).toBe(4); // 4 remains in transit!

    // Receive second batch (remaining 4 items)
    const finalized = await adapter.receiveTransfer(partial.id, {
      items: [
        {
          itemId: partial.items[0].id,
          receivedQty: 4,
          damagedQty: 0,
          missingQty: 0,
        },
      ],
    });

    expect(finalized.status).toBe('received');
    expect(finalized.items[0].receivedQty).toBe(10);
    expect(finalized.items[0].remainingInTransit).toBe(0);
  });

  it('prevents double receipt and throws 409 conflict when transfer is already completed', async () => {
    const v = SEEDED_CATALOG_PRODUCTS[0].variants[0];

    const transfer = await adapter.createTransfer({
      sourceWarehouseId: 'wh-1',
      destinationWarehouseId: 'wh-2',
      requestedDate: '2026-10-15',
      items: [{ variantId: v.id, requestedQty: 3 }],
    });
    await adapter.submitTransfer(transfer.id);
    await adapter.approveTransfer(transfer.id);
    await adapter.startPicking(transfer.id);
    await adapter.dispatchTransfer(transfer.id);

    // First receive succeeds
    await adapter.receiveTransfer(transfer.id, {
      items: [{ itemId: transfer.items[0].id, receivedQty: 3, damagedQty: 0, missingQty: 0 }],
    });

    // Second receive on same transfer MUST be rejected with conflict
    await expect(
      adapter.receiveTransfer(transfer.id, {
        items: [{ itemId: transfer.items[0].id, receivedQty: 3, damagedQty: 0, missingQty: 0 }],
      })
    ).rejects.toThrow(/təkrarlana bilməz|Konflikt/);
  });

  it('allows cancellation only before dispatch and prohibits cancellation once goods are in transit', async () => {
    const v = SEEDED_CATALOG_PRODUCTS[0].variants[0];

    // Cancellation in draft status succeeds
    const tDraft = await adapter.createTransfer({
      sourceWarehouseId: 'wh-1',
      destinationWarehouseId: 'wh-2',
      requestedDate: '2026-10-15',
      items: [{ variantId: v.id, requestedQty: 2 }],
    });
    const cancelled = await adapter.cancelTransfer(tDraft.id, 'Sifariş ləğv edildi');
    expect(cancelled.status).toBe('cancelled');

    // Create another transfer and dispatch it
    const tDispatched = await adapter.createTransfer({
      sourceWarehouseId: 'wh-1',
      destinationWarehouseId: 'wh-2',
      requestedDate: '2026-10-15',
      items: [{ variantId: v.id, requestedQty: 2 }],
    });
    await adapter.submitTransfer(tDispatched.id);
    await adapter.approveTransfer(tDispatched.id);
    await adapter.startPicking(tDispatched.id);
    await adapter.dispatchTransfer(tDispatched.id);

    // Cancellation after dispatch MUST be blocked
    await expect(
      adapter.cancelTransfer(tDispatched.id, 'Ləğv etmək istəyirəm')
    ).rejects.toThrow(/Yola salınmış.*ləğv edilə bilməz/);
  });
});
