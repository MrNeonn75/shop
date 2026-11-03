"""Əmək Haqqı (Payroll) Biznes Servisi.

Maaş hesablama həyat dövrü:
DRAFT -> CALCULATED -> UNDER_REVIEW -> APPROVED (SoD) -> FINALIZED -> PAID.
Yekunlaşdırılma zamanı transactional outbox hadisəsi (payroll.finalized) yaradılır.
"""

from __future__ import annotations

import io
import uuid
from decimal import Decimal
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_pii, mask_bank_account
from app.core.database import utc_now
from app.core.errors import BusinessRuleViolationError, NotFoundError, ValidationError
from app.modules.hr.models import (
    Employee,
    EmployeeSensitiveData,
    EmployeeStatus,
    Timesheet,
)
from app.modules.payroll.engine import PayrollCalculationEngine
from app.modules.payroll.models import (
    PayrollAdjustment,
    PayrollBranchAllocation,
    PayrollRuleSet,
    PayrollRun,
    PayrollRunStatus,
    Payslip,
    PayslipLineItem,
    SalaryProfile,
)
from app.modules.payroll.policies import PayrollPolicy
from app.modules.payroll.repository import PayrollRepository
from app.modules.payroll.schemas import (
    BankPaymentExportResponse,
    PayrollAdjustmentCreate,
    PayrollRuleSetCreate,
    PayrollRunCreate,
    SalaryProfileCreate,
)
from app.shared.events import DomainEvent
from app.shared.outbox import record_outbox_event


