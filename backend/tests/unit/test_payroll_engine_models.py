"""Maaş Mühərriki: 4 Kompensasiya Modeli, Proration və Vergi Qaydaları Testləri."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.modules.hr.models import Employee, Timesheet
from app.modules.payroll.engine import PayrollCalculationEngine
from app.modules.payroll.models import (
    AdjustmentType,
    CompensationModel,
    PayrollAdjustment,
    PayrollRuleSet,
    SalaryProfile,
)


@pytest.fixture
def demo_rule_set() -> PayrollRuleSet:
    return PayrollRuleSet(
        name="Demo Qaydalar",
        version=1,
        effective_date=date(2026, 1, 1),
        rules_config={
            "overtime_multiplier": "1.5",
            "income_tax_rate": "0.00",  # Güzəştli demo
            "dsmf_employee_rate": "0.03",  # 3%
            "its_employee_rate": "0.02",  # 2%
            "unemployment_employee_rate": "0.005",  # 0.5%
            "dsmf_employer_rate": "0.22",
            "its_employer_rate": "0.02",
            "unemployment_employer_rate": "0.005",
        },
    )


def test_fixed_compensation_model_with_mid_month_hire_proration(
    demo_rule_set: PayrollRuleSet,
) -> None:
    # 30 günlük ay: 2026-04-01 - 2026-04-30
    # İşçi 16 apreldə işə qəbul olunub (30 - 16 + 1 = 15 gün işləyib -> 50% proration)
    emp = Employee(
        id=uuid.uuid4(),
        employee_no="EMP-PR-1",
        full_name="Fuad Əliyev",
        email="fuad@brandhouse.az",
        phone="1",
        job_title="Mütəxəssis",
        hire_date=date(2026, 4, 16),
    )
    profile = SalaryProfile(
        employee_id=emp.id,
        compensation_model=CompensationModel.FIXED,
        base_salary=Decimal("1000.00"),
        currency="AZN",
    )

    payslip = PayrollCalculationEngine.calculate_employee_payslip(
        employee=emp,
        profile=profile,
        period_start=date(2026, 4, 1),
        period_end=date(2026, 4, 30),
        rule_set=demo_rule_set,
    )

    # 1000 * (15/30) = 500.00 AZN gross
    assert payslip.gross_pay == Decimal("500.00")
    # İşçi vergiləri: 3% (15) + 2% (10) + 0.5% (2.50) = 27.50 AZN
    assert payslip.employee_taxes == Decimal("27.50")
    # Xalis maaş: 500 - 27.50 = 472.50 AZN
    assert payslip.net_pay == Decimal("472.50")

    base_line = next(i for i in payslip.line_items if i.code == "BASE_SALARY")
    assert base_line.amount == Decimal("500.00")
    assert "15/30" in (base_line.calculation_detail or "")


def test_hourly_compensation_model_with_timesheet_overtime(
    demo_rule_set: PayrollRuleSet,
) -> None:
    emp = Employee(
        id=uuid.uuid4(),
        employee_no="EMP-PR-2",
        full_name="Cəmil Məmmədov",
        email="camil@brandhouse.az",
        phone="2",
        job_title="Qablaşdırıcı",
        hire_date=date(2026, 1, 1),
    )
    profile = SalaryProfile(
        employee_id=emp.id,
        compensation_model=CompensationModel.HOURLY,
        hourly_rate=Decimal("10.00"),
        currency="AZN",
    )
    # Tabel: 160 saat normal, 10 saat əlavə vaxt (1.5x)
    timesheet = Timesheet(
        employee_id=emp.id,
        period_year=2026,
        period_month=10,
        total_regular_hours=Decimal("160.00"),
        total_overtime_hours=Decimal("10.00"),
    )

    payslip = PayrollCalculationEngine.calculate_employee_payslip(
        employee=emp,
        profile=profile,
        period_start=date(2026, 10, 1),
        period_end=date(2026, 10, 31),
        timesheet=timesheet,
        rule_set=demo_rule_set,
    )

    # Normal: 160 * 10 = 1600.00
    # Overtime: 10 * 10 * 1.5 = 150.00
    # Gross: 1750.00
    assert payslip.gross_pay == Decimal("1750.00")
    ot_line = next(i for i in payslip.line_items if i.code == "HOURLY_OVERTIME")
    assert ot_line.amount == Decimal("150.00")


def test_mixed_compensation_model(demo_rule_set: PayrollRuleSet) -> None:
    emp = Employee(
        id=uuid.uuid4(),
        employee_no="EMP-PR-3",
        full_name="Sevinc İsmayılova",
        email="sevinc@brandhouse.az",
        phone="3",
        job_title="Baş Kassir",
        hire_date=date(2026, 1, 1),
    )
    profile = SalaryProfile(
        employee_id=emp.id,
        compensation_model=CompensationModel.MIXED,
        base_salary=Decimal("800.00"),
        hourly_rate=Decimal("5.00"),
        currency="AZN",
    )
    timesheet = Timesheet(
        employee_id=emp.id,
        period_year=2026,
        period_month=10,
        total_regular_hours=Decimal("160.00"),
        total_overtime_hours=Decimal("8.00"),
    )

    payslip = PayrollCalculationEngine.calculate_employee_payslip(
        employee=emp,
        profile=profile,
        period_start=date(2026, 10, 1),
        period_end=date(2026, 10, 31),
        timesheet=timesheet,
        rule_set=demo_rule_set,
    )

    # Base: 800.00
    # Overtime: 8 * 5 * 1.5 = 60.00
    # Gross: 860.00
    assert payslip.gross_pay == Decimal("860.00")


def test_adjustments_and_non_negative_net_pay_protection(
    demo_rule_set: PayrollRuleSet,
) -> None:
    emp = Employee(
        id=uuid.uuid4(),
        employee_no="EMP-PR-4",
        full_name="Murad Vəliyev",
        email="murad@brandhouse.az",
        phone="4",
        job_title="Kuryer",
        hire_date=date(2026, 1, 1),
    )
    profile = SalaryProfile(
        employee_id=emp.id,
        compensation_model=CompensationModel.FIXED,
        base_salary=Decimal("500.00"),
        currency="AZN",
    )

    # 1. Bonus əlavəsi: +100 AZN
    bonus = PayrollAdjustment(
        employee_id=emp.id,
        type=AdjustmentType.BONUS,
        amount=Decimal("100.00"),
        description="Rüblük Fərqlənmə Bonusu",
        approved_by=uuid.uuid4(),
    )
    # 2. Böyük kəsinti (cərimə/avans): 800 AZN (Maaşdan çox!)
    deduction = PayrollAdjustment(
        employee_id=emp.id,
        type=AdjustmentType.ADVANCE_REPAYMENT,
        amount=Decimal("800.00"),
        description="Əvvəlki aydan avans qaytarması",
        approved_by=uuid.uuid4(),
    )

    payslip = PayrollCalculationEngine.calculate_employee_payslip(
        employee=emp,
        profile=profile,
        period_start=date(2026, 10, 1),
        period_end=date(2026, 10, 31),
        adjustments=[bonus, deduction],
        rule_set=demo_rule_set,
    )

    # Gross: 500 + 100 = 600.00 AZN
    assert payslip.gross_pay == Decimal("600.00")
    # Kəsintilər: 800.00 AZN
    assert payslip.deductions == Decimal("800.00")
    # Mənfi ola bilməz -> 0.00 AZN mühafizəsi!
    assert payslip.net_pay == Decimal("0.00")
