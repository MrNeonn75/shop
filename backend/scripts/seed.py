"""Məlumat Doldurma Skripti (Database Seeder CLI).

Əmrlər:
- python scripts/seed.py reference       : Bütün mühitlər üçün 26 icazə və 8 standart rol (idempotent).
- python scripts/seed.py bootstrap-admin : İlk sistem administratorunu yaradır və birdəfəlik şifrəni göstərir.
- python scripts/seed.py demo            : Sınaq üçün 6 demo istifadəçi və filial məlumatları (Production-da qadağandır).
"""

from __future__ import annotations

import asyncio
import sys
import uuid

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.ids import generate_uuid7
from app.core.security import hash_password
from app.core.uow import UnitOfWork
from app.modules.ping.models import PingLog
from app.modules.rbac.repository import RbacRepository
from app.modules.rbac.service import RbacService
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService, generate_secure_temporary_password

cli = typer.Typer(help="Brand House ERP Seeder")
console = Console()

# Standart Filial ID-ləri (Demo mühit üçün)
DEMO_BRANCH_CENTRAL = uuid.UUID("018d0000-0000-7000-8000-000000000000")
DEMO_BRANCH_GANJLIK = uuid.UUID("018d0000-0000-7000-8000-000000000001")
DEMO_PASSWORD = "DemoPassword123!"


