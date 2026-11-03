"""Kənar Çağırışlar üçün Qoruyucu Mexanizm (Circuit Breaker Pattern).

Xarici provayder ardıcıl olaraq uğursuzluğa düçar olduqda (məs: 5 dəfə xəta),
dövrə QAPALI (CLOSED) vəziyyətdən AÇIQ (OPEN) vəziyyətə keçir və sistemi bloklamamaq üçün
növbəti çağırışları dərhal rədd edir. Soyuma müddəti (məs: 60 saniyə) bitdikdən sonra
YARIM-AÇIQ (HALF_OPEN) rejimində test sınağı keçirilir.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.core.database import utc_now


class CircuitBreakerOpenError(RuntimeError):
    """Qoruyucu dövrə açıq olduqda (xarici sistem xətaları səbəbindən) qaldırılır."""
    pass


class CircuitBreaker:
    """Tək bir inteqrasiya üçün Circuit Breaker vəziyyət idarəçisi."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout_seconds: int = 60,
    ) -> None:
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds

    def check_can_execute(
        self,
        current_state: str,
        failure_count: int = 0,
        last_failure_at: datetime | None = None,
    ) -> str:
        """Çağırışın icra edilə biləcəyini yoxlayır və cari vəziyyəti qaytarır."""
        _ = failure_count
        now = utc_now()

        if current_state == "OPEN":
            if last_failure_at and (now - last_failure_at) >= timedelta(seconds=self.recovery_timeout_seconds):
                # Soyuma müddəti bitib, sınaq üçün HALF_OPEN rejimə keçirik
                return "HALF_OPEN"
            else:
                raise CircuitBreakerOpenError(
                    "Xarici xidmət ardıcıl xətalar səbəbindən müvəqqəti dayandırılıb (Circuit Breaker OPEN)"
                )

        return current_state

    def record_success(self) -> tuple[str, int]:
        """Uğurlu çağırış zamanı sayğacı sıfırlayır və dövrəni CLOSED edir."""
        return "CLOSED", 0

    def record_failure(
        self,
        current_failure_count: int,
    ) -> tuple[str, int, datetime]:
        """Uğursuz çağırış zamanı sayğacı artırır və hədd aşılıbsa OPEN vəziyyətinə keçirir."""
        new_count = current_failure_count + 1
        now = utc_now()
        if new_count >= self.failure_threshold:
            return "OPEN", new_count, now
        return "CLOSED", new_count, now

