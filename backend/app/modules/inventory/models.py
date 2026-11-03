"""İnventar Modulu ORM Modelləri (Inventory Models).

Bu fayl stok hərəkətləri jurnalı (stock_movements - append-only ledger),
cari qalıqlar (stock_balances - tranzaksional qorunan), rezervasiyalar (stock_reservations),
orta çəkili maya dəyəri vəziyyəti (inventory_cost_state), anbar sənədləri (stock_documents)
və fiziki sayım/inventarizasiya (count_sessions) cədvəllərini təyin edir.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class MovementType(str, enum.Enum):
    """Stok hərəkəti növləri."""

    RECEIPT = "RECEIPT"  # Təchizatçıdan kənar mədaxil
    ISSUE = "ISSUE"  # Təyinatlı məxaric
    TRANSFER_OUT = "TRANSFER_OUT"  # Filialdan tranzit anbarına çıxış
    TRANSFER_IN = "TRANSFER_IN"  # Tranzit anbardan təyinat anbarına giriş
    SALE = "SALE"  # Kassa satışı (POS)
    SALE_RETURN = "SALE_RETURN"  # Müştəri qaytarması (POS)
    PURCHASE_RETURN = "PURCHASE_RETURN"  # Təchizatçıya qaytarma
    ADJUSTMENT_PLUS = "ADJUSTMENT_PLUS"  # Manual müsbət düzəliş (artım)
    ADJUSTMENT_MINUS = "ADJUSTMENT_MINUS"  # Manual mənfi düzəliş (azalma)
    COUNT_VARIANCE = "COUNT_VARIANCE"  # İnventarizasiya/sayım kənarlaşması
    DAMAGED = "DAMAGED"  # Xarab/zədəli malın qeydiyyatı
    LOST = "LOST"  # İtmiş/əskik malın silinməsi (write-off)
    OPENING_BALANCE = "OPENING_BALANCE"  # İlkin qalıq
    REVERSAL = "REVERSAL"  # Əvvəlki hərəkəti kompensasiya edən tərs hərəkət


class StockStatus(str, enum.Enum):
    """Anbardakı malın keyfiyyət/satış statusu."""

    AVAILABLE = "available"  # Satışa və ya transferə hazır
    DAMAGED = "damaged"  # Zədəli / yararsız
    QUARANTINE = "quarantine"  # Karantin / ekspertiza / qadağan edilmiş


class DocumentType(str, enum.Enum):
    """Anbar sənədi növləri."""

    RECEIPT = "receipt"
    ISSUE = "issue"
    ADJUSTMENT = "adjustment"
    DAMAGED = "damaged"
    LOST = "lost"
    RETURNED_CLASSIFICATION = "returned_classification"
    OPENING_BALANCE = "opening_balance"


class DocumentStatus(str, enum.Enum):
    """Anbar sənədi statusları."""

    DRAFT = "draft"
    CONFIRMED = "confirmed"
    REVERSED = "reversed"


class CountSessionStatus(str, enum.Enum):
    """Sayım sessiyasının statusları."""

    DRAFT = "draft"
    FROZEN = "frozen"
    COUNTING = "counting"
    REVIEW = "review"
    APPROVED = "approved"
    POSTED = "posted"
    CANCELLED = "cancelled"


# --- 1. Stok Hərəkətləri Jurnalı (Single Source of Truth - Append-Only Ledger) ---


class StockMovement(Base, BaseMixin):
    """Dəyişməz və silinməz Stok Hərəkət Jurnalı (Stock Ledger).

    Bütün qalıq dəyişiklikləri yalnız və yalnız bu cədvələ yeni sətr əlavə
    edilməklə və eyni tranzaksiyada baş verir.
    """

    __tablename__ = "stock_movements"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    movement_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Fasiləsiz sənəd nömrələnməsi xidməti ilə təyin olunmuş unikal nömrə (məs: MOV-2026-000001)",
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        doc="Biznes hadisəsinin baş vermə tarixi",
    )
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        index=True,
        doc="Sistemin jurnala yazılma (commit) zamanı",
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    from_warehouse_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    to_warehouse_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    from_status: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        default=StockStatus.AVAILABLE.value,
        doc="Məxaric statusu: available, damaged, quarantine",
    )
    to_status: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        default=StockStatus.AVAILABLE.value,
        doc="Mədaxil statusu: available, damaged, quarantine",
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        doc="Hərəkət miqdarı (həmişə müsbət tam ədəd)",
    )
    movement_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
        doc="Hərəkətin növü (RECEIPT, SALE, TRANSFER_OUT və s.)",
    )
    reference_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Mənbə sənəd tipi (stock_document, transfer, pos_sale və s.)",
    )
    reference_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
        doc="Mənbə sənədin ID-si",
    )
    reference_line_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
        doc="Mənbə sənəd sətrinin ID-si",
    )
    reverses_movement_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stock_movements.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        doc="Əgər bu REVERSAL hərəkətidirsə, kompensasiya etdiyi əvvəlki hərəkətin ID-si",
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Hərəkət anındakı vahid maya dəyəri (COGS snapshot)",
    )
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Ümumi maya dəyəri (quantity * unit_cost)",
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
        doc="Əməliyyatı icra edən istifadəçi",
    )
    reason_code_id: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        doc="Səbəb kodu (məsələn, zədələnmə, sayım kənarlaşması)",
    )
    correlation_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        doc="Sorğunun izlənməsi üçün correlation ID",
    )
    idempotency_key: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        doc="Təkrar emalın qarşısını alan idempotency key",
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Əlavə qeydlər",
    )

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_stock_movements_qty_positive"),
        CheckConstraint(
            "from_warehouse_id IS NOT NULL OR to_warehouse_id IS NOT NULL",
            name="chk_stock_movements_has_location",
        ),
        CheckConstraint(
            "(from_warehouse_id IS NULL OR to_warehouse_id IS NULL) OR "
            "(from_warehouse_id != to_warehouse_id OR from_status != to_status)",
            name="chk_stock_movements_locations_differ",
        ),
        UniqueConstraint("company_id", "movement_no", name="uq_stock_movements_no"),
        Index("ix_stock_movements_variant_posted", "variant_id", "posted_at"),
        Index("ix_stock_movements_from_posted", "from_warehouse_id", "posted_at"),
        Index("ix_stock_movements_to_posted", "to_warehouse_id", "posted_at"),
        Index("ix_stock_movements_ref", "reference_type", "reference_id"),
        Index(
            "ix_stock_movements_dup_guard",
            "reference_type",
            "reference_id",
            "reference_line_id",
            "movement_type",
        ),
    )


# --- 2. Stok Qalıqları (Derived Transactionally-Maintained Balances) ---


class StockBalance(Base, BaseMixin):
    """Anbar və variant üzrə anlıq stok qalığı.

    Ledger hərəkətləri ilə eyni tranzaksiyada, deterministik sətir kilidlənməsi
    (SELECT ... FOR UPDATE) ilə yenilənir.
    """

    __tablename__ = "stock_balances"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stock_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=StockStatus.AVAILABLE.value,
        doc="available, damaged, quarantine",
    )
    on_hand: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Faktiki mövcud qalıq",
    )
    allow_negative: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="Yalnız xüsusi səlahiyyət və qərarla mənfiyə düşməyə icazə verən qoruyucu bayraq",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        doc="Optimistik kilidləmə versiya nömrəsi",
    )

    __table_args__ = (
        UniqueConstraint(
            "warehouse_id", "variant_id", "stock_status", name="uq_stock_balances_loc_var_status"
        ),
        CheckConstraint(
            "on_hand >= 0 OR allow_negative IS TRUE",
            name="chk_stock_balances_non_negative",
        ),
        Index("ix_stock_balances_warehouse_onhand", "warehouse_id", "on_hand"),
        Index("ix_stock_balances_variant_onhand", "variant_id", "on_hand"),
    )


# --- 3. Stok Rezervasiyaları (Stock Reservations) ---


class StockReservation(Base, BaseMixin):
    """Sifarişlər və transferlər üçün fiziki olaraq ayrılmış (bloklanmış) stok miqdarı.

    available_stock = on_hand - active_reservations
    """

    __tablename__ = "stock_reservations"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        doc="Rezerv edilmiş miqdar",
    )
    reference_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Rezerv edən sənəd tipi (transfer, order və s.)",
    )
    reference_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
        doc="Rezerv edən sənədin ID-si",
    )
    reference_line_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        index=True,
        doc="'active', 'released', 'consumed'",
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
        doc="Rezervasiyanın bitmə vaxtı (vaxtı keçmiş rezervlər avtomatik azad edilir)",
    )

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_stock_reservations_qty_positive"),
        Index("ix_stock_reservations_active", "warehouse_id", "variant_id", "status"),
    )


# --- 4. Maya Dəyəri Qatı (Inventory Cost State & Valuation) ---


class InventoryCostState(Base, BaseMixin):
    """Orta çəkili maya dəyəri (Weighted-Average Cost) vəziyyəti."""

    __tablename__ = "inventory_cost_state"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        doc="None = Şirkət üzrə mərkəzi orta maya dəyəri, UUID = Anbara xüsusi maya",
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    valuation_method: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="weighted_average",
        doc="weighted_average, fifo",
    )
    total_quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Maya hesablamasındakı ümumi miqdar",
    )
    total_value: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Cari ümumi maya dəyəri məbləği",
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Cari vahid orta çəkili maya dəyəri (total_value / total_quantity)",
    )
    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    __table_args__ = (
        UniqueConstraint(
            "company_id", "warehouse_id", "variant_id", name="uq_inventory_cost_state_scope"
        ),
    )


# --- 5. Dövri Stok Snapshotları (Point-in-Time Stock & Valuation Replay) ---


class StockSnapshot(Base, BaseMixin):
    """Müəyyən tarix üzrə qalıq və maya dəyəri şəkli (Snapshot).

    Tarixi hesabatların ledger üzərindən sıfırdan hesablanmadan sürətli generasiyası üçün istifadə edilir.
    """

    __tablename__ = "stock_snapshots"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stock_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=StockStatus.AVAILABLE.value,
    )
    snapshot_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )
    total_value: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )

    __table_args__ = (
        UniqueConstraint(
            "warehouse_id",
            "variant_id",
            "stock_status",
            "snapshot_date",
            name="uq_stock_snapshots_day",
        ),
        Index("ix_stock_snapshots_date_loc", "snapshot_date", "warehouse_id"),
    )


# --- 6. Anbar Sənədləri (Stock Documents) ---


class StockDocument(Base, BaseMixin):
    """Anbar əməliyyat sənədi (Mədaxil, Məxaric, Düzəliş, Xarab/İtmiş mal, İlkin qalıq).

    Həyat dövrü: draft -> confirmed (hərəkətləri ledger-ə yazır) -> reversed (ləğv sənədi ilə).
    Təsdiqlənmiş sənəd silinə bilməz, yalnız REVERSAL ilə kompensasiya edilir.
    """

    __tablename__ = "stock_documents"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Unikal sənəd nömrəsi (məs: DOC-REC-2026-0001, DOC-ADJ-2026-0001)",
    )
    document_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
        doc="receipt, issue, adjustment, damaged, lost, returned_classification, opening_balance",
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    target_warehouse_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=True,
        doc="Daxili yerdəyişmə və ya xarab mal anbarı üçün hədəf məkan",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=DocumentStatus.DRAFT.value,
        index=True,
        doc="draft, confirmed, reversed",
    )
    total_items: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Sənəddəki fərqli məhsul növlərinin sayı",
    )
    total_quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Sənəddəki ümumi fiziki ədəd miqdarı",
    )
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Sənədin ümumi maya dəyəri təsiri",
    )
    creator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        doc="Sənədi qeydiyyata alan istifadəçi",
    )
    approver_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        doc="Sənədi təsdiqləyən istifadəçi (SoD qaydası: creator != approver)",
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Təsdiqlənmə və hərəkətlərin jurnala yazılma anı",
    )
    reversed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Ləğv edilmə anı",
    )
    reversal_document_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stock_documents.id", ondelete="SET NULL"),
        nullable=True,
        doc="Bu sənədi ləğv edən kompensasiya sənədinin ID-si",
    )
    reason_code: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        doc="Düzəliş və ya silinmə səbəbi (məcburi sahə)",
    )
    reason_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Ətraflı səbəb açıqlaması",
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    attachments: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONBType,
        nullable=True,
        default=list,
        doc="Əlavə edilmiş sənəd faylları (qaimə, akt skanı və s.)",
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    lines: Mapped[list[StockDocumentLine]] = relationship(
        "StockDocumentLine",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StockDocumentLine.line_no.asc()",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "document_no", name="uq_stock_documents_no"),
        Index("ix_stock_documents_warehouse_status", "warehouse_id", "status"),
    )


class StockDocumentLine(Base, BaseMixin):
    """Anbar sənədinin detal sətri."""

    __tablename__ = "stock_document_lines"

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stock_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    line_no: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        doc="Sətir miqdarı (müsbət)",
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Vahid maya dəyəri",
    )
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Ümumi maya dəyəri (quantity * unit_cost)",
    )
    target_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=StockStatus.AVAILABLE.value,
        doc="available, damaged, quarantine",
    )
    notes: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    document: Mapped[StockDocument] = relationship("StockDocument", back_populates="lines")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_stock_doc_lines_qty_positive"),
        UniqueConstraint("document_id", "line_no", name="uq_stock_doc_lines_no"),
    )


# --- 7. Fiziki İnventarizasiya və Sayım Sessiyaları (Physical Stock Counts) ---


class CountSession(Base, BaseMixin):
    """Fiziki İnventarizasiya və Sayım Sessiyası.

    Həyat dövrü: draft -> frozen(snapshot) -> counting -> review -> approved -> posted (COUNT_VARIANCE).
    Dondurulma zamanı gözlənilən miqdar şəkli çəkilir; dondurulmadan sonrakı satış/transferlər
    'movements since snapshot' kimi izlənilərək real kənarlaşma hesablanır:
    expected = snapshot_qty + net_movements_since_freeze.
    """

    __tablename__ = "count_sessions"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    session_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Unikal sayım sessiyası nömrəsi (məs: CNT-2026-0001)",
    )
    count_scope: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="full",
        doc="'full' (bütün anbar), 'category' (xüsusi kateqoriya), 'sample' (seçmə)",
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=CountSessionStatus.DRAFT.value,
        index=True,
    )
    blind_count: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="Kor sayım: sayıcı işçilərə sistemdəki gözlənilən say göstərilmir",
    )
    frozen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Qalıqların dondurulduğu və gözlənilən snapshot-ın götürüldüyü zaman",
    )
    watermark_movement_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stock_movements.id", ondelete="SET NULL"),
        nullable=True,
        doc="Dondurulma anındakı son hərəkət watermark-ı",
    )
    creator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    approver_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        doc="Təsdiqləyən şəxs (SoD: approver != sayım rəhbəri)",
    )
    adjustment_document_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stock_documents.id", ondelete="SET NULL"),
        nullable=True,
        doc="Sayım təsdiqləndikdə avtomatik yaranan COUNT_VARIANCE sənədinin ID-si",
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    lines: Mapped[list[CountSessionLine]] = relationship(
        "CountSessionLine",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    entries: Mapped[list[CountEntry]] = relationship(
        "CountEntry",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "session_no", name="uq_count_sessions_no"),
        Index("ix_count_sessions_warehouse_status", "warehouse_id", "status"),
    )


class CountSessionLine(Base, BaseMixin):
    """Sayım sessiyasının variant üzrə müqayisə və kənarlaşma sətri."""

    __tablename__ = "count_session_lines"

    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("count_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    snapshot_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Dondurulma anındakı qalıq (Snapshot)",
    )
    net_movements_since_freeze: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Dondurulmadan sonra baş vermiş xalis hərəkətlər (mədaxil - məxaric)",
    )
    expected_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Gözlənilən yekun qalıq = snapshot_qty + net_movements_since_freeze",
    )
    counted_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Faktiki sayılmış ədəd",
    )
    variance_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Kənarlaşma = counted_qty - expected_qty (artıq və ya əskik)",
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )
    variance_value: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Kənarlaşmanın maliyyə dəyəri = variance_qty * unit_cost",
    )
    notes: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    session: Mapped[CountSession] = relationship("CountSession", back_populates="lines")

    __table_args__ = (
        UniqueConstraint("session_id", "variant_id", name="uq_count_session_lines_variant"),
    )


class CountEntry(Base, BaseMixin):
    """İşçilərin fiziki sayım zamanı etdiyi hər bir barkod oxunuşu və ya daxiletmə."""

    __tablename__ = "count_entries"

    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("count_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    counter_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        doc="Sayımı daxil edən işçi",
    )
    device_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        doc="İstifadə olunan terminal / cihaz ID-si",
    )
    counted_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        doc="Daxil edilən miqdar (məsələn, 1 və ya qrup sayı)",
    )
    scan_barcode: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        doc="Oxunan barkod",
    )
    is_undone: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="Səhvən daxil edilib geri qaytarılmışdırmı (undo)?",
    )
    entered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[CountSession] = relationship("CountSession", back_populates="entries")

    __table_args__ = (Index("ix_count_entries_session_var", "session_id", "variant_id"),)