async def seed_master_foundations() -> None:
    """B3: Şirkət, Sistem Anbarları, Səbəb Kodları, Nömrələnmə və İnteqrasiyaları ilkinləşdirir."""
    from sqlalchemy import select

    from app.modules.company.service import get_company_service
    from app.modules.integrations.service import get_integration_service
    from app.modules.numbering.models import NumberingSequence
    from app.modules.settings.models import ReasonCode
    from app.modules.warehouses.models import Warehouse

    console.print("[bold blue]Şirkət və Anbar əsas məlumatları yoxlanılır...[/bold blue]")
    company_svc = get_company_service()
    company = await company_svc.get_company()

    async with UnitOfWork() as uow:
        # 1. Tranzit və Mərkəzi Anbar
        for code, name, wh_type, is_sys in [
            ("WH-IN-TRANSIT", "Sistem Tranzit Anbarı", "in_transit", True),
            ("WH-CENTRAL", "Mərkəzi Anbar", "central", False),
        ]:
            stmt = select(Warehouse).where(Warehouse.code == code)
            res = await uow.session.execute(stmt)
            if not res.scalar_one_or_none():
                wh = Warehouse(
                    id=generate_uuid7(),
                    company_id=company.id,
                    branch_id=None,
                    code=code,
                    name=name,
                    warehouse_type=wh_type,
                    is_system=is_sys,
                    is_default_for_sales=False,
                    status="active",
                    version=1,
                )
                uow.session.add(wh)

        # 2. Standart Səbəb Kodları
        default_reasons = [
            ("returns", "DEFECT", "İstehsal qüsuru"),
            ("returns", "WRONG_SIZE", "Ölçü uyğunsuzluğu"),
            ("returns", "CUSTOMER_CHOICE", "Müştəri istəyi"),
            ("adjustments", "DAMAGED", "Zədələnmiş mal"),
            ("adjustments", "LOST", "İtmiş mal"),
            ("adjustments", "INVENTORY_DIFF", "Sayım fərqi"),
            ("discounts", "LOYALTY", "Sadiqlik kartı endirimi"),
            ("discounts", "PROMO", "Aksiya / Kampaniya endirimi"),
            ("discounts", "SEASONAL", "Mövsümi endirim"),
            ("discounts", "MANAGER_OVERRIDE", "Müdir xüsusi endirimi"),
            ("cash_in_out", "COLLECTION", "İnkassasiya məxarici"),
            ("cash_in_out", "PETTY_CASH", "Təsərrüfat xərci məxarici"),
            ("cash_in_out", "FLOAT_IN", "İlkin kassa qalığı mədaxili"),
            ("voids", "CASHIER_ERROR", "Kassir səhvi"),
            ("voids", "CUSTOMER_CANCEL", "Müştəri imtinası"),
        ]
        for cat, r_code, name_az in default_reasons:
            stmt = select(ReasonCode).where(ReasonCode.category == cat, ReasonCode.code == r_code)
            res = await uow.session.execute(stmt)
            if not res.scalar_one_or_none():
                rc = ReasonCode(
                    id=generate_uuid7(),
                    category=cat,
                    code=r_code,
                    name_az=name_az,
                    is_active=True,
                    is_system=True,
                    usage_count=0,
                    version=1,
                )
                uow.session.add(rc)

        # 3. Standart Nömrələnmə Ardıcıllıqları
        default_seqs = [
            ("receipt", "Standart Kassa Qəbzləri", "RCP", "{PREFIX}-{BRANCH}-{REGISTER}-{YYYY}{MM}-{SEQ:6}", True),
            ("return", "Standart Qaytarma Qəbzləri", "RET", "{PREFIX}-{BRANCH}-{REGISTER}-{YYYY}{MM}-{SEQ:6}", True),
            ("po", "Satınalma Sifarişləri", "PO", "{PREFIX}-{YYYY}-{SEQ:6}", False),
            ("goods_receipt", "Mal Mədaxil Qəbzləri", "GR", "{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}", False),
            ("transfer", "Daxili Anbar Yerdəyişmələri", "TRF", "{PREFIX}-{YYYY}{MM}-{SEQ:6}", False),
            ("adjustment", "Anbar Qalıq Düzəlişləri", "ADJ", "{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}", False),
            ("stock_count", "İnventarizasiya Sənədləri", "SC", "{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}", False),
            ("expense", "Kassa Məxaric Orderləri", "EXP", "{PREFIX}-{YYYY}{MM}-{SEQ:6}", False),
            ("payroll_run", "Əməkhaqqı Hesablama Cədvəlləri", "PAY", "{PREFIX}-{YYYY}{MM}-{SEQ:6}", False),
            ("invoice", "Vergi Hesab-Fakturaları", "INV", "{PREFIX}-{YYYY}-{SEQ:6}", True),
            ("payment", "Ödəniş Sənədləri", "PMT", "{PREFIX}-{YYYY}{MM}-{SEQ:6}", True),
        ]
        for doc_t, name, pfx, ptrn, gapless in default_seqs:
            stmt = select(NumberingSequence).where(
                NumberingSequence.company_id == company.id,
                NumberingSequence.document_type == doc_t,
                NumberingSequence.branch_id.is_(None),
                NumberingSequence.register_id.is_(None),
            )
            res = await uow.session.execute(stmt)
            if not res.scalar_one_or_none():
                ns = NumberingSequence(
                    id=generate_uuid7(),
                    company_id=company.id,
                    branch_id=None,
                    register_id=None,
                    document_type=doc_t,
                    name=name,
                    prefix=pfx,
                    pattern=ptrn,
                    reset_rule="never",
                    scope="company",
                    current_sequence=0,
                    last_reset_date=None,
                    is_gapless=gapless,
                    is_active=True,
                    version=1,
                )
                uow.session.add(ns)

        await uow.commit()

    # 4. Kənar İnteqrasiyalar
    int_svc = get_integration_service()
    await int_svc.list_integrations()
    console.print("[bold green]✔ Şirkət, Sistem Anbarları, Səbəb Kodları, Nömrələnmə və İnteqrasiyalar ilkinləşdirildi![/bold green]")


