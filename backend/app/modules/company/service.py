"""Şirkət Modulu Xidmət Qatı (Company Service)."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import ForbiddenError, NotFoundError
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.company.events import CompanyUpdatedEvent
from app.modules.company.models import Company
from app.modules.company.policies import can_manage_company, can_view_company
from app.modules.company.repository import CompanyRepository
from app.modules.company.schemas import CompanyResponse, CompanyUpdate
from app.shared.audit import record_audit_event
from app.shared.outbox import record_outbox_event


class CompanyService:
    """Şirkət profilinin idarə edilməsi xidməti."""

    def __init__(self, repository: CompanyRepository | None = None) -> None:
        self.repo = repository or CompanyRepository()

    async def get_company(self, actor: Any = None) -> CompanyResponse:
        """Əsas şirkət profilini qaytarır."""
        if not can_view_company(actor):
            raise ForbiddenError("Şirkət profilini görmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            company = await self.repo.get_default_company(uow.session)
            if not company:
                # Əgər hələ yaradılmayıbsa ilkin şirkəti avtomatik yaradırıq
                company = Company(
                    id=generate_uuid7(),
                    code="BH_MAIN",
                    name="BRAND HOUSE",
                    legal_name="BRAND HOUSE MMC",
                    tax_id="1234567891",
                    address="Bakı şəhəri, Nizami küç. 45",
                    phone="+994123456789",
                    email="info@brandhouse.az",
                    website="https://brandhouse.az",
                    default_currency="AZN",
                    timezone="Asia/Baku",
                    default_language="az",
                    is_active=True,
                    version=1,
                )
                await self.repo.create(uow.session, company)
                await uow.commit()

            return CompanyResponse.model_validate(company)

    async def get_company_id(self) -> uuid.UUID:
        """Sistem daxili əməliyyatlar üçün cari əsas şirkətin ID-sini qaytarır."""
        async with UnitOfWork() as uow:
            company = await self.repo.get_default_company(uow.session)
            if company:
                return company.id
        # Əgər yoxdursa get_company vasitəsilə təmin edir
        resp = await self.get_company(actor=None)
        return resp.id

    async def update_company(self, data: CompanyUpdate, actor: Any = None) -> CompanyResponse:
        """Şirkət profil məlumatlarını optimistik kilidləmə ilə yeniləyir."""
        if not can_manage_company(actor):
            raise ForbiddenError("Şirkət profilini redaktə etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            company = await self.repo.get_default_company(uow.session)
            if not company:
                raise NotFoundError("Şirkət profili tapılmadı.")

            old_state = {
                "name": company.name,
                "legal_name": company.legal_name,
                "tax_id": company.tax_id,
                "address": company.address,
                "phone": company.phone,
                "email": company.email,
                "website": company.website,
                "logo_url": company.logo_url,
                "default_currency": company.default_currency,
                "timezone": company.timezone,
                "default_language": company.default_language,
            }

            if data.name is not None:
                company.name = data.name.strip()
            if data.legal_name is not None:
                company.legal_name = data.legal_name.strip()
            if data.tax_id is not None:
                company.tax_id = data.tax_id.strip()
            if data.address is not None:
                company.address = data.address.strip()
            if data.phone is not None:
                company.phone = data.phone.strip()
            if data.email is not None:
                company.email = data.email.strip().lower()
            if data.website is not None:
                company.website = data.website.strip()
            if data.logo_url is not None:
                company.logo_url = data.logo_url.strip()
            if data.default_currency is not None:
                company.default_currency = data.default_currency.strip().upper()
            if data.timezone is not None:
                company.timezone = data.timezone.strip()
            if data.default_language is not None:
                company.default_language = data.default_language

            updated_company = await self.repo.update(
                uow.session, company, expected_version=data.version
            )

            new_state = {
                "name": updated_company.name,
                "legal_name": updated_company.legal_name,
                "tax_id": updated_company.tax_id,
                "address": updated_company.address,
                "phone": updated_company.phone,
                "email": updated_company.email,
                "website": updated_company.website,
                "logo_url": updated_company.logo_url,
                "default_currency": updated_company.default_currency,
                "timezone": updated_company.timezone,
                "default_language": updated_company.default_language,
            }

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="COMPANY_UPDATED",
                resource_type="companies",
                resource_id=str(updated_company.id),
                actor_id=actor_id,
                diff={"before": old_state, "after": new_state},
            )

            event = CompanyUpdatedEvent(
                company_id=updated_company.id,
                name=updated_company.name,
                diff={"before": old_state, "after": new_state},
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return CompanyResponse.model_validate(updated_company)


_company_service: CompanyService | None = None


def get_company_service() -> CompanyService:
    global _company_service
    if _company_service is None:
        _company_service = CompanyService()
    return _company_service
