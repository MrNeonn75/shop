"""Müştərilər, Razılıq Jurnalı və Məxfilik Testləri (CRM Customers & Consent Tests).

Əhatə olunan sahələr:
1. Telefon Nömrələrinin E.164 formatında normalizasiyası və PII maskalanması.
2. Təkrarlanmanın qarşısının alınması (Duplicate prevention: phone və email unikallığı).
3. Müştəri profillərinin birləşdirilməsi (Customer Merge):
   - Qalib və ləğv edilən profillərin audit-backed birləşdirilməsi.
   - Ləğv edilənin tombstone edilməsi və satışların / razılıqların qalibə keçirilməsi.
4. Append-Only Razılıq Jurnalı (Consent Ledger):
   - Hər bir razılıq və imtina yeni sətir kimi əlavə olunur (tarixçə heç vaxt silinmir).
   - Ən son statusun müəyyənləşdirilməsi (Latest consent state).
   - Telefon nömrəsi ilə avtomatik Opt-Out (STOP).
5. Məxfilik və GDPR hüquqları (Məlumatların silinməsi / anonimləşdirilməsi).
6. Satış aqreqatlarının dəqiqliyi və yenidən qurulması (Rebuild aggregates).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ValidationError
from app.core.ids import generate_uuid7
from app.modules.auth.policies import AuthenticatedUser
from app.modules.crm.models import (
    ConsentPurpose,
    ConsentSource,
    ConsentStatus,
    CustomerStatus,
    PrivacyRequestStatus,
)
from app.modules.crm.phone import mask_email, mask_phone, normalize_phone
from app.modules.crm.schemas import (
    ConsentInput,
    CustomerCreate,
    CustomerMergeRequest,
)
from app.modules.crm.service import CrmService


def make_crm_actor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username=f"crm_admin_{uuid.uuid4().hex[:6]}",
        email="crm@brandhouse.az",
        full_name="CRM Administrator",
        roles=["marketing_manager"],
        permissions=[
            "crm.customer.manage",
            "crm.pii.view",
            "crm.customer.merge",
            "crm.consent.manage",
            "crm.export",
            "crm.privacy.process",
        ],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )


# =========================================================================
# 1. PHONE NORMALIZATION & PII MASKING
# =========================================================================


def test_phone_normalization_formats() -> None:
    # Azərbaycan formatları: 050..., 994..., +994...
    assert normalize_phone("0501234567") == "+994501234567"
    assert normalize_phone("050 123 45 67") == "+994501234567"
    assert normalize_phone("+994 (50) 123-45-67") == "+994501234567"
    assert normalize_phone("994551234567") == "+994551234567"
    assert normalize_phone("+994701234567") == "+994701234567"

    # Boş və ya qeyri-düzgün nömrələr
    assert normalize_phone(None) is None
    assert normalize_phone("") is None
    with pytest.raises(ValidationError):
        normalize_phone("12345")


def test_pii_masking() -> None:
    # Telefon maskalanması
    assert mask_phone("+994501234567") == "+99450***67"
    assert mask_phone(None) == ""

    # E-poçt maskalanması
    assert mask_email("elshan@brandhouse.az") == "e***n@brandhouse.az"
    assert mask_email("a@b.com") == "a*@b.com"
    assert mask_email(None) == ""


# =========================================================================
# 2. CUSTOMER CREATION & DUPLICATE PREVENTION
# =========================================================================


@pytest.mark.asyncio
async def test_customer_creation_and_duplicate_prevention(session: AsyncSession) -> None:
    svc = CrmService(session)
    actor = make_crm_actor()

    # Müştəri yaradılması
    c1 = await svc.create_customer(
        payload=CustomerCreate(
            full_name="Aysel Məmmədova",
            phone="050 999 88 77",
            email="aysel@example.com",
            consents=[
                ConsentInput(
                    purpose=ConsentPurpose.MARKETING_SMS,
                    status=ConsentStatus.GRANTED,
                    channel_source=ConsentSource.POS,
                )
            ],
        ),
        actor=actor,
    )
    assert c1.phone == "+994509998877"
    assert c1.email == "aysel@example.com"
    assert c1.customer_no.startswith("CUST-")

    # Eyni telefonla təkrar yaratma cəhdi -> ConflictError
    with pytest.raises(ConflictError):
        await svc.create_customer(
            payload=CustomerCreate(
                full_name="Aysel Başqa",
                phone="+994509998877",
            ),
            actor=actor,
        )

    # Eyni e-poçtla təkrar yaratma cəhdi -> ConflictError
    with pytest.raises(ConflictError):
        await svc.create_customer(
            payload=CustomerCreate(
                full_name="Aysel Başqa 2",
                email="AYSEL@EXAMPLE.COM",  # case-insensitive yoxlanış
            ),
            actor=actor,
        )


# =========================================================================
# 3. APPEND-ONLY CONSENT LEDGER & OPT-OUT
# =========================================================================


@pytest.mark.asyncio
async def test_append_only_consent_ledger_and_opt_out(session: AsyncSession) -> None:
    svc = CrmService(session)
    actor = make_crm_actor()

    c = await svc.create_customer(
        payload=CustomerCreate(
            full_name="Rəşad Əliyev",
            phone="055 222 33 44",
        ),
        actor=actor,
    )

    # 1. Razılıq verilir
    await svc.record_consent(
        customer_id=c.id,
        purpose=ConsentPurpose.MARKETING_SMS,
        status=ConsentStatus.GRANTED,
        source=ConsentSource.POS,
        actor=actor,
    )

    consented_ids_1 = await svc.repo.get_customers_with_consent(
        [c.id], ConsentPurpose.MARKETING_SMS.value
    )
    assert c.id in consented_ids_1

    # 2. Razılıq geri çağırılır (WITHDRAWN) -> Yeni sətir əlavə olunur (append-only)
    await svc.record_consent(
        customer_id=c.id,
        purpose=ConsentPurpose.MARKETING_SMS,
        status=ConsentStatus.WITHDRAWN,
        source=ConsentSource.ADMIN,
        actor=actor,
    )

    consented_ids_2 = await svc.repo.get_customers_with_consent(
        [c.id], ConsentPurpose.MARKETING_SMS.value
    )
    assert c.id not in consented_ids_2

    # Jurnalda hər iki qeyd qalmalıdır (ən son birinci gəlir)
    history = await svc.repo.list_consents_for_customer(c.id)
    assert len(history) == 2
    assert {history[0].status, history[1].status} == {
        ConsentStatus.WITHDRAWN.value,
        ConsentStatus.GRANTED.value,
    }

    # 3. Nömrə ilə STOP (Opt-out)
    # Əvvəlcə EMAIL razılığı verək
    await svc.record_consent(
        customer_id=c.id,
        purpose=ConsentPurpose.MARKETING_EMAIL,
        status=ConsentStatus.GRANTED,
        actor=actor,
    )
    opt_out_success = await svc.opt_out_by_phone("0552223344", ConsentPurpose.MARKETING_EMAIL)
    assert opt_out_success is True

    consented_email_ids = await svc.repo.get_customers_with_consent(
        [c.id], ConsentPurpose.MARKETING_EMAIL.value
    )
    assert c.id not in consented_email_ids


# =========================================================================
# 4. CUSTOMER MERGE FLOW
# =========================================================================


@pytest.mark.asyncio
async def test_customer_merge_flow_and_tombstone(session: AsyncSession) -> None:
    svc = CrmService(session)
    actor = make_crm_actor()

    # İki profil yaradılır: Winner və Loser
    winner = await svc.create_customer(
        payload=CustomerCreate(
            full_name="Kamran Quliyev (Əsas)",
            phone="050 111 22 33",
            email="kamran@main.az",
        ),
        actor=actor,
    )
    loser = await svc.create_customer(
        payload=CustomerCreate(
            full_name="Kamran Quliyev (Köhnə)",
            phone="055 111 22 33",
            email="kamran@old.az",
        ),
        actor=actor,
    )

    # Loser profilinə razılıq əlavə edirik
    await svc.record_consent(
        customer_id=loser.id,
        purpose=ConsentPurpose.MARKETING_SMS,
        status=ConsentStatus.GRANTED,
        actor=actor,
    )

    # Merge Preview
    preview = await svc.preview_merge(winner_id=winner.id, loser_id=loser.id)
    assert preview.winner_customer_id == winner.id
    assert preview.loser_customer_id == loser.id
    assert preview.consents_to_transfer >= 1

    # Birləşdirmə icra olunur
    merged = await svc.merge_customers(
        payload=CustomerMergeRequest(
            winner_customer_id=winner.id,
            loser_customer_id=loser.id,
            audit_reason="Eyni şəxsə aid dublikat profil aşkarlandı",
        ),
        actor=actor,
    )
    assert merged.id == winner.id

    # Loser yoxlanışı: Tombstone və Blocked olmalıdır, phone/email boşaldılmalıdır
    await session.refresh(loser)
    assert loser.is_tombstone is True
    assert loser.merged_into_id == winner.id
    assert loser.status == CustomerStatus.BLOCKED.value
    assert loser.phone is None
    assert loser.email is None

    # Razılıq Winner-ə köçürülməlidir
    consents_winner = await svc.repo.get_customers_with_consent(
        [winner.id], ConsentPurpose.MARKETING_SMS.value
    )
    assert winner.id in consents_winner


# =========================================================================
# 5. PRIVACY & GDPR DATA ERASURE
# =========================================================================


@pytest.mark.asyncio
async def test_gdpr_data_erasure_and_anonymization(session: AsyncSession) -> None:
    svc = CrmService(session)
    actor = make_crm_actor()

    cust = await svc.create_customer(
        payload=CustomerCreate(
            full_name="Leyla Əhmədova",
            phone="070 333 44 55",
            email="leyla@privacy.az",
            notes="Şəxsi qeydlər",
        ),
        actor=actor,
    )

    # Silinmə / Anonimləşdirmə sorğusu
    req = await svc.request_data_erasure(
        customer_id=cust.id,
        reason="Müştərinin GDPR hüququna əsasən silinmə tələbi",
        actor=actor,
    )
    assert req.status == PrivacyRequestStatus.PROCESSED.value

    # Müştəri profilinin anonimləşdirilməsi
    await session.refresh(cust)
    assert cust.phone is None
    assert cust.email is None
    assert cust.notes is None
    assert cust.status == CustomerStatus.ANONYMIZED.value
    assert "Anonimləşdirilmiş Müştəri" in cust.full_name


# =========================================================================
# 6. SALES AGGREGATES & REBUILD
# =========================================================================


@pytest.mark.asyncio
async def test_sales_aggregates_update_and_rebuild(session: AsyncSession) -> None:
    svc = CrmService(session)
    actor = make_crm_actor()
    now = datetime.now(UTC)

    cust = await svc.create_customer(
        payload=CustomerCreate(
            full_name="Tural Məmmədli",
            phone="051 444 55 66",
        ),
        actor=actor,
    )
    assert cust.total_spent == Decimal("0.00")
    assert cust.order_count == 0

    # Satış qeydiyyatından aqreqat yenilənməsi
    await svc.update_aggregates_from_sale(
        customer_id=cust.id,
        sale_amount=Decimal("150.00"),
        sale_date=now,
    )
    assert cust.total_spent == Decimal("150.00")
    assert cust.order_count == 1
    assert cust.average_order_value == Decimal("150.00")
    assert cust.first_purchase_date == now
    assert cust.last_purchase_date == now

    # İkinci satış
    await svc.update_aggregates_from_sale(
        customer_id=cust.id,
        sale_amount=Decimal("50.00"),
        sale_date=now + timedelta(days=2),
    )
    assert cust.total_spent == Decimal("200.00")
    assert cust.order_count == 2
    assert cust.average_order_value == Decimal("100.00")