async def seed_catalog_foundations() -> None:
    """B4: Ölçü Vahidləri, Vergi Sinifləri, Kateqoriya Taksonomiyası, Standart Atributlar və Qiymət Siyahısı."""
    from sqlalchemy import select

    from app.modules.catalog.models import (
        Brand,
        Category,
        PriceList,
        ProductAttribute,
        ProductAttributeValue,
        TaxClass,
        UnitOfMeasure,
    )
    from app.modules.company.service import get_company_service

    console.print("[bold blue]Kataloq təməl məlumatları (Taksonomiya, Vahidlər, Vergi, Atributlar) yoxlanılır...[/bold blue]")
    company_svc = get_company_service()
    company = await company_svc.get_company()

    async with UnitOfWork() as uow:
        # 1. Ölçü Vahidləri (Units of Measure)
        units = [
            ("ed", "Ədəd", 0),
            ("cut", "Cüt", 0),
            ("dest", "Dəst", 0),
            ("kq", "Kiloqram", 3),
            ("m", "Metr", 2),
        ]
        for u_code, u_name, u_prec in units:
            stmt = select(UnitOfMeasure).where(UnitOfMeasure.code == u_code)
            res = await uow.session.execute(stmt)
            if not res.scalar_one_or_none():
                uow.session.add(
                    UnitOfMeasure(
                        id=generate_uuid7(),
                        code=u_code,
                        name_az=u_name,
                        precision=u_prec,
                        is_active=True,
                    )
                )

        # 2. Vergi Sinifləri (Tax Classes)
        tax_classes = [
            ("STANDARD_VAT", "Standart ƏDV (18%)", "VAT_18"),
            ("EXEMPT_VAT", "ƏDV-dən Azad (0%)", "VAT_0"),
        ]
        for t_code, t_name, t_ref in tax_classes:
            stmt = select(TaxClass).where(TaxClass.company_id == company.id, TaxClass.code == t_code)
            res = await uow.session.execute(stmt)
            if not res.scalar_one_or_none():
                uow.session.add(
                    TaxClass(
                        id=generate_uuid7(),
                        company_id=company.id,
                        code=t_code,
                        name_az=t_name,
                        rate_ref=t_ref,
                        is_active=True,
                    )
                )

        # 3. Kateqoriya Taksonomiyası
        # Səviyyə 1: Bölmələr (Sections)
        sections = [
            ("men", "Kişi"),
            ("women", "Qadın"),
            ("kids", "Uşaq"),
            ("other", "Digər"),
        ]
        section_map: dict[str, Category] = {}
        for s_code, s_name in sections:
            stmt = select(Category).where(
                Category.company_id == company.id,
                Category.level == 1,
                Category.code == s_code,
            )
            res = await uow.session.execute(stmt)
            cat = res.scalar_one_or_none()
            if not cat:
                c_id = generate_uuid7()
                cat = Category(
                    id=c_id,
                    company_id=company.id,
                    parent_id=None,
                    name=s_name,
                    code=s_code,
                    level=1,
                    path=f"/{c_id}",
                    sort_order=len(section_map) + 1,
                    is_active=True,
                )
                uow.session.add(cat)
            section_map[s_code] = cat

        # Səviyyə 2: Növlər (Types - Ümumi Qadın bölməsinin altında default olaraq ilkinləşdirilir)
        types = [
            ("clothing", "Geyim"),
            ("shoes", "Ayaqqabı"),
            ("accessories", "Aksesuar"),
        ]
        type_map: dict[str, Category] = {}
        for t_code, t_name in types:
            stmt = select(Category).where(
                Category.company_id == company.id,
                Category.level == 2,
                Category.code == t_code,
            )
            res = await uow.session.execute(stmt)
            cat = res.scalar_one_or_none()
            if not cat:
                parent_cat = section_map.get("women") or next(iter(section_map.values()))
                c_id = generate_uuid7()
                cat = Category(
                    id=c_id,
                    company_id=company.id,
                    parent_id=parent_cat.id,
                    name=t_name,
                    code=t_code,
                    level=2,
                    path=f"{parent_cat.path}/{c_id}",
                    sort_order=len(type_map) + 1,
                    is_active=True,
                )
                uow.session.add(cat)
            type_map[t_code] = cat

        # Səviyyə 3: Mağaza Taksonomiyası (31 Kateqoriya)
        taxonomy_categories = [
            ("Atlet", "atlet", "clothing"),
            ("Bluz", "bluz", "clothing"),
            ("Crop", "crop", "clothing"),
            ("Don", "don", "clothing"),
            ("Dəst", "dest", "clothing"),
            ("Gödəkcə", "godekce", "clothing"),
            ("Hırka", "hirka", "clothing"),
            ("Jaket", "jaket", "clothing"),
            ("Jilet", "jilet", "clothing"),
            ("Kalqotka və lasin", "kalqotka-ve-lasin", "clothing"),
            ("Kardiqan", "kardiqan", "clothing"),
            ("Kazak", "kazak", "clothing"),
            ("Köynək", "koynek", "clothing"),
            ("Küləklik", "kuleklik", "clothing"),
            ("Mayka", "mayka", "clothing"),
            ("Palto", "palto", "clothing"),
            ("Papaq və əlcək", "papaq-ve-elcek", "accessories"),
            ("Pencək", "pencek", "clothing"),
            ("Polo", "polo", "clothing"),
            ("Şalvar", "salvar", "clothing"),
            ("Şortik", "sortik", "clothing"),
            ("Sweatshirt", "sweatshirt", "clothing"),
            ("Topik", "topik", "clothing"),
            ("Trençkot", "trenckot", "clothing"),
            ("Tshirt", "tshirt", "clothing"),
            ("Tulum", "tulum", "clothing"),
            ("Tunik", "tunik", "clothing"),
            ("Ətək", "etek", "clothing"),
            ("Ayaqqabı", "ayaqqabi", "shoes"),
            ("Çanta və pulqabı", "canta-ve-pulqabi", "accessories"),
            ("Oyuncaq", "oyuncaq", "accessories"),
        ]
        for idx, (cat_name, cat_code, parent_type_code) in enumerate(taxonomy_categories):
            stmt = select(Category).where(
                Category.company_id == company.id,
                Category.level == 3,
                Category.code == cat_code,
            )
            res = await uow.session.execute(stmt)
            if not res.scalar_one_or_none():
                parent_type = type_map.get(parent_type_code) or type_map["clothing"]
                c_id = generate_uuid7()
                uow.session.add(
                    Category(
                        id=c_id,
                        company_id=company.id,
                        parent_id=parent_type.id,
                        name=cat_name,
                        code=cat_code,
                        level=3,
                        path=f"{parent_type.path}/{c_id}",
                        sort_order=idx + 1,
                        is_active=True,
                    )
                )

        # 4. Standart Atributlar (Ölçü, Rəng, Üslub, Model)
        attributes_data = [
            (
                "Ölçü",
                "size",
                "select",
                True,
                [("XS", "xs", None), ("S", "s", None), ("M", "m", None), ("L", "l", None), ("XL", "xl", None), ("XXL", "xxl", None), ("3XL", "3xl", None)],
            ),
            (
                "Rəng",
                "color",
                "color",
                True,
                [
                    ("Qara", "black", "#000000"),
                    ("Ağ", "white", "#FFFFFF"),
                    ("Göy", "blue", "#0000FF"),
                    ("Qırmızı", "red", "#FF0000"),
                    ("Boz", "gray", "#808080"),
                    ("Yaşıl", "green", "#008000"),
                    ("Sarı", "yellow", "#FFFF00"),
                    ("Bej", "beige", "#F5F5DC"),
                ],
            ),
            (
                "Üslub",
                "style",
                "select",
                False,
                [("Klassik", "classic", None), ("Gündəlik", "casual", None), ("İdman", "sport", None)],
            ),
            ("Model", "model", "text", False, []),
        ]
        for attr_name, attr_code, a_type, is_var, vals in attributes_data:
            stmt = select(ProductAttribute).where(
                ProductAttribute.company_id == company.id,
                ProductAttribute.code == attr_code,
            )
            res = await uow.session.execute(stmt)
            attr = res.scalar_one_or_none()
            if not attr:
                attr = ProductAttribute(
                    id=generate_uuid7(),
                    company_id=company.id,
                    name=attr_name,
                    code=attr_code,
                    attribute_type=a_type,
                    is_variant_defining=is_var,
                    is_active=True,
                )
                uow.session.add(attr)
                await uow.session.flush()

                for s_order, (v_val, v_code, v_hex) in enumerate(vals, start=1):
                    uow.session.add(
                        ProductAttributeValue(
                            id=generate_uuid7(),
                            attribute_id=attr.id,
                            value=v_val,
                            code=v_code,
                            color_hex=v_hex,
                            sort_order=s_order,
                        )
                    )

        # 5. Əsas Qiymət Siyahısı (Default Price List)
        stmt = select(PriceList).where(PriceList.company_id == company.id, PriceList.code == "DEFAULT")
        res = await uow.session.execute(stmt)
        if not res.scalar_one_or_none():
            uow.session.add(
                PriceList(
                    id=generate_uuid7(),
                    company_id=company.id,
                    branch_id=None,
                    code="DEFAULT",
                    name="Əsas Qiymət Siyahısı",
                    currency="AZN",
                    is_default=True,
                    is_active=True,
                )
            )

        # 6. Standart Brend
        stmt = select(Brand).where(Brand.company_id == company.id, Brand.code == "brand-house")
        res = await uow.session.execute(stmt)
        if not res.scalar_one_or_none():
            uow.session.add(
                Brand(
                    id=generate_uuid7(),
                    company_id=company.id,
                    name="Brand House",
                    code="brand-house",
                    logo_url=None,
                    is_active=True,
                )
            )

        await uow.commit()

    console.print("[bold green]✔ Kataloq Taksonomiyası (31 kateqoriya), Vahidlər, Vergi və Atributlar ilkinləşdirildi![/bold green]")