class PayrollService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = PayrollRepository(session)

    # ------------------------------------------
    # Salary Profiles & Rules
    # ------------------------------------------

    async def create_salary_profile(
        self, payload: SalaryProfileCreate, actor: Any
    ) -> SalaryProfile:
        PayrollPolicy.check_can_manage_profile(actor)

        # Əvvəlki aktiv profili tapıb deaktiv edirik
        existing = await self.repo.get_active_salary_profile(payload.employee_id)
        version = 1
        if existing:
            existing.is_active = False
            version = existing.version + 1

        profile = SalaryProfile(
            employee_id=payload.employee_id,
            version=version,
            effective_date=payload.effective_date,
            compensation_model=payload.compensation_model,
            currency=payload.currency,
            base_salary=payload.base_salary,
            hourly_rate=payload.hourly_rate,
            is_active=True,
        )
        return await self.repo.save_salary_profile(profile)

    async def get_salary_profile(
        self, employee_id: uuid.UUID, actor: Any
    ) -> SalaryProfile | None:
        PayrollPolicy.check_can_view_profile(actor)
        return await self.repo.get_active_salary_profile(employee_id)

    async def create_rule_set(
        self, payload: PayrollRuleSetCreate, actor: Any
    ) -> PayrollRuleSet:
        PayrollPolicy.check_can_manage_rules(actor)
        rule_set = PayrollRuleSet(
            name=payload.name,
            version=payload.version,
            effective_date=payload.effective_date,
            rules_config=payload.rules_config,
            is_active=True,
        )
        return await self.repo.save_rule_set(rule_set)

    async def get_latest_rule_set(self, actor: Any) -> PayrollRuleSet | None:
        PayrollPolicy.check_can_manage_rules(actor)
        return await self.repo.get_latest_rule_set()

    async def create_adjustment(
        self, payload: PayrollAdjustmentCreate, actor: Any
    ) -> PayrollAdjustment:
        PayrollPolicy.check_can_manage_profile(actor)
        adj = PayrollAdjustment(
            employee_id=payload.employee_id,
            payroll_run_id=payload.payroll_run_id,
            type=payload.type,
            amount=payload.amount,
            description=payload.description,
            approved_by=getattr(actor, "id", uuid.uuid4()),
        )
        return await self.repo.create_adjustment(adj)

    # ------------------------------------------
    # Payroll Runs Lifecycle
    # ------------------------------------------

    async def create_payroll_run(
        self, payload: PayrollRunCreate, actor: Any
    ) -> PayrollRun:
        PayrollPolicy.check_can_create_run(actor)
        PayrollPolicy.check_branch_scope(actor, payload.branch_id)

        if payload.period_end < payload.period_start:
            raise ValidationError("Dövrün bitmə tarixi başlanğıc tarixindən əvvəl ola bilməz.")

        run_no = f"PR-{payload.period_start.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

        run = PayrollRun(
            run_no=run_no,
            period_start=payload.period_start,
            period_end=payload.period_end,
            branch_id=payload.branch_id,
            status=PayrollRunStatus.DRAFT,
            prepared_by=getattr(actor, "id", None),
            payslips=[],
            branch_allocations=[],
        )
        return await self.repo.save_run(run)

    async def calculate_payroll_run(self, run_id: uuid.UUID, actor: Any) -> PayrollRun:
        """Bütün işçilər üzrə deterministik maaş hesablanması."""
        PayrollPolicy.check_can_create_run(actor)
        run = await self.repo.get_run(run_id)
        if not run:
            raise NotFoundError(f"Maaş hesablama sənədi tapılmadı: {run_id}")
        PayrollPolicy.check_branch_scope(actor, run.branch_id)

        if run.status not in (PayrollRunStatus.DRAFT, PayrollRunStatus.CALCULATED):
            raise BusinessRuleViolationError(
                f"Yalnız DRAFT və ya CALCULATED statusunda olan sənəd hesablana bilər (Cari: {run.status})."
            )

        # 1. Müvafiq işçiləri tapırıq
        stmt = select(Employee).where(Employee.status == EmployeeStatus.ACTIVE)
        if run.branch_id:
            stmt = stmt.where(Employee.branch_id == run.branch_id)
        emp_res = await self.session.execute(stmt)
        employees = emp_res.scalars().all()

        rule_set = await self.repo.get_latest_rule_set()

        calculated_payslips: list[Payslip] = []
        tot_gross = Decimal("0.00")
        tot_emp_tax = Decimal("0.00")
        tot_empr_tax = Decimal("0.00")
        tot_ded = Decimal("0.00")
        tot_net = Decimal("0.00")
        tot_empr_cost = Decimal("0.00")

        input_snapshot: dict[str, Any] = {
            "period_start": run.period_start.isoformat(),
            "period_end": run.period_end.isoformat(),
            "employees_count": len(employees),
            "rule_set_id": str(rule_set.id) if rule_set else None,
        }

        # Əgər əvvəlki payslip-lər varsa, silirik
        run.payslips.clear()
        await self.session.flush()

        for emp in employees:
            profile = await self.repo.get_active_salary_profile(emp.id)
            if not profile:
                continue

            # Tabel (Timesheet)
            ts_stmt = select(Timesheet).where(
                Timesheet.employee_id == emp.id,
                Timesheet.period_year == run.period_start.year,
                Timesheet.period_month == run.period_start.month,
            )
            ts_res = await self.session.execute(ts_stmt)
            timesheet = ts_res.scalar_one_or_none()

            # Düzəlişlər (Adjustments)
            adjustments = list(await self.repo.list_pending_adjustments_for_employee(emp.id))

            # Maskalanmış bank hesabı
            sens_stmt = select(EmployeeSensitiveData).where(
                EmployeeSensitiveData.employee_id == emp.id
            )
            sens_res = await self.session.execute(sens_stmt)
            sens = sens_res.scalar_one_or_none()
            plain_iban = decrypt_pii(sens.bank_account_encrypted) if sens else None
            masked_iban = mask_bank_account(plain_iban)

            calc = PayrollCalculationEngine.calculate_employee_payslip(
                employee=emp,
                profile=profile,
                period_start=run.period_start,
                period_end=run.period_end,
                timesheet=timesheet,
                adjustments=adjustments,
                rule_set=rule_set,
                masked_bank_account=masked_iban,
            )

            payslip = Payslip(
                payroll_run_id=run.id,
                employee_id=emp.id,
                gross_pay=calc.gross_pay,
                net_pay=calc.net_pay,
                employee_taxes=calc.employee_taxes,
                employer_taxes=calc.employer_taxes,
                deductions=calc.deductions,
                payment_method="BANK_TRANSFER",
                masked_bank_account=calc.masked_bank_account,
                currency=calc.currency,
            )

            for item in calc.line_items:
                payslip.line_items.append(
                    PayslipLineItem(
                        category=item.category,
                        code=item.code,
                        name=item.name,
                        amount=item.amount,
                        calculation_detail=item.calculation_detail,
                    )
                )

            calculated_payslips.append(payslip)

            tot_gross += calc.gross_pay
            tot_emp_tax += calc.employee_taxes
            tot_empr_tax += calc.employer_taxes
            tot_ded += calc.deductions
            tot_net += calc.net_pay
            tot_empr_cost += (calc.gross_pay + calc.employer_taxes)

            # Adjustment-ləri bu run-a bağlayırıq
            for adj in adjustments:
                adj.payroll_run_id = run.id

        run.payslips.extend(calculated_payslips)
        run.total_gross = tot_gross
        run.total_employee_taxes = tot_emp_tax
        run.total_employer_taxes = tot_empr_tax
        run.total_deductions = tot_ded
        run.total_net = tot_net
        run.total_employer_cost = tot_empr_cost
        run.input_hash = PayrollCalculationEngine.compute_input_hash(input_snapshot)
        run.status = PayrollRunStatus.CALCULATED

        return await self.repo.save_run(run)

    async def submit_for_review(self, run_id: uuid.UUID, actor: Any) -> PayrollRun:
        PayrollPolicy.check_can_create_run(actor)
        run = await self.repo.get_run(run_id)
        if not run:
            raise NotFoundError(f"Maaş hesablama sənədi tapılmadı: {run_id}")
        PayrollPolicy.check_branch_scope(actor, run.branch_id)

        if run.status != PayrollRunStatus.CALCULATED:
            raise BusinessRuleViolationError("Yalnız CALCULATED statusunda olan sənəd rəyə göndərilə bilər.")

        run.status = PayrollRunStatus.UNDER_REVIEW
        return await self.repo.save_run(run)

    async def approve_payroll_run(self, run_id: uuid.UUID, actor: Any) -> PayrollRun:
        run = await self.repo.get_run(run_id)
        if not run:
            raise NotFoundError(f"Maaş hesablama sənədi tapılmadı: {run_id}")
        PayrollPolicy.check_branch_scope(actor, run.branch_id)

        # SoD yoxlanışı
        PayrollPolicy.check_can_approve_run(actor, run.prepared_by)

        if run.status != PayrollRunStatus.UNDER_REVIEW:
            raise BusinessRuleViolationError("Yalnız UNDER_REVIEW statusunda olan sənəd təsdiq edilə bilər.")

        run.status = PayrollRunStatus.APPROVED
        run.approved_by = getattr(actor, "id", None)
        run.approved_at = utc_now()
        return await self.repo.save_run(run)

    async def finalize_payroll_run(self, run_id: uuid.UUID, actor: Any) -> PayrollRun:
        """Maaş cədvəlini dondurur, filial bölgüsünü hesablayır və outbox hadisəsi buraxır."""
        PayrollPolicy.check_can_finalize_run(actor)
        run = await self.repo.get_run(run_id)
        if not run:
            raise NotFoundError(f"Maaş hesablama sənədi tapılmadı: {run_id}")
        PayrollPolicy.check_branch_scope(actor, run.branch_id)

        if run.status != PayrollRunStatus.APPROVED:
            raise BusinessRuleViolationError("Yalnız APPROVED statusunda olan sənəd yekunlaşdırıla bilər.")

        run.status = PayrollRunStatus.FINALIZED

        # Filiallar üzrə xərc bölgüsü (Branch allocation)
        branch_stats: dict[uuid.UUID, dict[str, Decimal]] = {}
        for p in run.payslips:
            emp_stmt = select(Employee).where(Employee.id == p.employee_id)
            emp_res = await self.session.execute(emp_stmt)
            emp = emp_res.scalar_one_or_none()
            b_id = (emp.branch_id if emp and emp.branch_id else run.branch_id) or uuid.UUID("00000000-0000-0000-0000-000000000001")

            if b_id not in branch_stats:
                branch_stats[b_id] = {
                    "gross": Decimal("0.00"),
                    "tax": Decimal("0.00"),
                    "net": Decimal("0.00"),
                    "cost": Decimal("0.00"),
                }
            branch_stats[b_id]["gross"] += p.gross_pay
            branch_stats[b_id]["tax"] += (p.employee_taxes + p.employer_taxes)
            branch_stats[b_id]["net"] += p.net_pay
            branch_stats[b_id]["cost"] += (p.gross_pay + p.employer_taxes)

        allocations = [
            PayrollBranchAllocation(
                payroll_run_id=run.id,
                branch_id=b_id,
                allocated_gross=stats["gross"],
                allocated_taxes=stats["tax"],
                allocated_net=stats["net"],
                allocated_employer_cost=stats["cost"],
            )
            for b_id, stats in branch_stats.items()
        ]
        run.branch_allocations = allocations
        await self.repo.save_allocations_bulk(allocations)

        # Transactional outbox hadisəsi (Maliyyə modulu tərəfindən istehlak edilir)
        event_payload = {
            "payroll_run_id": str(run.id),
            "run_no": run.run_no,
            "period_start": run.period_start.isoformat(),
            "period_end": run.period_end.isoformat(),
            "branch_id": str(run.branch_id) if run.branch_id else None,
            "total_gross_salary": str(run.total_gross),
            "total_net_salary": str(run.total_net),
            "total_amount": str(run.total_net),
            "total_employer_cost": str(run.total_employer_cost),
            "allocations": [
                {
                    "branch_id": str(a.branch_id),
                    "gross": str(a.allocated_gross),
                    "net": str(a.allocated_net),
                    "cost": str(a.allocated_employer_cost),
                }
                for a in allocations
            ],
        }

        domain_event = DomainEvent(
            event_type="payroll.finalized",
            aggregate_type="payroll_run",
            aggregate_id=str(run.id),
            payload=event_payload,
        )
        await record_outbox_event(self.session, domain_event)

        return await self.repo.save_run(run)

    async def mark_run_as_paid(self, run_id: uuid.UUID, actor: Any) -> PayrollRun:
        PayrollPolicy.check_can_pay_run(actor)
        run = await self.repo.get_run(run_id)
        if not run:
            raise NotFoundError(f"Maaş hesablama sənədi tapılmadı: {run_id}")
        PayrollPolicy.check_branch_scope(actor, run.branch_id)

        if run.status != PayrollRunStatus.FINALIZED:
            raise BusinessRuleViolationError("Yalnız FINALIZED statusunda olan sənəd ödənildi edilə bilər.")

        run.status = PayrollRunStatus.PAID
        return await self.repo.save_run(run)

    # ------------------------------------------
    # Bank Export & PDF Payslip
    # ------------------------------------------

    async def export_bank_payment_file(
        self, run_id: uuid.UUID, actor: Any
    ) -> BankPaymentExportResponse:
        """Bank ödənişi üçün CSV reyestrini formalaşdırır."""
        PayrollPolicy.check_can_export(actor)
        run = await self.repo.get_run(run_id)
        if not run:
            raise NotFoundError(f"Maaş hesablama sənədi tapılmadı: {run_id}")
        PayrollPolicy.check_branch_scope(actor, run.branch_id)

        lines: list[str] = [
            "İşçi Tabel No;İşçinin Adı Soyadı;Bank Hesabı (IBAN);Ödəniləcək Məbləğ;Valyuta;Təyinat"
        ]

        total_amount = Decimal("0.00")
        for p in run.payslips:
            emp_stmt = select(Employee).where(Employee.id == p.employee_id)
            emp_res = await self.session.execute(emp_stmt)
            emp = emp_res.scalar_one_or_none()
            if not emp:
                continue

            sens_stmt = select(EmployeeSensitiveData).where(
                EmployeeSensitiveData.employee_id == emp.id
            )
            sens_res = await self.session.execute(sens_stmt)
            sens = sens_res.scalar_one_or_none()
            iban = decrypt_pii(sens.bank_account_encrypted) if sens else "AZ00XXXX00000000000000000000"

            line = f"{emp.employee_no};{emp.full_name};{iban};{p.net_pay};{p.currency};Əməkhaqqı {run.period_start.strftime('%m/%Y')}"
            lines.append(line)
            total_amount += p.net_pay

        content = "\n".join(lines)
        filename = f"bank_payroll_export_{run.run_no}.csv"

        return BankPaymentExportResponse(
            filename=filename,
            content=content,
            total_records=len(run.payslips),
            total_amount=total_amount,
        )

    async def generate_payslip_pdf(self, payslip_id: uuid.UUID, actor: Any) -> bytes:
        """ReportLab ilə rəsmi PDF maaş vərəqəsi formalaşdırır."""
        payslip = await self.repo.get_payslip(payslip_id)
        if not payslip:
            raise NotFoundError(f"Maaş vərəqəsi tapılmadı: {payslip_id}")

        # Səlahiyyət və ya fərdi sahiblik yoxlanışı
        emp_stmt = select(Employee).where(Employee.id == payslip.employee_id)
        emp_res = await self.session.execute(emp_stmt)
        emp = emp_res.scalar_one_or_none()

        actor_id = getattr(actor, "id", None)
        is_owner = emp and emp.linked_user_id and actor_id == emp.linked_user_id
        if not is_owner:
            PayrollPolicy.check_can_view_all_payslips(actor)

        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        pdf.setTitle(f"Maaş Vərəqəsi - {emp.employee_no if emp else 'İşçi'}")

        # Başlıq
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(50, 800, "BRAND HOUSE ERP — RƏSMİ MAAŞ VƏRƏQƏSİ (PAYSLIP)")
        pdf.setFont("Helvetica", 10)
        pdf.drawString(50, 785, f"Tarix: {utc_now().strftime('%d.%m.%Y %H:%M')}")
        pdf.line(50, 775, 545, 775)

        # İşçi məlumatları
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(50, 750, f"İşçi: {emp.full_name if emp else 'N/A'}")
        pdf.setFont("Helvetica", 10)
        pdf.drawString(50, 735, f"Tabel No: {emp.employee_no if emp else 'N/A'}")
        pdf.drawString(50, 720, f"Vəzifə: {emp.job_title if emp else 'N/A'}")
        pdf.drawString(50, 705, f"Bank Hesabı: {payslip.masked_bank_account}")

        # Hesablama detalları
        y = 660
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(50, y, "Tərkib")
        pdf.drawString(400, y, f"Məbləğ ({payslip.currency})")
        pdf.line(50, y - 5, 545, y - 5)
        y -= 20

        pdf.setFont("Helvetica", 10)
        for item in payslip.line_items:
            pdf.drawString(50, y, f"{item.name} ({item.code})")
            pdf.drawString(400, y, f"{item.amount:,.2f}")
            y -= 18

        # Nəticə yekunları
        pdf.line(50, y - 5, 545, y - 5)
        y -= 25
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(50, y, "Ümumi Hesablanmış (Gross):")
        pdf.drawString(400, y, f"{payslip.gross_pay:,.2f} {payslip.currency}")
        y -= 18
        pdf.drawString(50, y, "Vergi və Sığorta Tutulmaları:")
        pdf.drawString(400, y, f"-{payslip.employee_taxes:,.2f} {payslip.currency}")
        y -= 18
        pdf.drawString(50, y, "Digər Kəsintilər:")
        pdf.drawString(400, y, f"-{payslip.deductions:,.2f} {payslip.currency}")
        y -= 22
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(50, y, "Ödəniləcək Xalis Məbləğ (Net Pay):")
        pdf.drawString(400, y, f"{payslip.net_pay:,.2f} {payslip.currency}")

        pdf.showPage()
        pdf.save()
        return buffer.getvalue()

    async def create_reversal_run(
        self, run_id: uuid.UUID, reason: str, actor: Any
    ) -> PayrollRun:
        """Yekunlaşmış maaş sənədinə kompensasiya edici ləğv (reversal) sənədi yaradır."""
        PayrollPolicy.check_can_finalize_run(actor)
        orig_run = await self.repo.get_run(run_id)
        if not orig_run:
            raise NotFoundError(f"Orijinal maaş sənədi tapılmadı: {run_id}")

        if orig_run.status not in (PayrollRunStatus.FINALIZED, PayrollRunStatus.PAID):
            raise BusinessRuleViolationError("Yalnız yekunlaşmış sənədlər ləğv edilə bilər.")

        rev_no = f"REV-{orig_run.run_no}"
        rev_run = PayrollRun(
            run_no=rev_no,
            period_start=orig_run.period_start,
            period_end=orig_run.period_end,
            branch_id=orig_run.branch_id,
            status=PayrollRunStatus.FINALIZED,
            prepared_by=getattr(actor, "id", None),
            approved_by=getattr(actor, "id", None),
            approved_at=utc_now(),
            total_gross=-orig_run.total_gross,
            total_employee_taxes=-orig_run.total_employee_taxes,
            total_employer_taxes=-orig_run.total_employer_taxes,
            total_deductions=-orig_run.total_deductions,
            total_net=-orig_run.total_net,
            total_employer_cost=-orig_run.total_employer_cost,
            reversal_of_run_id=orig_run.id,
            payslips=[],
            branch_allocations=[],
        )

        for p in orig_run.payslips:
            rev_p = Payslip(
                payroll_run_id=rev_run.id,
                employee_id=p.employee_id,
                gross_pay=-p.gross_pay,
                net_pay=-p.net_pay,
                employee_taxes=-p.employee_taxes,
                employer_taxes=-p.employer_taxes,
                deductions=-p.deductions,
                payment_method=p.payment_method,
                masked_bank_account=p.masked_bank_account,
                currency=p.currency,
            )
            for item in p.line_items:
                rev_p.line_items.append(
                    PayslipLineItem(
                        category=item.category,
                        code=f"REV_{item.code}",
                        name=f"Ləğv: {item.name}",
                        amount=-item.amount,
                        calculation_detail=f"Reversal of {item.amount} ({reason})",
                    )
                )
            rev_run.payslips.append(rev_p)

        saved_rev = await self.repo.save_run(rev_run)

        # Ləğv hadisəsi outbox-a yazılır
        domain_event = DomainEvent(
            event_type="payroll.finalized",
            aggregate_type="payroll_run",
            aggregate_id=str(saved_rev.id),
            payload={
                "payroll_run_id": str(saved_rev.id),
                "run_no": saved_rev.run_no,
                "is_reversal": True,
                "reversal_of": orig_run.run_no,
                "total_net_salary": str(saved_rev.total_net),
                "total_amount": str(saved_rev.total_net),
            },
        )
        await record_outbox_event(self.session, domain_event)

        return saved_rev
