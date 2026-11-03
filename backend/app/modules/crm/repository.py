"""CRM Modulu Verilənlər Bazası Repozitorisi (Repository)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import utc_now
from app.modules.crm.models import (
    ConsentStatus,
    Customer,
    CustomerConsentRecord,
    CustomerPrivacyRequest,
    CustomerSegment,
    SegmentMembership,
)


class CrmRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ==========================================
    # 1. CUSTOMERS
    # ==========================================

    async def get_customer(self, customer_id: uuid.UUID) -> Customer | None:
        stmt = (
            select(Customer)
            .options(selectinload(Customer.consents))
            .where(Customer.id == customer_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_customer_by_no(self, customer_no: str) -> Customer | None:
        stmt = select(Customer).where(Customer.customer_no == customer_no)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_customer_by_phone(self, phone: str) -> Customer | None:
        stmt = select(Customer).where(Customer.phone == phone)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_customer_by_email(self, email: str) -> Customer | None:
        stmt = select(Customer).where(Customer.email == email)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_customer(self, customer: Customer) -> Customer:
        self.session.add(customer)
        await self.session.flush()
        return customer

    async def list_customers(
        self,
        search: str | None = None,
        branch_id: uuid.UUID | None = None,
        status_: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Customer]:
        stmt = select(Customer).where(Customer.is_tombstone.is_(False))
        if branch_id:
            stmt = stmt.where(Customer.source_branch_id == branch_id)
        if status_:
            stmt = stmt.where(Customer.status == status_)
        if search and search.strip():
            s = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    Customer.full_name.ilike(s),
                    Customer.customer_no.ilike(s),
                    Customer.phone.ilike(s),
                    Customer.email.ilike(s),
                )
            )
        stmt = stmt.order_by(Customer.created_at.desc()).limit(limit).offset(offset)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def find_duplicates(
        self,
        phone: str | None = None,
        email: str | None = None,
        full_name: str | None = None,
        exclude_id: uuid.UUID | None = None,
    ) -> Sequence[Customer]:
        conditions = []
        if phone:
            from app.modules.crm.phone import normalize_phone

            norm_p = normalize_phone(phone)
            conditions.append(or_(Customer.phone == phone, Customer.phone == norm_p))
        if email:
            em = email.strip().lower()
            conditions.append(or_(Customer.email == email, Customer.email == em))
        if full_name and len(full_name.strip()) >= 4:
            conditions.append(Customer.full_name.ilike(f"%{full_name.strip()}%"))

        if not conditions:
            return []

        stmt = select(Customer).where(
            Customer.is_tombstone.is_(False),
            or_(*conditions),
        )
        if exclude_id:
            stmt = stmt.where(Customer.id != exclude_id)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    # ==========================================
    # 2. CONSENT
    # ==========================================

    async def add_consent(self, consent: CustomerConsentRecord) -> CustomerConsentRecord:
        self.session.add(consent)
        await self.session.flush()
        return consent

    async def list_consents_for_customer(
        self, customer_id: uuid.UUID
    ) -> Sequence[CustomerConsentRecord]:
        stmt = (
            select(CustomerConsentRecord)
            .where(CustomerConsentRecord.customer_id == customer_id)
            .order_by(CustomerConsentRecord.timestamp.desc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def get_latest_consent(
        self, customer_id: uuid.UUID, purpose: str
    ) -> CustomerConsentRecord | None:
        stmt = (
            select(CustomerConsentRecord)
            .where(
                CustomerConsentRecord.customer_id == customer_id,
                CustomerConsentRecord.purpose == purpose,
            )
            .order_by(CustomerConsentRecord.timestamp.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_customers_with_consent(
        self, customer_ids: list[uuid.UUID], purpose: str
    ) -> set[uuid.UUID]:
        """Verilmiş müştərilər arasından həmin məqsəd üçün son razılığı GRANTED olanları seçir."""
        if not customer_ids:
            return set()

        # Hər müştəri üçün ən son razılıq qeydini yoxlayırıq
        stmt = (
            select(CustomerConsentRecord.customer_id, CustomerConsentRecord.status)
            .where(
                CustomerConsentRecord.customer_id.in_(customer_ids),
                CustomerConsentRecord.purpose == purpose,
            )
            .order_by(CustomerConsentRecord.timestamp.desc())
        )
        res = await self.session.execute(stmt)
        seen: set[uuid.UUID] = set()
        granted: set[uuid.UUID] = set()
        for c_id, st in res.all():
            if c_id not in seen:
                seen.add(c_id)
                if st == ConsentStatus.GRANTED.value:
                    granted.add(c_id)
        return granted

    # ==========================================
    # 3. SEGMENTS
    # ==========================================

    async def create_segment(self, segment: CustomerSegment) -> CustomerSegment:
        self.session.add(segment)
        await self.session.flush()
        return segment

    async def get_segment(self, segment_id: uuid.UUID) -> CustomerSegment | None:
        stmt = select(CustomerSegment).where(CustomerSegment.id == segment_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_segments(self) -> Sequence[CustomerSegment]:
        stmt = select(CustomerSegment).order_by(CustomerSegment.name.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def replace_segment_members(
        self, segment_id: uuid.UUID, customer_ids: list[uuid.UUID]
    ) -> int:
        # Əvvəlki üzvlükləri silirik
        await self.session.execute(
            delete(SegmentMembership).where(SegmentMembership.segment_id == segment_id)
        )
        now = utc_now()
        members = [
            SegmentMembership(segment_id=segment_id, customer_id=cid, added_at=now)
            for cid in set(customer_ids)
        ]
        self.session.add_all(members)
        await self.session.flush()
        return len(members)

    async def list_segment_customer_ids(self, segment_id: uuid.UUID) -> list[uuid.UUID]:
        stmt = select(SegmentMembership.customer_id).where(
            SegmentMembership.segment_id == segment_id
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    # ==========================================
    # 4. PRIVACY REQUESTS
    # ==========================================

    async def create_privacy_request(
        self, req: CustomerPrivacyRequest
    ) -> CustomerPrivacyRequest:
        self.session.add(req)
        await self.session.flush()
        return req

    async def get_privacy_request(
        self, req_id: uuid.UUID
    ) -> CustomerPrivacyRequest | None:
        stmt = select(CustomerPrivacyRequest).where(CustomerPrivacyRequest.id == req_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_privacy_requests(self) -> Sequence[CustomerPrivacyRequest]:
        stmt = select(CustomerPrivacyRequest).order_by(CustomerPrivacyRequest.created_at.desc())
        res = await self.session.execute(stmt)
        return res.scalars().all()