async def seed_reference_data() -> tuple[int, int]:
    """Təməl referans məlumatlarını doldurur (İcazələr, Standart Rollar, B3 və B4 Təməlləri)."""
    console.print("[bold blue]Referans məlumatlarının yüklənməsi başladı...[/bold blue]")
    rbac_service = RbacService()
    perm_count, role_count = await rbac_service.seed_catalog()

    # B3 Təməl referans məlumatları
    await seed_master_foundations()

    # B4 Kataloq referans məlumatları
    await seed_catalog_foundations()

    # Compliance referans qayda paketləri (HAMISI UNVERIFIED - hüquqi iddia deyil)
    from app.modules.compliance.seeds import seed_reference_rule_packs

    async with AsyncSessionLocal() as session:
        compliance_result = await seed_reference_rule_packs(session)
        await session.commit()
    console.print(
        "[bold yellow]Compliance referans paketləri yükləndi (UNVERIFIED): "
        f"{compliance_result['packs_created']} paket, "
        f"{compliance_result['rules_created']} qayda. "
        "Hüquqi uyğunluq iddiası YOXDUR.[/bold yellow]"
    )

    async with AsyncSessionLocal() as session:
        ping = PingLog(
            id=generate_uuid7(),
            message="Sistem Referans Məlumatı İlkinləşdirildi (AZN valyutası, Vergi konfiqurasiyası, 8 Sistem Rolu, Kataloq Taksonomiyası)",
            client_ip="127.0.0.1",
            status="system_init",
        )
        session.add(ping)
        await session.commit()

    console.print(
        f"[bold green]✔ Referans məlumatları uğurla yükləndi! ({perm_count} icazə, {role_count} rol)[/bold green]"
    )
    return perm_count, role_count



