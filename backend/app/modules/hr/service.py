"""HR Modulu Əsas Xidmət Fasadı (HR Service Facade)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.hr.services.attendance_service import AttendanceService
from app.modules.hr.services.employee_service import EmployeeService
from app.modules.hr.services.leave_service import LeaveService
from app.modules.hr.services.schedule_service import ScheduleService


class HRService:
    """HR modulu üzrə bütün alt servisləri birləşdirən mərkəzi fasad."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.employees = EmployeeService(session)
        self.schedules = ScheduleService(session)
        self.attendance = AttendanceService(session)
        self.leave = LeaveService(session)

