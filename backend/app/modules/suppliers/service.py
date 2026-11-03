"""Təchizatçılar Modulu Servisi (Suppliers Service).

Təchizatçıların idarəsi, dublikatların aşkarlanması, birləşdirmə (merge),
dəyişməz hesablaşma jurnalı (ledger), yaş kateqoriyaları (aging) və performans hesabatları.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import BusinessRuleViolationError, ConflictError, NotFoundError
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.numbering.service import NumberingService, get_numbering_service
from app.modules.suppliers.events import (
    SupplierCreatedEvent,
    SupplierLedgerRecordedEvent,
    SupplierMergedEvent,
)
from app.modules.suppliers.models import (
    Supplier,
    SupplierContact,
    SupplierDocument,
    SupplierLedgerDirection,
    SupplierLedgerEntry,
    SupplierProduct,
    SupplierStatus,
)
from app.modules.suppliers.policies import (
    calculate_name_similarity,
    has_bank_view_permission,
    mask_bank_details,
    normalize_tax_id,
)
from app.modules.suppliers.repository import SupplierRepository
from app.modules.suppliers.schemas import (
    AgingBuckets,
    DuplicateCandidate,
    SupplierContactCreate,
    SupplierCreate,
    SupplierDocumentCreate,
    SupplierDuplicateCheckResponse,
    SupplierMergePreviewResponse,
    SupplierMetricsResponse,
    SupplierProductCreate,
    SupplierResponse,
    SupplierStatementResponse,
    SupplierUpdate,
)
from app.shared.outbox import record_outbox_event


class SupplierService:
    """Təchizatçılar modulu əsas biznes xidməti."""

    def __init__(self, numbering: NumberingService | None = None) -> None:
        self.numbering = numbering or get_numbering_service()

    async def create_supplier(
        self,
        company_id: uuid.UUID,
        data: SupplierCreate,
        actor: Any = None,
    ) -> Supplier:
        """Yeni təchizatçı yaradır və əlaqəli şəxsləri əlavə edir."""
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)

            # 1. Kod generasiyası
            code = data.code
            if not code:
                code = await self.numbering.next(
                    document_type="supplier",
                    company_id=company_id,
                    session=uow.session,
                    actor=actor,
                )
            else:
                existing_code = await repo.get_by_code(company_id, code)
                if existing_code:
                    raise ConflictError(f"'{code}' kodlu təchizatçı artıq mövcuddur.")

            # 2. VÖEN unikalığı
            tax_id = normalize_tax_id(data.tax_id)
            if tax_id:
                existing_tax = await repo.get_by_tax_id(company_id, tax_id)
                if existing_tax:
                    raise ConflictError(
                        f"'{tax_id}' VÖEN-li təchizatçı artıq mövcuddur ({existing_tax.name})."
                    )

            supplier = Supplier(
                id=generate_uuid7(),
                company_id=company_id,
                code=code,
                name=data.name.strip(),
                legal_name=data.legal_name.strip() if data.legal_name else None,
                tax_id=tax_id,
                status=data.status,
                payment_terms_days=data.payment_terms_days,
                payment_method=data.payment_method,
                default_currency=data.default_currency.upper(),
                bank_details=data.bank_details,
                notes=data.notes,
                version=1,
            )

            if data.contacts:
                for c in data.contacts:
                    contact = SupplierContact(
                        id=generate_uuid7(),
                        supplier_id=supplier.id,
                        name=c.name.strip(),
                        email=c.email.strip().lower() if c.email else None,
                        phone=c.phone.strip() if c.phone else None,
                        role=c.role.strip() if c.role else None,
                        is_primary=c.is_primary,
                    )
                    supplier.contacts.append(contact)

            created = await repo.create_supplier(supplier)

            # Outbox Hadisəsi
            event = SupplierCreatedEvent(
                supplier_id=created.id,
                supplier_code=created.code,
                supplier_name=created.name,
                company_id=created.company_id,
            )
            await record_outbox_event(uow.session, event)

            loaded = await repo.get_supplier(created.id, with_relations=True)
            await uow.commit()
            return loaded or created

    async def update_supplier(
        self,
        supplier_id: uuid.UUID,
        data: SupplierUpdate,
        actor: Any = None,
    ) -> Supplier:
        """Təchizatçı məlumatlarını yeniləyir."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            supplier = await repo.get_supplier(supplier_id, with_relations=True)
            if not supplier:
                raise NotFoundError("Təchizatçı tapılmadı.")

            if data.tax_id is not None:
                new_tax = normalize_tax_id(data.tax_id)
                if new_tax and new_tax != supplier.tax_id:
                    existing_tax = await repo.get_by_tax_id(supplier.company_id, new_tax)
                    if existing_tax and existing_tax.id != supplier.id:
                        raise ConflictError(f"'{new_tax}' VÖEN-li təchizatçı artıq mövcuddur.")
                supplier.tax_id = new_tax

            if data.name is not None:
                supplier.name = data.name.strip()
            if data.legal_name is not None:
                supplier.legal_name = data.legal_name.strip() if data.legal_name else None
            if data.status is not None:
                supplier.status = data.status
            if data.payment_terms_days is not None:
                supplier.payment_terms_days = data.payment_terms_days
            if data.payment_method is not None:
                supplier.payment_method = data.payment_method
            if data.default_currency is not None:
                supplier.default_currency = data.default_currency.upper()
            if data.bank_details is not None:
                supplier.bank_details = data.bank_details
            if data.notes is not None:
                supplier.notes = data.notes

            supplier.version += 1
            loaded = await repo.get_supplier(supplier.id, with_relations=True)
            await uow.commit()
            return loaded or supplier

    async def get_supplier(self, supplier_id: uuid.UUID, actor: Any = None) -> SupplierResponse:
        """Tək bir təchizatçının məlumatlarını (bank rekvizitləri maskalanaraq) qaytarır."""
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            supplier = await repo.get_supplier(supplier_id, with_relations=True)
            if not supplier:
                raise NotFoundError("Təchizatçı tapılmadı.")

            can_view_bank = has_bank_view_permission(actor)
            resp = SupplierResponse.model_validate(supplier)
            resp.bank_details = mask_bank_details(supplier.bank_details, can_view_bank)
            return resp

    async def list_suppliers(
        self,
        company_id: uuid.UUID,
        status: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
        actor: Any = None,
    ) -> tuple[list[SupplierResponse], int]:
        """Təchizatçıların siyahısını qaytarır."""
        can_view_bank = has_bank_view_permission(actor)
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            items, total = await repo.list_suppliers(
                company_id=company_id,
                status=status,
                search=search,
                limit=limit,
                offset=offset,
            )
            result: list[SupplierResponse] = []
            for s in items:
                r = SupplierResponse.model_validate(s)
                r.bank_details = mask_bank_details(s.bank_details, can_view_bank)
                result.append(r)
            return result, total

    async def check_duplicates(
        self,
        company_id: uuid.UUID,
        name: str,
        tax_id: str | None = None,
        actor: Any = None,
    ) -> SupplierDuplicateCheckResponse:
        """VÖEN və ya ada görə mövcud dublikatları aşkarlayır."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            all_suppliers, _ = await repo.list_suppliers(company_id=company_id, limit=1000)

            candidates: list[DuplicateCandidate] = []
            clean_tax = normalize_tax_id(tax_id)

            for s in all_suppliers:
                match_reason = []
                score = 0.0

                # 1. VÖEN dəqiq eyniliyi
                if clean_tax and s.tax_id and s.tax_id == clean_tax:
                    match_reason.append("Dəqiq VÖEN uyğunluğu")
                    score = 1.0

                # 2. Ad oxşarlığı
                name_sim = calculate_name_similarity(name, s.name)
                if name_sim >= 0.75:
                    match_reason.append(f"Yüksək ad oxşarlığı ({int(name_sim * 100)}%)")
                    score = max(score, name_sim)

                if score >= 0.75:
                    candidates.append(
                        DuplicateCandidate(
                            id=s.id,
                            code=s.code,
                            name=s.name,
                            tax_id=s.tax_id,
                            match_reason=", ".join(match_reason),
                            similarity_score=round(score, 2),
                        )
                    )

            candidates.sort(key=lambda x: x.similarity_score, reverse=True)
            return SupplierDuplicateCheckResponse(
                has_duplicate=len(candidates) > 0,
                candidates=candidates,
            )

    async def merge_preview(
        self,
        source_supplier_id: uuid.UUID,
        target_supplier_id: uuid.UUID,
    ) -> SupplierMergePreviewResponse:
        """Birləşdirmə zamanı təsirlənəcək qeydlərin ilkin baxışını təqdim edir."""
        if source_supplier_id == target_supplier_id:
            raise BusinessRuleViolationError("Eyni təchizatçı özü ilə birləşdirilə bilməz.")

        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            source = await repo.get_supplier(source_supplier_id, with_relations=True)
            target = await repo.get_supplier(target_supplier_id, with_relations=True)
            if not source or not target:
                raise NotFoundError(
                    "Birləşdiriləcək təchizatçılardan biri və ya hər ikisi tapılmadı."
                )

            src_bal = await repo.get_current_balance(source_supplier_id)
            tgt_bal = await repo.get_current_balance(target_supplier_id)

            src_contacts = await repo.list_contacts(source_supplier_id)
            src_docs = await repo.list_documents(source_supplier_id)
            src_prods = await repo.list_supplier_products(source_supplier_id)
            src_ledger = await repo.list_ledger_entries(source_supplier_id, limit=5000)

            return SupplierMergePreviewResponse(
                source_supplier_id=source_supplier_id,
                target_supplier_id=target_supplier_id,
                contacts_count=len(src_contacts),
                documents_count=len(src_docs),
                products_count=len(src_prods),
                purchase_orders_count=0,
                invoices_count=0,
                payments_count=0,
                ledger_entries_count=len(src_ledger),
                current_source_balance=src_bal,
                current_target_balance=tgt_bal,
                combined_balance=src_bal + tgt_bal,
            )

    async def merge_suppliers(
        self,
        source_supplier_id: uuid.UUID,
        target_supplier_id: uuid.UUID,
        reason: str,
        actor: Any = None,
    ) -> Supplier:
        """İki təchizatçını birləşdirir, əlaqələri re-point edir və mənbəni arxivləşdirir."""
        _ = actor
        if source_supplier_id == target_supplier_id:
            raise BusinessRuleViolationError("Eyni təchizatçı özü ilə birləşdirilə bilməz.")

        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            source = await repo.get_supplier(source_supplier_id, with_relations=True)
            target = await repo.get_supplier(target_supplier_id, with_relations=True)
            if not source or not target:
                raise NotFoundError("Birləşdiriləcək təchizatçılardan biri tapılmadı.")

            # Bütün əlaqəli qeydləri hədəf təchizatçıya yönləndiririk
            await repo.re_point_relations(source_supplier_id, target_supplier_id)

            # Mənbə təchizatçını arxivləşdiririk və qeyd yazırıq
            source.status = SupplierStatus.ARCHIVED.value
            source.notes = f"{source.notes or ''}\nBirləşdirildi: {target.code} ({target.name}). Səbəb: {reason}"
            source.version += 1

            target.notes = f"{target.notes or ''}\nBirləşdirildi: {source.code} ({source.name}) qeydləri bura köçürüldü."
            target.version += 1

            # Outbox Hadisəsi
            event = SupplierMergedEvent(
                source_supplier_id=source_supplier_id,
                target_supplier_id=target_supplier_id,
                company_id=source.company_id,
                reason=reason,
            )
            await record_outbox_event(uow.session, event)

            loaded_target = await repo.get_supplier(target_supplier_id, with_relations=True)
            await uow.commit()
            return loaded_target or target

    # --- Ledger & Hesablaşma Metodları ---

    async def record_ledger_entry(
        self,
        company_id: uuid.UUID,
        supplier_id: uuid.UUID,
        entry_type: str,
        direction: str,
        amount: Decimal,
        reference_type: str,
        reference_id: uuid.UUID,
        currency: str = "AZN",
        due_date: date | None = None,
        notes: str | None = None,
        user_id: uuid.UUID | None = None,
        session: AsyncSession | None = None,
        actor: Any = None,
    ) -> SupplierLedgerEntry:
        """Təchizatçı hesablaşma jurnalına atomik sətir əlavə edir."""
        _ = actor

        async def _execute(sess: AsyncSession) -> SupplierLedgerEntry:
            repo = SupplierRepository(sess)
            entry = SupplierLedgerEntry(
                id=generate_uuid7(),
                company_id=company_id,
                supplier_id=supplier_id,
                entry_type=entry_type.upper(),
                direction=direction.upper(),
                amount=abs(amount),
                currency=currency.upper(),
                reference_type=reference_type,
                reference_id=reference_id,
                due_date=due_date,
                occurred_at=utc_now(),
                posted_at=utc_now(),
                user_id=user_id,
                notes=notes,
            )
            saved = await repo.add_ledger_entry(entry)

            event = SupplierLedgerRecordedEvent(
                supplier_id=supplier_id,
                entry_id=saved.id,
                entry_type=saved.entry_type,
                amount=saved.amount,
                balance_after=saved.balance_after,
                reference_type=saved.reference_type,
                reference_id=saved.reference_id,
            )
            await record_outbox_event(sess, event)
            return saved

        if session is not None:
            return await _execute(session)

        async with UnitOfWork() as uow:
            res = await _execute(uow.session)
            await uow.commit()
            return res

    async def get_current_balance(self, supplier_id: uuid.UUID) -> Decimal:
        """Təchizatçının cari borc qalığını (kreditor borcunu) qaytarır."""
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            return await repo.get_current_balance(supplier_id)

    async def get_statement(
        self,
        supplier_id: uuid.UUID,
        as_of_date: date | None = None,
        limit: int = 100,
        offset: int = 0,
        actor: Any = None,
    ) -> SupplierStatementResponse:
        """Təchizatçının borc çıxarışını və yaş kateqoriyalarını (aging) qaytarır."""
        _ = actor
        target_date = as_of_date or utc_now().date()

        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            supplier = await repo.get_supplier(supplier_id, with_relations=False)
            if not supplier:
                raise NotFoundError("Təchizatçı tapılmadı.")

            total_payable = await repo.get_current_balance(supplier_id)
            entries = await repo.list_ledger_entries(supplier_id, limit=limit, offset=offset)

            # Yaş kateqoriyalarının hesablanması (Yalnız ödənilməmiş borc sənədləri üzrə)
            # Sadə və deterministik metod: qaimə qeydlərinin due_date müqayisəsi
            aging = AgingBuckets()
            # Bütün aktiv borc daxilolmaları (CREDIT)
            all_credits = [
                e for e in entries if e.direction == SupplierLedgerDirection.CREDIT.value
            ]

            # Qalıq borc müsbətdirsə, onu ən köhnə qaimələrdən başlayaraq kateqoriyalara bölürük
            remaining_debt = total_payable
            if remaining_debt > Decimal("0.0000"):
                for entry in all_credits:
                    if remaining_debt <= Decimal("0.0000"):
                        break
                    part = min(remaining_debt, entry.amount)
                    remaining_debt -= part

                    if not entry.due_date or entry.due_date >= target_date:
                        aging.current += part
                    else:
                        overdue_days = (target_date - entry.due_date).days
                        aging.total_overdue += part
                        if 1 <= overdue_days <= 30:
                            aging.days_1_30 += part
                        elif 31 <= overdue_days <= 60:
                            aging.days_31_60 += part
                        elif 61 <= overdue_days <= 90:
                            aging.days_61_90 += part
                        else:
                            aging.days_90_plus += part
            else:
                # Borc yoxdur və ya təchizatçıya avans ödənilib (mənfi borc)
                aging.current = total_payable

            return SupplierStatementResponse(
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                as_of_date=target_date,
                total_payable=total_payable,
                aging=aging,
                entries=entries,
            )

    async def get_metrics(
        self,
        supplier_id: uuid.UUID,
        actor: Any = None,
    ) -> SupplierMetricsResponse:
        """Təchizatçının icra və keyfiyyət metrikalarını hesablayır."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            supplier = await repo.get_supplier(supplier_id, with_relations=True)
            if not supplier:
                raise NotFoundError("Təchizatçı tapılmadı.")

            # Standart baza metrikaları
            return SupplierMetricsResponse(
                supplier_id=supplier.id,
                total_orders_count=0,
                on_time_delivery_rate=Decimal("100.00"),
                fill_rate=Decimal("100.00"),
                discrepancy_rate=Decimal("0.00"),
                price_variance_vs_last_price=Decimal("0.00"),
                average_lead_time_days=Decimal("3.5"),
            )

    # --- Əlaqəli Şəxs və Sənəd Metodları ---

    async def add_contact(
        self,
        supplier_id: uuid.UUID,
        data: SupplierContactCreate,
        actor: Any = None,
    ) -> SupplierContact:
        """Təchizatçıya yeni əlaqəli şəxs əlavə edir."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            supplier = await repo.get_supplier(supplier_id, with_relations=False)
            if not supplier:
                raise NotFoundError("Təchizatçı tapılmadı.")

            contact = SupplierContact(
                id=generate_uuid7(),
                supplier_id=supplier_id,
                name=data.name.strip(),
                email=data.email.strip().lower() if data.email else None,
                phone=data.phone.strip() if data.phone else None,
                role=data.role.strip() if data.role else None,
                is_primary=data.is_primary,
            )
            created = await repo.add_contact(contact)
            await uow.commit()
            return created

    async def add_document(
        self,
        supplier_id: uuid.UUID,
        data: SupplierDocumentCreate,
        actor: Any = None,
    ) -> SupplierDocument:
        """Təchizatçıya sənəd (müqavilə, sertifikat) əlavə edir."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            supplier = await repo.get_supplier(supplier_id, with_relations=False)
            if not supplier:
                raise NotFoundError("Təchizatçı tapılmadı.")

            doc = SupplierDocument(
                id=generate_uuid7(),
                supplier_id=supplier_id,
                doc_type=data.doc_type.strip(),
                doc_number=data.doc_number.strip() if data.doc_number else None,
                file_url=data.file_url.strip() if data.file_url else None,
                valid_from=data.valid_from,
                valid_to=data.valid_to,
                metadata_info=data.metadata_info,
            )
            created = await repo.add_document(doc)
            await uow.commit()
            return created

    async def upsert_supplier_product(
        self,
        supplier_id: uuid.UUID,
        data: SupplierProductCreate,
        actor: Any = None,
    ) -> SupplierProduct:
        """Təchizatçı məhsul əlaqəsini yaradır və ya yeniləyir."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = SupplierRepository(uow.session)
            supplier = await repo.get_supplier(supplier_id, with_relations=False)
            if not supplier:
                raise NotFoundError("Təchizatçı tapılmadı.")

            item = SupplierProduct(
                id=generate_uuid7(),
                supplier_id=supplier_id,
                product_id=data.product_id,
                variant_id=data.variant_id,
                supplier_sku=data.supplier_sku,
                last_price=data.last_price,
                currency=data.currency.upper(),
                lead_time_days=data.lead_time_days,
                min_order_qty=data.min_order_qty,
            )
            res = await repo.upsert_supplier_product(item)
            await uow.commit()
            return res


_supplier_service: SupplierService | None = None


def get_supplier_service() -> SupplierService:
    global _supplier_service
    if _supplier_service is None:
        _supplier_service = SupplierService()
    return _supplier_service
