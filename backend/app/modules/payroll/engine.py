"""Deterministik Maaş Hesablama Mühərriki (Payroll Engine).

Funksionallıq:
- 4 Kompensasiya Modelinin dəstəklənməsi: FIXED, HOURLY, MIXED, COMMISSION_BONUS
- Ayın ortasında işə qəbul və ya çıxış üçün proporsional gün bölgüsü (Proration)
- Kilidlənmiş aylıq tabel (Timesheet) inteqrasiyası (normal və əlavə iş saatları)
- Dərəcə və vergi qaydaları dinamik `rule_set`-dən oxunur (hardcode hüquqi iddia yoxdur!)
- Mənfi maaş mühafizəsi (Non-negative Net Pay protection)
- 2 onluq dəqiqliklə bankir / qalıqsız yuvarlaqlaşdırma (Exact cent rounding)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.modules.hr.models import Employee, Timesheet
from app.modules.payroll.models import (
    AdjustmentType,
    CompensationModel,
    LineItemCategory,
    PayrollAdjustment,
    PayrollRuleSet,
    SalaryProfile,
)

TWO_PLACES = Decimal("0.01")


def round_cents(val: Decimal) -> Decimal:
    """Məbləği dəqiq 2 onluq kəsrə (qəpiyə) yuvarlaqlaşdırır."""
    return val.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


@dataclass
class CalculatedLineItem:
    category: LineItemCategory
    code: str
    name: str
    amount: Decimal
    calculation_detail: str | None = None


@dataclass
class CalculatedPayslip:
    employee_id: Any
    gross_pay: Decimal
    net_pay: Decimal
    employee_taxes: Decimal
    employer_taxes: Decimal
    deductions: Decimal
    masked_bank_account: str
    currency: str
    line_items: list[CalculatedLineItem]


class PayrollCalculationEngine:
    """Təkrar istehsal olunan (reproducible) deterministik maaş kalkulyatoru."""

    @classmethod
    def calculate_employee_payslip(
        cls,
        employee: Employee,
        profile: SalaryProfile,
        period_start: date,
        period_end: date,
        timesheet: Timesheet | None = None,
        adjustments: list[PayrollAdjustment] | None = None,
        rule_set: PayrollRuleSet | None = None,
        masked_bank_account: str = "***",
    ) -> CalculatedPayslip:
        adjustments = adjustments or []
        config = rule_set.rules_config if rule_set else {}

        # 1. Proration (Ayın ortasında işə başlama və ya çıxış)
        total_days = (period_end - period_start).days + 1
        active_start = max(period_start, employee.hire_date)
        active_end = period_end
        if employee.termination_date and employee.termination_date < period_end:
            active_end = employee.termination_date

        if active_start > period_end or active_end < period_start:
            worked_days = 0
        else:
            worked_days = max(0, (active_end - active_start).days + 1)

        proration_factor = Decimal(worked_days) / Decimal(total_days)
        if proration_factor > Decimal("1.0"):
            proration_factor = Decimal("1.0")

        line_items: list[CalculatedLineItem] = []
        gross_pay = Decimal("0.00")

        # 2. Kompensasiya Modeli üzrə baza və əlavə vaxt
        if profile.compensation_model == CompensationModel.FIXED:
            base_amount = round_cents(profile.base_salary * proration_factor)
            gross_pay += base_amount
            line_items.append(
                CalculatedLineItem(
                    category=LineItemCategory.BASE,
                    code="BASE_SALARY",
                    name="Aylıq Əsas Əmək Haqqı",
                    amount=base_amount,
                    calculation_detail=f"{profile.base_salary} x {proration_factor:.4f} ({worked_days}/{total_days} gün)",
                )
            )

        elif profile.compensation_model == CompensationModel.HOURLY:
            reg_hours = timesheet.total_regular_hours if timesheet else Decimal("0.00")
            ot_hours = timesheet.total_overtime_hours if timesheet else Decimal("0.00")
            ot_multiplier = Decimal(str(config.get("overtime_multiplier", "1.5")))

            reg_amount = round_cents(reg_hours * profile.hourly_rate)
            ot_amount = round_cents(ot_hours * profile.hourly_rate * ot_multiplier)

            gross_pay += reg_amount + ot_amount
            line_items.append(
                CalculatedLineItem(
                    category=LineItemCategory.BASE,
                    code="HOURLY_REGULAR",
                    name="Faktiki İş Saatları",
                    amount=reg_amount,
                    calculation_detail=f"{reg_hours} saat x {profile.hourly_rate} {profile.currency}",
                )
            )
            if ot_amount > 0:
                line_items.append(
                    CalculatedLineItem(
                        category=LineItemCategory.OVERTIME,
                        code="HOURLY_OVERTIME",
                        name="İş Vaxtından Artıq Saatlar",
                        amount=ot_amount,
                        calculation_detail=f"{ot_hours} saat x {profile.hourly_rate} x {ot_multiplier}",
                    )
                )

        elif profile.compensation_model == CompensationModel.MIXED:
            base_amount = round_cents(profile.base_salary * proration_factor)
            ot_hours = timesheet.total_overtime_hours if timesheet else Decimal("0.00")
            ot_multiplier = Decimal(str(config.get("overtime_multiplier", "1.5")))
            hourly_equiv = (
                profile.hourly_rate
                if profile.hourly_rate > 0
                else round_cents(profile.base_salary / Decimal("160.00"))
            )
            ot_amount = round_cents(ot_hours * hourly_equiv * ot_multiplier)

            gross_pay += base_amount + ot_amount
            line_items.append(
                CalculatedLineItem(
                    category=LineItemCategory.BASE,
                    code="BASE_SALARY",
                    name="Sabit Əsas Əmək Haqqı",
                    amount=base_amount,
                    calculation_detail=f"{profile.base_salary} x {proration_factor:.4f}",
                )
            )
            if ot_amount > 0:
                line_items.append(
                    CalculatedLineItem(
                        category=LineItemCategory.OVERTIME,
                        code="MIXED_OVERTIME",
                        name="Əlavə Vaxt Əmək Haqqı",
                        amount=ot_amount,
                        calculation_detail=f"{ot_hours} saat x {hourly_equiv} x {ot_multiplier}",
                    )
                )

        elif profile.compensation_model == CompensationModel.COMMISSION_BONUS:
            base_amount = round_cents(profile.base_salary * proration_factor)
            gross_pay += base_amount
            line_items.append(
                CalculatedLineItem(
                    category=LineItemCategory.BASE,
                    code="BASE_SALARY",
                    name="Baza Əmək Haqqı",
                    amount=base_amount,
                    calculation_detail=f"{profile.base_salary} x {proration_factor:.4f}",
                )
            )

        # 3. Düzəlişlər (Adjustments: Bonus, Komissiya, Müavinət, Kəsintilər)
        total_deductions = Decimal("0.00")
        for adj in adjustments:
            if adj.type in (AdjustmentType.BONUS, AdjustmentType.COMMISSION, AdjustmentType.ALLOWANCE):
                adj_amount = round_cents(adj.amount)
                gross_pay += adj_amount
                category_map = {
                    AdjustmentType.BONUS: LineItemCategory.BONUS,
                    AdjustmentType.COMMISSION: LineItemCategory.COMMISSION,
                    AdjustmentType.ALLOWANCE: LineItemCategory.ALLOWANCE,
                }
                line_items.append(
                    CalculatedLineItem(
                        category=category_map[adj.type],
                        code=adj.type.name,
                        name=adj.description,
                        amount=adj_amount,
                    )
                )
            elif adj.type in (AdjustmentType.DEDUCTION, AdjustmentType.ADVANCE_REPAYMENT):
                ded_amount = round_cents(adj.amount)
                total_deductions += ded_amount
                line_items.append(
                    CalculatedLineItem(
                        category=LineItemCategory.DEDUCTION,
                        code=adj.type.name,
                        name=adj.description,
                        amount=-ded_amount,
                    )
                )

        # 4. Vergi və Sosial Sığorta Hesablaması (Konfiqurasiya edilə bilən dərəcələr)
        income_tax_rate = Decimal(str(config.get("income_tax_rate", "0.00")))
        dsmf_emp_rate = Decimal(str(config.get("dsmf_employee_rate", "0.03")))
        its_emp_rate = Decimal(str(config.get("its_employee_rate", "0.02")))
        unemp_emp_rate = Decimal(str(config.get("unemployment_employee_rate", "0.005")))

        dsmf_employer_rate = Decimal(str(config.get("dsmf_employer_rate", "0.22")))
        its_employer_rate = Decimal(str(config.get("its_employer_rate", "0.02")))
        unemp_employer_rate = Decimal(str(config.get("unemployment_employer_rate", "0.005")))

        # İşçidən tutulanlar
        income_tax = round_cents(gross_pay * income_tax_rate)
        dsmf_emp = round_cents(gross_pay * dsmf_emp_rate)
        its_emp = round_cents(gross_pay * its_emp_rate)
        unemp_emp = round_cents(gross_pay * unemp_emp_rate)
        employee_taxes = income_tax + dsmf_emp + its_emp + unemp_emp

        if income_tax > 0:
            line_items.append(
                CalculatedLineItem(
                    category=LineItemCategory.TAX,
                    code="INCOME_TAX",
                    name="Gəlir Vergisi",
                    amount=-income_tax,
                    calculation_detail=f"{gross_pay} x {income_tax_rate}",
                )
            )
        if dsmf_emp > 0:
            line_items.append(
                CalculatedLineItem(
                    category=LineItemCategory.SOCIAL_INSURANCE,
                    code="DSMF_EMPLOYEE",
                    name="Məcburi Dövlət Sosial Sığortası (İşçi)",
                    amount=-dsmf_emp,
                    calculation_detail=f"{gross_pay} x {dsmf_emp_rate}",
                )
            )
        if its_emp > 0:
            line_items.append(
                CalculatedLineItem(
                    category=LineItemCategory.SOCIAL_INSURANCE,
                    code="ITS_EMPLOYEE",
                    name="İcbari Tibbi Sığorta (İşçi)",
                    amount=-its_emp,
                    calculation_detail=f"{gross_pay} x {its_emp_rate}",
                )
            )
        if unemp_emp > 0:
            line_items.append(
                CalculatedLineItem(
                    category=LineItemCategory.SOCIAL_INSURANCE,
                    code="UNEMP_EMPLOYEE",
                    name="İşsizlikdən Sığorta (İşçi)",
                    amount=-unemp_emp,
                    calculation_detail=f"{gross_pay} x {unemp_emp_rate}",
                )
            )

        # İşəgötürənin ödədiyi vergilər
        dsmf_employer = round_cents(gross_pay * dsmf_employer_rate)
        its_employer = round_cents(gross_pay * its_employer_rate)
        unemp_employer = round_cents(gross_pay * unemp_employer_rate)
        employer_taxes = dsmf_employer + its_employer + unemp_employer

        # 5. Xalis Əmək Haqqı (Net Pay) və Mənfi Dəyərdən Mühafizə
        net_pay = gross_pay - employee_taxes - total_deductions
        if net_pay < Decimal("0.00"):
            net_pay = Decimal("0.00")

        return CalculatedPayslip(
            employee_id=employee.id,
            gross_pay=round_cents(gross_pay),
            net_pay=round_cents(net_pay),
            employee_taxes=round_cents(employee_taxes),
            employer_taxes=round_cents(employer_taxes),
            deductions=round_cents(total_deductions),
            masked_bank_account=masked_bank_account,
            currency=profile.currency,
            line_items=line_items,
        )

    @classmethod
    def compute_input_hash(cls, run_payload: dict[str, Any]) -> str:
        """Maaş hesablama parametr və dərəcələrinin kriptoqrafik SHA-256 heşini hesablayır."""
        raw = json.dumps(run_payload, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()
