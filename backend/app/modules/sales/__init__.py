"""Satışlar Modulu."""

from app.modules.sales.router import router as sales_router
from app.modules.sales.service import SalesService, get_sales_service

__all__ = ["SalesService", "get_sales_service", "sales_router"]
