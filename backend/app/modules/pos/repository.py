"""POS Modulu Verilənlər Bazası Repozitorisi (POS Repository)."""

from __future__ import annotations

import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.pos.models import (
    CashMovement,
    PaymentAttempt,
    PosCart,
    PosShift,
    UsedApprovalToken,
)


class PosRepository:
    """POS əməliyyatlarının verilənlər bazası repozitorisi."""

    def __init__(self, session: AsyncSession | None = None) -> None:
        self._session = session

    # --- Kassa Növbələri (Shifts) ---

    async def get_shift_by_id(
        self, session: AsyncSession, shift_id: uuid.UUID, for_update: bool = False
    ) -> PosShift | None:
        stmt = (
            select(PosShift)
            .options(selectinload(PosShift.cash_movements))
            .where(PosShift.id == shift_id)
        )
        if for_update:
            stmt = stmt.with_for_update()
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_active_shift_by_register(
        self, session: AsyncSession, register_id: uuid.UUID, for_update: bool = False
    ) -> PosShift | None:
        stmt = (
            select(PosShift)
            .options(selectinload(PosShift.cash_movements))
            .where(PosShift.register_id == register_id, PosShift.status == "OPEN")
        )
        if for_update:
            stmt = stmt.with_for_update()
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_active_shift_by_cashier(
        self, session: AsyncSession, cashier_id: uuid.UUID
    ) -> PosShift | None:
        stmt = select(PosShift).where(PosShift.cashier_id == cashier_id, PosShift.status == "OPEN")
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_shift(self, session: AsyncSession, shift: PosShift) -> PosShift:
        session.add(shift)
        await session.flush()
        return shift

    async def update_shift(self, session: AsyncSession, shift: PosShift) -> PosShift:
        await session.flush()
        return shift

    async def list_shifts(
        self,
        session: AsyncSession,
        branch_id: uuid.UUID | None = None,
        register_id: uuid.UUID | None = None,
        cashier_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PosShift]:
        stmt = select(PosShift).order_by(desc(PosShift.opened_at))
        if branch_id:
            stmt = stmt.where(PosShift.branch_id == branch_id)
        if register_id:
            stmt = stmt.where(PosShift.register_id == register_id)
        if cashier_id:
            stmt = stmt.where(PosShift.cashier_id == cashier_id)
        if status:
            stmt = stmt.where(PosShift.status == status)

        stmt = stmt.offset(offset).limit(limit)
        res = await session.execute(stmt)
        return list(res.scalars().all())

    # --- Nağd Pul Hərəkətləri (Cash Movements) ---

    async def create_cash_movement(
        self, session: AsyncSession, movement: CashMovement
    ) -> CashMovement:
        session.add(movement)
        await session.flush()
        return movement

    async def list_cash_movements_by_shift(
        self, session: AsyncSession, shift_id: uuid.UUID
    ) -> list[CashMovement]:
        stmt = (
            select(CashMovement)
            .where(CashMovement.shift_id == shift_id)
            .order_by(CashMovement.created_at)
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    # --- Saxlanılmış Səbətlər (Carts) ---

    async def create_cart(self, session: AsyncSession, cart: PosCart) -> PosCart:
        session.add(cart)
        await session.flush()
        return cart

    async def get_cart_by_id(self, session: AsyncSession, cart_id: uuid.UUID) -> PosCart | None:
        stmt = select(PosCart).where(PosCart.id == cart_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_active_carts(self, session: AsyncSession, branch_id: uuid.UUID) -> list[PosCart]:
        stmt = (
            select(PosCart)
            .where(PosCart.branch_id == branch_id, PosCart.status == "SUSPENDED")
            .order_by(desc(PosCart.suspended_at))
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def update_cart(self, session: AsyncSession, cart: PosCart) -> PosCart:
        await session.flush()
        return cart

    # --- Ödəniş Cəhdləri (Payment Attempts) ---

    async def create_payment_attempt(
        self, session: AsyncSession, attempt: PaymentAttempt
    ) -> PaymentAttempt:
        session.add(attempt)
        await session.flush()
        return attempt

    async def get_payment_attempt_by_idempotency_key(
        self, session: AsyncSession, company_id: uuid.UUID, idempotency_key: str
    ) -> PaymentAttempt | None:
        stmt = select(PaymentAttempt).where(
            PaymentAttempt.company_id == company_id,
            PaymentAttempt.idempotency_key == idempotency_key,
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def update_payment_attempt(
        self, session: AsyncSession, attempt: PaymentAttempt
    ) -> PaymentAttempt:
        await session.flush()
        return attempt

    # --- İstifadə Edilmiş Menecer Tokenləri (Used Approval Tokens) ---

    async def is_approval_token_used(self, session: AsyncSession, jti: str) -> bool:
        stmt = (
            select(func.count()).select_from(UsedApprovalToken).where(UsedApprovalToken.jti == jti)
        )
        cnt = await session.scalar(stmt)
        return (cnt or 0) > 0

    async def record_used_approval_token(
        self, session: AsyncSession, used_token: UsedApprovalToken
    ) -> UsedApprovalToken:
        session.add(used_token)
        await session.flush()
        return used_token
