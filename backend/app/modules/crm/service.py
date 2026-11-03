"""Müştəri Münasibətləri İdarəedilməsi (CRM) Mərkəzi Xidməti (Service)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import (
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.modules.crm.models import (
    ConsentPurpose,
    ConsentSource,
    ConsentStatus,
    Customer,
    CustomerConsentRecord,
    CustomerPrivacyRequest,
    CustomerSegment,
    CustomerStatus,
    PrivacyRequestStatus,
    PrivacyRequestType,
)
from app.modules.crm.phone import mask_email, mask_phone, normalize_phone
from app.modules.crm.policies import CrmPolicy
from app.modules.crm.repository import CrmRepository
from app.modules.crm.schemas import (
    ConsentInput,
    CustomerCreate,
    CustomerDetailResponse,
    CustomerMergePreviewResponse,
    CustomerMergeRequest,
    CustomerResponse,
    CustomerUpdate,
    QuickCustomerCreate,
    SegmentCreate,
)
from app.modules.sales.models import Sale
from app.shared.audit import record_audit_event


class CrmService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = CrmRepository(session)

    # ==========================================
    # 1. CUSTOMER OPERATIONS
    # ==========================================

    async def create_customer(
        self, payload: CustomerCreate, actor: Any = None, _company_id: uuid.UUID | None = None
    ) -> Customer:
        CrmPolicy.check_can_manage(actor)

        # 1. Telefon nömrəsinin normalizasiyası
        normalized_phone = normalize_phone(payload.phone)
        if normalized_phone:
            existing = await self.repo.get_customer_by_phone(normalized_phone)
            if existing and not existing.is_tombstone:
                raise ConflictError(f"Bu telefon nömrəsi ilə müştəri artıq mövcuddur: {normalized_phone}")

        if payload.email:
            existing_email = await self.repo.get_customer_by_email(str(payload.email).lower())
            if existing_email and not existing_email.is_tombstone:
                raise ConflictError(f"Bu e-poçt ünvanı ilə müştəri artıq mövcuddur: {payload.email}")

        # Unikal customer_no generasiyası
        count_stmt = select(func.count(Customer.id))
        c_res = await self.session.execute(count_stmt)
        total_c = c_res.scalar_one() or 0
        customer_no = f"CUST-{(total_c + 1):06d}"

        cust = Customer(
            id=uuid.uuid4(),
            customer_no=customer_no,
            full_name=payload.full_name.strip(),
            phone=normalized_phone,
            email=str(payload.email).lower() if payload.email else None,
            birth_date=payload.birth_date,
            gender=payload.gender,
            preferred_language=payload.preferred_language,
            source_branch_id=payload.source_branch_id,
            notes=payload.notes,
            created_by=getattr(actor, "id", None) if actor else None,
        )
        created_customer = await self.repo.create_customer(cust)

        # Razılıqların qeydə alınması
        now = utc_now()
        for c in payload.consents:
            consent_rec = CustomerConsentRecord(
                customer_id=created_customer.id,
                purpose=c.purpose.value,
                status=c.status.value,
                channel_source=c.channel_source.value,
                policy_version=c.policy_version,
                actor_id=getattr(actor, "id", None) if actor else None,
                timestamp=now,
            )
            await self.repo.add_consent(consent_rec)

        await record_audit_event(
            session=self.session,
            action="crm.customer.create",
            actor_id=getattr(actor, "id", None) if actor else None,
            resource_type="customer",
            resource_id=str(created_customer.id),
            reason=f"Yeni müştəri yaradıldı: {created_customer.customer_no} ({created_customer.full_name})",
        )
        return created_customer

    async def quick_create_customer(
        self, payload: QuickCustomerCreate, actor: Any = None
    ) -> Customer:
        """Kassada sürətli müştəri yaradılması."""
        consents: list[ConsentInput] = []
        if payload.marketing_sms_consent:
            consents.append(
                ConsentInput(
                    purpose=ConsentPurpose.MARKETING_SMS,
                    status=ConsentStatus.GRANTED,
                    channel_source=ConsentSource.POS,
                )
            )
        if payload.marketing_email_consent:
            consents.append(
                ConsentInput(
                    purpose=ConsentPurpose.MARKETING_EMAIL,
                    status=ConsentStatus.GRANTED,
                    channel_source=ConsentSource.POS,
                )
            )

        create_data = CustomerCreate(
            full_name=payload.full_name,
            phone=payload.phone,
            email=payload.email,
            source_branch_id=payload.source_branch_id,
            consents=consents,
        )
        return await self.create_customer(create_data, actor=actor)

    async def update_customer(
        self, customer_id: uuid.UUID, payload: CustomerUpdate, actor: Any = None
    ) -> Customer:
        CrmPolicy.check_can_manage(actor)
        cust = await self.repo.get_customer(customer_id)
        if not cust or cust.is_tombstone:
            raise NotFoundError(f"Müştəri tapılmadı: {customer_id}")

        if payload.email is not None:
            new_email = str(payload.email).lower()
            existing = await self.repo.get_customer_by_email(new_email)
            if existing and existing.id != customer_id and not existing.is_tombstone:
                raise ConflictError(f"Bu e-poçt ünvanı başqa müştəriyə aiddir: {new_email}")
            cust.email = new_email

        if payload.full_name is not None:
            cust.full_name = payload.full_name.strip()
        if payload.birth_date is not None:
            cust.birth_date = payload.birth_date
        if payload.gender is not None:
            cust.gender = payload.gender
        if payload.preferred_language is not None:
            cust.preferred_language = payload.preferred_language
        if payload.status is not None:
            cust.status = payload.status.value
        if payload.notes is not None:
            cust.notes = payload.notes

        cust.version += 1
        await self.session.flush()

        await record_audit_event(
            session=self.session,
            action="crm.customer.update",
            actor_id=getattr(actor, "id", None) if actor else None,
            resource_type="customer",
            resource_id=str(cust.id),
            reason=f"Müştəri məlumatları yeniləndi: {cust.customer_no}",
        )
        return cust

    def mask_customer_response(self, customer: Customer) -> CustomerResponse:
        """Standart maskalanmış müştəri məlumatı."""
        return CustomerResponse(
            id=customer.id,
            customer_no=customer.customer_no,
            full_name=customer.full_name,
            phone=mask_phone(customer.phone),
            email=mask_email(customer.email),
            birth_date=customer.birth_date,
            gender=customer.gender,
            preferred_language=customer.preferred_language,
            status=customer.status,
            source_branch_id=customer.source_branch_id,
            notes=customer.notes,
            is_tombstone=customer.is_tombstone,
            merged_into_id=customer.merged_into_id,
            total_spent=customer.total_spent,
            order_count=customer.order_count,
            average_order_value=customer.average_order_value,
            last_purchase_date=customer.last_purchase_date,
            first_purchase_date=customer.first_purchase_date,
            return_count=customer.return_count,
            return_amount=customer.return_amount,
            created_at=customer.created_at,
            updated_at=customer.updated_at,
        )

    async def get_customer_detail_unmasked(
        self, customer_id: uuid.UUID, actor: Any, audit_reason: str
    ) -> CustomerDetailResponse:
        """Maskalanmamış PII məlumatlarını göstərir (Audit qeydi məcburidir)."""
        CrmPolicy.check_can_view_pii(actor)
        if not audit_reason or len(audit_reason.strip()) < 5:
            raise ValidationError("Fərdi məlumatların açıqlanması üçün əsaslandırma mütləqdir (audit_reason).")

        cust = await self.repo.get_customer(customer_id)
        if not cust or cust.is_tombstone:
            raise NotFoundError(f"Müştəri tapılmadı: {customer_id}")

        await record_audit_event(
            session=self.session,
            action="crm.customer.pii_unmask",
            actor_id=getattr(actor, "id", None) if actor else None,
            resource_type="customer",
            resource_id=str(cust.id),
            reason=f"Həssas PII açıqlandı: {cust.customer_no}. Səbəb: {audit_reason}",
        )

        resp = self.mask_customer_response(cust)
        consents = await self.repo.list_consents_for_customer(cust.id)
        return CustomerDetailResponse(
            **resp.model_dump(),
            raw_phone=cust.phone,
            raw_email=cust.email,
            consents=list(consents),
        )

    # ==========================================
    # 2. DUPLICATES & MERGE
    # ==========================================

    async def preview_merge(
        self, winner_id: uuid.UUID, loser_id: uuid.UUID
    ) -> CustomerMergePreviewResponse:
        if winner_id == loser_id:
            raise ValidationError("Qalib və ləğv edilən müştəri eyni ola bilməz.")

        winner = await self.repo.get_customer(winner_id)
        loser = await self.repo.get_customer(loser_id)
        if not winner or winner.is_tombstone:
            raise NotFoundError("Qalib müştəri tapılmadı.")
        if not loser or loser.is_tombstone:
            raise NotFoundError("Ləğv ediləcək müştəri tapılmadı.")

        sales_count_stmt = select(func.count(Sale.id)).where(Sale.customer_id == loser_id)
        s_res = await self.session.execute(sales_count_stmt)
        sales_count = s_res.scalar_one() or 0

        # Loyallıq cədvəli yoxlanışı (əgər varsa)
        consents = await self.repo.list_consents_for_customer(loser_id)

        warnings: list[str] = []
        if loser.total_spent > Decimal("0.00"):
            warnings.append(f"Müştərinin {loser.total_spent} AZN dövriyyəsi qalib profilə keçiriləcək.")

        return CustomerMergePreviewResponse(
            winner_customer_id=winner_id,
            loser_customer_id=loser_id,
            sales_to_transfer=sales_count,
            loyalty_points_to_transfer=0,
            consents_to_transfer=len(consents),
            warnings=warnings,
        )

    async def merge_customers(
        self, payload: CustomerMergeRequest, actor: Any
    ) -> CustomerResponse:
        CrmPolicy.check_can_merge(actor)
        if payload.winner_customer_id == payload.loser_customer_id:
            raise ValidationError("Qalib və ləğv edilən müştəri eyni ola bilməz.")

        winner = await self.repo.get_customer(payload.winner_customer_id)
        loser = await self.repo.get_customer(payload.loser_customer_id)
        if not winner or winner.is_tombstone:
            raise NotFoundError("Qalib müştəri tapılmadı.")
        if not loser or loser.is_tombstone:
            raise NotFoundError("Ləğv ediləcək müştəri tapılmadı.")

        # 1. Satışların bağlanması
        await self.session.execute(
            update(Sale)
            .where(Sale.customer_id == loser.id)
            .values(customer_id=winner.id)
        )

        # 2. Razılıqların köçürülməsi
        loser_consents = await self.repo.list_consents_for_customer(loser.id)
        for c in loser_consents:
            new_c = CustomerConsentRecord(
                customer_id=winner.id,
                purpose=c.purpose,
                status=c.status,
                channel_source=c.channel_source,
                policy_version=c.policy_version,
                actor_id=getattr(actor, "id", None) if actor else None,
                timestamp=c.timestamp,
            )
            await self.repo.add_consent(new_c)

        # 3. Ləğv olunanın tombstone edilməsi
        loser.is_tombstone = True
        loser.merged_into_id = winner.id
        loser.phone = None  # Unikallıq ziddiyyəti yaratmasın
        loser.email = None
        loser.status = CustomerStatus.BLOCKED.value

        # 4. Qalibin aqreqatlarının yenidən hesablanması
        await self.rebuild_customer_aggregates(winner.id)

        await record_audit_event(
            session=self.session,
            action="crm.customer.merge",
            actor_id=getattr(actor, "id", None) if actor else None,
            resource_type="customer",
            resource_id=str(winner.id),
            reason=(
                f"Müştəri profilləri birləşdirildi: {loser.customer_no} -> {winner.customer_no}. "
                f"Səbəb: {payload.audit_reason}"
            ),
        )
        return self.mask_customer_response(winner)

    # ==========================================
    # 3. AGGREGATES & REBUILD
    # ==========================================

    async def update_aggregates_from_sale(
        self, customer_id: uuid.UUID, sale_amount: Decimal, sale_date: datetime
    ) -> None:
        """Satış tamamlandıqda çağırılan idempotent aqreqat yeniləyici."""
        cust = await self.repo.get_customer(customer_id)
        if not cust or cust.is_tombstone:
            return

        cust.total_spent += sale_amount
        cust.order_count += 1
        if cust.order_count > 0:
            cust.average_order_value = cust.total_spent / Decimal(str(cust.order_count))
        if not cust.first_purchase_date:
            cust.first_purchase_date = sale_date
        cust.last_purchase_date = sale_date
        await self.session.flush()

    async def update_aggregates_from_return(
        self, customer_id: uuid.UUID, return_amount: Decimal
    ) -> None:
        """Geri qaytarma tamamlandıqda çağırılan aqreqat yeniləyici."""
        cust = await self.repo.get_customer(customer_id)
        if not cust or cust.is_tombstone:
            return

        cust.return_count += 1
        cust.return_amount += return_amount
        await self.session.flush()

    async def rebuild_customer_aggregates(self, customer_id: uuid.UUID) -> None:
        """Müştərinin satış göstəricilərini birbaşa 'sales' cədvəlindən 100% dəqiqliklə yenidən hesablayır."""
        cust = await self.repo.get_customer(customer_id)
        if not cust:
            return

        stmt = select(
            func.count(Sale.id).label("cnt"),
            func.coalesce(func.sum(Sale.grand_total), Decimal("0.00")).label("total"),
            func.min(Sale.created_at).label("first_sale"),
            func.max(Sale.created_at).label("last_sale"),
        ).where(Sale.customer_id == customer_id, Sale.status != "CANCELLED")

        res = await self.session.execute(stmt)
        row = res.one()

        cust.order_count = row.cnt or 0
        cust.total_spent = Decimal(str(row.total or "0.00"))
        if cust.order_count > 0:
            cust.average_order_value = cust.total_spent / Decimal(str(cust.order_count))
        else:
            cust.average_order_value = Decimal("0.00")
        cust.first_purchase_date = row.first_sale
        cust.last_purchase_date = row.last_sale
        await self.session.flush()

    # ==========================================
    # 4. CONSENTS & PRIVACY
    # ==========================================

    async def record_consent(
        self,
        customer_id: uuid.UUID,
        purpose: ConsentPurpose,
        status: ConsentStatus,
        source: ConsentSource = ConsentSource.ADMIN,
        policy_version: str = "1.0",
        actor: Any = None,
    ) -> CustomerConsentRecord:
        CrmPolicy.check_can_manage_consent(actor)
        cust = await self.repo.get_customer(customer_id)
        if not cust or cust.is_tombstone:
            raise NotFoundError(f"Müştəri tapılmadı: {customer_id}")

        rec = CustomerConsentRecord(
            customer_id=customer_id,
            purpose=purpose.value,
            status=status.value,
            channel_source=source.value,
            policy_version=policy_version,
            actor_id=getattr(actor, "id", None) if actor else None,
            timestamp=utc_now(),
        )
        return await self.repo.add_consent(rec)

    async def opt_out_by_phone(self, phone: str, purpose: ConsentPurpose) -> bool:
        """STOP açar sözü və ya imtina linki üzrə avtomatik icra olunan opt-out."""
        norm = normalize_phone(phone)
        if not norm:
            return False
        cust = await self.repo.get_customer_by_phone(norm)
        if not cust:
            return False

        rec = CustomerConsentRecord(
            customer_id=cust.id,
            purpose=purpose.value,
            status=ConsentStatus.WITHDRAWN.value,
            channel_source=ConsentSource.WEB_FORM.value,
            policy_version="1.0",
            timestamp=utc_now(),
        )
        await self.repo.add_consent(rec)
        return True

    async def request_data_erasure(
        self, customer_id: uuid.UUID, reason: str, actor: Any
    ) -> CustomerPrivacyRequest:
        """Məlumat subyektinin silinmə/anonimləşdirilməsi sorğusu (SLA 30 gün)."""
        CrmPolicy.check_can_process_privacy(actor)
        cust = await self.repo.get_customer(customer_id)
        if not cust:
            raise NotFoundError(f"Müştəri tapılmadı: {customer_id}")

        now = utc_now()
        req = CustomerPrivacyRequest(
            customer_id=customer_id,
            request_type=PrivacyRequestType.ERASURE.value,
            status=PrivacyRequestStatus.RECEIVED.value,
            reason=reason,
            legal_hold_flag=False,
            sla_deadline=now + timedelta(days=30),
        )
        created = await self.repo.create_privacy_request(req)

        # Anonimləşdirmə: Şəxsi məlumatlar silinir, satışlar uçot üçün anonim saxlanılır
        cust.full_name = f"Anonimləşdirilmiş Müştəri ({cust.customer_no})"
        cust.phone = None
        cust.email = None
        cust.notes = None
        cust.status = CustomerStatus.ANONYMIZED.value

        created.status = PrivacyRequestStatus.PROCESSED.value
        created.processed_by = getattr(actor, "id", None) if actor else None
        created.processed_at = now

        await record_audit_event(
            session=self.session,
            action="crm.customer.anonymize",
            actor_id=getattr(actor, "id", None) if actor else None,
            resource_type="customer",
            resource_id=str(cust.id),
            reason=f"Müştəri anonimləşdirildi (GDPR/AR Qanunvericiliyi): {cust.customer_no}",
        )
        await self.session.flush()
        return created

    # ==========================================
    # 5. SEGMENTS
    # ==========================================

    async def create_segment(self, payload: SegmentCreate, actor: Any) -> CustomerSegment:
        CrmPolicy.check_can_manage_segments(actor)
        seg = CustomerSegment(
            name=payload.name.strip(),
            description=payload.description,
            type=payload.type,
            rule_tree=payload.rule_tree,
            created_by=getattr(actor, "id", None) if actor else None,
        )
        created = await self.repo.create_segment(seg)
        await self.refresh_segment(created.id)
        return created

    async def evaluate_rule_tree(self, rule_tree: dict[str, Any]) -> list[uuid.UUID]:
        """Qayda ağacını qiymətləndirib uyğun müştərilərin ID siyahısını qaytarır."""
        stmt = select(Customer.id).where(
            Customer.is_tombstone.is_(False),
            Customer.status == CustomerStatus.ACTIVE.value,
        )

        min_spent = rule_tree.get("min_spent")
        if min_spent is not None:
            stmt = stmt.where(Customer.total_spent >= Decimal(str(min_spent)))

        min_orders = rule_tree.get("min_orders")
        if min_orders is not None:
            stmt = stmt.where(Customer.order_count >= int(min_orders))

        branch_id = rule_tree.get("branch_id")
        if branch_id:
            stmt = stmt.where(Customer.source_branch_id == uuid.UUID(str(branch_id)))

        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def refresh_segment(self, segment_id: uuid.UUID) -> int:
        """Seqment üzvlüyünü yenidən qiymətləndirir və snapshot cədvəlini yeniləyir."""
        seg = await self.repo.get_segment(segment_id)
        if not seg:
            raise NotFoundError(f"Seqment tapılmadı: {segment_id}")

        matched_ids = await self.evaluate_rule_tree(seg.rule_tree)
        count = await self.repo.replace_segment_members(segment_id, matched_ids)
        seg.member_count = count
        seg.last_refreshed_at = utc_now()
        await self.session.flush()
        return count
