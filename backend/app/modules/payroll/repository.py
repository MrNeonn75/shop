"""Əmək Haqqı (Payroll) Repozitorisi (DB Operations)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.payroll.models import (
    PayrollAdjustment,
    PayrollBranchAllocation,
    PayrollRuleSet,
    PayrollRun,
    PayrollRunStatus,
    Payslip,
    SalaryProfile,
)


class PayrollRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------
    # Salary Profiles
    # ------------------------------------------

    async def get_active_salary_profile(self, employee_id: uuid.UUID) -> SalaryProfile | None:
        stmt = (
            select(SalaryProfile)
            .where(SalaryProfile.employee_id == employee_id, SalaryProfile.is_active.is_(True))
            .order_by(SalaryProfile.version.desc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def save_salary_profile(self, profile: SalaryProfile) -> SalaryProfile:
        self.session.add(profile)
        await self.session.flush()
        return profile

    # ------------------------------------------
    # Rule Sets
    # ------------------------------------------

    async def get_latest_rule_set(self) -> PayrollRuleSet | None:
        stmt = (
            select(PayrollRuleSet)
            .where(PayrollRuleSet.is_active.is_(True))
            .order_by(PayrollRuleSet.effective_date.desc(), PayrollRuleSet.version.desc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def get_rule_set(self, rule_set_id: uuid.UUID) -> PayrollRuleSet | None:
        stmt = select(PayrollRuleSet).where(PayrollRuleSet.id == rule_set_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def save_rule_set(self, rule_set: PayrollRuleSet) -> PayrollRuleSet:
        self.session.add(rule_set)
        await self.session.flush()
        return rule_set

    # ------------------------------------------
    # Adjustments
    # ------------------------------------------

    async def create_adjustment(self, adjustment: PayrollAdjustment) -> PayrollAdjustment:
        self.session.add(adjustment)
        await self.session.flush()
        return adjustment

    async def list_pending_adjustments_for_employee(
        self, employee_id: uuid.UUID
    ) -> Sequence[PayrollAdjustment]:
        stmt = select(PayrollAdjustment).where(
            PayrollAdjustment.employee_id == employee_id,
            PayrollAdjustment.payroll_run_id.is_(None),
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    # ------------------------------------------
    # Runs
    # ------------------------------------------

    async def get_run(self, run_id: uuid.UUID) -> PayrollRun | None:
        stmt = (
            select(PayrollRun)
            .options(
                selectinload(PayrollRun.payslips).selectinload(Payslip.line_items),
                selectinload(PayrollRun.branch_allocations),
            )
            .where(PayrollRun.id == run_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_run_by_no(self, run_no: str) -> PayrollRun | None:
        stmt = select(PayrollRun).where(PayrollRun.run_no == run_no)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_runs(
        self, branch_id: uuid.UUID | None = None, status: PayrollRunStatus | None = None
    ) -> Sequence[PayrollRun]:
        stmt = select(PayrollRun).options(selectinload(PayrollRun.branch_allocations))
        if branch_id:
            stmt = stmt.where(PayrollRun.branch_id == branch_id)
        if status:
            stmt = stmt.where(PayrollRun.status == status)
        stmt = stmt.order_by(PayrollRun.created_at.desc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def save_run(self, run: PayrollRun) -> PayrollRun:
        self.session.add(run)
        await self.session.flush()
        return run

    # ------------------------------------------
    # Payslips & Allocations
    # ------------------------------------------

    async def get_payslip(self, payslip_id: uuid.UUID) -> Payslip | None:
        stmt = (
            select(Payslip)
            .options(selectinload(Payslip.line_items))
            .where(Payslip.id == payslip_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_payslips_for_employee(
        self, employee_id: uuid.UUID
    ) -> Sequence[Payslip]:
        stmt = (
            select(Payslip)
            .options(selectinload(Payslip.line_items))
            .where(Payslip.employee_id == employee_id)
            .order_by(Payslip.created_at.desc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def save_payslips_bulk(self, payslips: list[Payslip]) -> list[Payslip]:
        self.session.add_all(payslips)
        await self.session.flush()
        return payslips

    async def save_allocations_bulk(
        self, allocations: list[PayrollBranchAllocation]
    ) -> list[PayrollBranchAllocation]:
        self.session.add_all(allocations)
        await self.session.flush()
        return allocations