async def run_bootstrap_admin(
    username: str = "admin",
    email: str = "admin@brandhouse.az",
    full_name: str = "Sistem Administratoru",
) -> None:
    """İlk sistem administratorunu yaradır və birdəfəlik şifrəni göstərir."""
    console.print("[bold blue]Sistem Administratoru ilkinləşdirilir...[/bold blue]")

    # Əvvəlcə referans rolların mövcudluğunu təmin edirik
    await seed_reference_data()

    rbac_repo = RbacRepository()
    rbac_service = RbacService()
    user_repo = UserRepository()
    user_service = UserService()

    async with UnitOfWork() as uow:
        admin_role = await rbac_repo.get_role_by_code(uow.session, "system_admin")
        if not admin_role:
            console.print("[bold red]XƏTA: 'system_admin' rolu tapılmadı![/bold red]")
            sys.exit(1)

        # Mövcud aktiv sistem administratorunu yoxlayırıq
        user_ids = await rbac_repo.get_user_ids_for_role(uow.session, admin_role.id)
        if user_ids:
            for uid in user_ids:
                u = await user_repo.get_by_id(uow.session, uid)
                if u and u.status == "active":
                    console.print(
                        "[bold red]XƏTA: Sistem Administratoru artıq mövcuddur! Təhlükəsizlik baxımından təkrar yaradıla bilməz.[/bold red]"
                    )
                    sys.exit(1)

    # Yeni təhlükəsiz şifrə generirlənir
    generated_password = generate_secure_temporary_password(length=14)

    user_dto = UserCreate(
        username=username,
        email=email,
        full_name=full_name,
        password=generated_password,
        must_change_password=True,
        allowed_branch_ids=[],
    )

    created_user, _ = await user_service.create_user(user_dto, actor=None)
    await rbac_service.assign_user_roles(created_user.id, [admin_role.id], actor=None)

    # Nəticəni vizual təqdim edirik
    table = Table(title="Sistem Administratoru Hesab Məlumatları", show_header=True)
    table.add_column("Sahə", style="cyan", width=20)
    table.add_column("Dəyər", style="green", width=40)
    table.add_row("İstifadəçi Adı", username)
    table.add_row("E-poçt", email)
    table.add_row("Birdəfəlik Şifrə", generated_password)
    table.add_row("Şifrə Dəyişmə Tələbi", "BƏLİ (İlk girişdə məcburidir)")

    console.print(table)
    console.print(
        Panel(
            "[bold yellow]DİQQƏT: Bu şifrə yalnız BİR DƏFƏ göstərilir. Zəhmət olmasa təhlükəsiz yerdə saxlayın![/bold yellow]",
            title="Təhlükəsizlik Bildirişi",
            border_style="red",
        )
    )


async def seed_demo_data(force: bool = False) -> None:
    """Demo/sınaq məlumatlarını doldurur. Production-da imtina edir (force=True istisna olmaqla)!"""
    if settings.is_production and not force:
        console.print(
            "[bold red]XƏTA: Demo məlumatları PRODUCTION mühitində yüklənə bilməz! Məcburi yükləmək üçün --force parametrindən istifadə edin.[/bold red]"
        )
        sys.exit(1)

    console.print(
        "[bold yellow]Demo məlumatlarının yüklənməsi başladı (Yalnız Dev/Test)...[/bold yellow]"
    )

    # Əvvəlcə referans rolların mövcudluğunu təmin edirik
    await seed_reference_data()

    rbac_repo = RbacRepository()
    rbac_service = RbacService()
    user_repo = UserRepository()
    user_service = UserService()

    async with UnitOfWork() as uow:
        roles_list = await rbac_repo.list_roles(uow.session)
        roles_by_code = {r.code: r for r in roles_list}

    demo_users_specs = [
        {
            "username": "admin.demo",
            "email": "admin.demo@brandhouse.az",
            "full_name": "Admin Demo",
            "role_code": "system_admin",
            "branches": [],
            "manager_pin": "9999",
            "pos_pin": None,
        },
        {
            "username": "gm.demo",
            "email": "gm.demo@brandhouse.az",
            "full_name": "Baş Menecer Demo",
            "role_code": "general_manager",
            "branches": [],
            "manager_pin": "8888",
            "pos_pin": None,
        },
        {
            "username": "bm.ganjlik",
            "email": "bm.ganjlik@brandhouse.az",
            "full_name": "Filial Meneceri (Gənclik)",
            "role_code": "branch_manager",
            "branches": [DEMO_BRANCH_GANJLIK],
            "manager_pin": "1234",
            "pos_pin": None,
        },
        {
            "username": "cashier.ganjlik",
            "email": "cashier.ganjlik@brandhouse.az",
            "full_name": "Kassir (Gənclik)",
            "role_code": "cashier",
            "branches": [DEMO_BRANCH_GANJLIK],
            "manager_pin": None,
            "pos_pin": "1111",
        },
        {
            "username": "wh.keeper",
            "email": "wh.keeper@brandhouse.az",
            "full_name": "Anbardar Demo",
            "role_code": "warehouse_keeper",
            "branches": [DEMO_BRANCH_CENTRAL, DEMO_BRANCH_GANJLIK],
            "manager_pin": None,
            "pos_pin": None,
        },
        {
            "username": "accountant.demo",
            "email": "accountant.demo@brandhouse.az",
            "full_name": "Mühasib Demo",
            "role_code": "accountant",
            "branches": [],
            "manager_pin": None,
            "pos_pin": None,
        },
    ]

    for spec in demo_users_specs:
        target_role = roles_by_code.get(str(spec["role_code"]))
        if not target_role:
            console.print(f"[bold red]XƏTA: '{spec['role_code']}' rolu tapılmadı![/bold red]")
            continue

        async with UnitOfWork() as uow:
            existing = await user_repo.get_by_username(uow.session, str(spec["username"]))
            if existing:
                # Mövcuddursa yeniləyirik
                existing.status = "active"
                existing.must_change_password = False
                existing.password_hash = hash_password(DEMO_PASSWORD)
                user_id = existing.id
                await uow.commit()
            else:
                user_dto = UserCreate(
                    username=str(spec["username"]),
                    email=str(spec["email"]),
                    full_name=str(spec["full_name"]),
                    password=DEMO_PASSWORD,
                    must_change_password=False,
                    allowed_branch_ids=list(spec["branches"]),  # type: ignore[arg-type]
                )
                created, _ = await user_service.create_user(user_dto, actor=None)
                user_id = created.id

        # Rol və Filial təyinatı
        await rbac_service.assign_user_roles(user_id, [target_role.id], actor=None)
        if spec["branches"]:
            async with UnitOfWork() as uow:
                await user_repo.set_branch_access(
                    uow.session,
                    user_id,
                    list(spec["branches"]),  # type: ignore[arg-type]
                )
                await uow.commit()

        # PIN təyinatları
        if spec["manager_pin"]:
            await user_service.set_manager_pin(user_id, str(spec["manager_pin"]), actor=None)
        if spec["pos_pin"]:
            await user_service.set_pos_pin(user_id, str(spec["pos_pin"]), actor=None)

    # Demo ping qeydləri
    async with AsyncSessionLocal() as session:
        demos = [
            PingLog(
                id=generate_uuid7(),
                message="Demo Filial 1 (Gənclik Mall) POS Terminalı Aktiv",
                client_ip="192.168.1.101",
                status="active",
            ),
            PingLog(
                id=generate_uuid7(),
                message="Demo Mərkəzi Anbar Qovşağı Aktiv",
                client_ip="192.168.1.102",
                status="active",
            ),
        ]
        session.add_all(demos)
        await session.commit()

    console.print(
        f"[bold green]✔ 6 Demo istifadəçi uğurla yaradıldı/yeniləndi! Standart şifrə: {DEMO_PASSWORD}[/bold green]"
    )


@cli.command("reference")
def reference() -> None:
    """İlkin təməl referans məlumatlarını yükləyir (26 İcazə və 8 Sistem Rolu)."""
    asyncio.run(seed_reference_data())


@cli.command("bootstrap-admin")
def bootstrap_admin(
    username: str = typer.Option("admin", "--username", "-u", help="Administrator istifadəçi adı"),
    email: str = typer.Option("admin@brandhouse.az", "--email", "-e", help="Administrator e-poçtu"),
    full_name: str = typer.Option(
        "Sistem Administratoru", "--name", "-n", help="Administratorun tam adı"
    ),
) -> None:
    """İlkin sistem administratorunu yaradır və birdəfəlik təsadüfi şifrəni göstərir."""
    asyncio.run(run_bootstrap_admin(username=username, email=email, full_name=full_name))


@cli.command("demo")
def demo(
    force: bool = typer.Option(
        False, "--force", "-f", help="Production mühitində də sınaq məlumatlarını məcburi yükləyir"
    )
) -> None:
    """Sınaq üçün 6 demo istifadəçi və filial məlumatlarını yükləyir."""
    if "--force" in sys.argv or "-f" in sys.argv:
        force = True
    asyncio.run(seed_demo_data(force=force))


if __name__ == "__main__":
    cli()
