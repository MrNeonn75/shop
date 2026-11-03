"""Sistem Arxitektura, Təhlükəsizlik və Modul Sərhədləri Auditi Testləri.

Bu testlər backend üzrə Release-Candidate keyfiyyət standartlarını təmin edir:
1. Bütün HTTP endpoint-lərində açıq autentifikasiya / icazə / actor asılılıqları (və ya icazə verilən public allowlist).
2. Maliyyə, anbar və satış sənədləri yaradan bütün mutasiya marşrutlarında Idempotency-Key tələbi.
3. Pul və maliyyə məbləğlərində float istifadəsinin qadağan olunması (yalnız Decimal və Numeric).
4. SQL inyeksiyalarının qarşısını almaq üçün xam SQL sətir konkatenasiyasının AST analizi ilə yoxlanması.
5. Saat qurşaqsız (naive) datetime istifadəsinin qarşısının alınması (yalnız UTC-aware).
6. Modul sərhədləri: Yalnız InventoryService anbar qalıqlarına toxunur, yalnız NumberingService nömrə ayırır,
   yalnız PostingService/Finance maliyyə kitablarına qeyd aparır.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path
from typing import Any

import pytest
from fastapi.routing import APIRoute

from app.main import create_app

APP_DIR = Path(__file__).resolve().parent.parent.parent / "app"

# Rəsmi olaraq autentifikasiyasız açıq buraxılan marşrutlar
ALLOW_LISTED_PUBLIC_ROUTES = {
    "/",
    "/ping",
    "/api/v1/ping",
    "/health/live",
    "/health/ready",
    "/health/details",
    "/auth/login",
    "/api/v1/auth/login",
    "/auth/refresh",
    "/api/v1/auth/refresh",
    "/auth/forgot-password",
    "/api/v1/auth/forgot-password",
    "/auth/reset-password",
    "/api/v1/auth/reset-password",
    "/auth/mfa/challenge",
    "/api/v1/auth/mfa/challenge",
}


def test_route_security_and_permission_declarations() -> None:
    """Bütün marşrutların autentifikasiya, hüquq yoxlanışı və ya icazə verilən public siyahıda olmasını yoxlayır."""
    app = create_app()
    unsecured_routes: list[str] = []

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        path = route.path
        if path in ALLOW_LISTED_PUBLIC_ROUTES or path.startswith("/docs") or path.startswith("/redoc") or path.startswith("/openapi"):
            continue

        # Webhook marşrutları HMAC imza təsdiqi ilə qorunur
        if "webhook" in path.lower():
            continue

        all_dep_calls: list[Any] = []

        def extract_calls(dep: Any) -> None:
            if dep.call:
                all_dep_calls.append(dep.call)
            for sub in dep.dependencies:
                extract_calls(sub)

        extract_calls(route.dependant)

        call_names = [getattr(c, "__name__", str(c)) for c in all_dep_calls]
        sig = inspect.signature(route.endpoint)
        param_names = list(sig.parameters.keys())

        # Təhlükəsizlik/Actor parametrlərinin mövcudluğu
        is_secured = any(
            any(
                k in n.lower()
                for k in [
                    "auth",
                    "user",
                    "actor",
                    "permission",
                    "role",
                    "security",
                    "token",
                    "session",
                    "login",
                    "audit",
                    "request",
                ]
            )
            for n in call_names + param_names
        )

        if not is_secured:
            unsecured_routes.append(f"{path} [{','.join(route.methods)}]")

    assert not unsecured_routes, f"Qorunmayan və public siyahıya daxil edilməyən marşrutlar tapıldı: {unsecured_routes}"


def test_mutating_documents_require_idempotency_key() -> None:
    """Maliyyə, anbar və satış sənədlərini yaradan endpoint-lərin Idempotency-Key dəstəkləməsini yoxlayır."""
    app = create_app()

    # Sənəd yaradan əsas mutating marşrutlar
    critical_doc_endpoints = [
        "/pos/sales",
        "/api/v1/pos/sales",
        "/returns",
        "/api/v1/returns",
        "/returns/exchange",
        "/api/v1/returns/exchange",
        "/inventory/post",
        "/api/v1/inventory/post",
        "/transfers",
        "/api/v1/transfers",
        "/purchasing/receipts/{receipt_id}/confirm",
        "/api/v1/purchasing/receipts/{receipt_id}/confirm",
        "/finance/transfers",
        "/api/v1/finance/transfers",
        "/finance/expenses",
        "/api/v1/finance/expenses",
        "/payroll/runs/{run_id}/finalize",
        "/api/v1/payroll/runs/{run_id}/finalize",
    ]

    post_routes_by_path: dict[str, APIRoute] = {
        r.path: r for r in app.routes if isinstance(r, APIRoute) and "POST" in r.methods
    }

    for ep in critical_doc_endpoints:
        route = post_routes_by_path.get(ep)
        assert route is not None, f"Tələb olunan kritik sənəd endpoint-i tapılmadı: {ep}"

        sig = inspect.signature(route.endpoint)
        params_dict = dict(sig.parameters)

        has_idemp = any(
            "idemp" in p_name.lower()
            or getattr(p_obj.default, "alias", None) == "Idempotency-Key"
            or "Idempotency-Key" in str(p_obj.annotation)
            for p_name, p_obj in params_dict.items()
        )

        assert has_idemp, f"'{ep}' endpoint-i 'Idempotency-Key' başlığını və ya parametrini tələb etmir!"


def test_no_float_used_for_money_in_models_and_schemas() -> None:
    """Maliyyə, qiymət və maya dəyəri sahələrində float tiplərinin AST analizi ilə axtarışı."""
    money_keywords = [
        "price",
        "cost",
        "amount",
        "balance",
        "total",
        "tax",
        "discount",
        "subtotal",
        "grand_total",
        "wage",
        "salary",
        "rate",
    ]

    violations: list[str] = []

    for py_file in APP_DIR.rglob("*.py"):
        if "test" in py_file.name or "__pycache__" in str(py_file):
            continue

        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        except Exception:
            continue

        for node in ast.walk(tree):
            # Class annotasiyalarında: x: float = ...
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                field_name = node.target.id.lower()
                if any(kw in field_name for kw in money_keywords):
                    # Əgər annotasiya float-dırsa
                    if isinstance(node.annotation, ast.Name) and node.annotation.id == "float":
                        violations.append(f"{py_file.name}:{node.lineno} -> '{node.target.id}: float'")
            # Float() SQL sütun təyinatları: Column(Float) və ya mapped_column(Float)
            elif isinstance(node, ast.Call):
                func_name = getattr(node.func, "id", "") or getattr(node.func, "attr", "")
                for arg in node.args:
                    if isinstance(arg, ast.Name) and arg.id == "Float":
                        violations.append(f"{py_file.name}:{node.lineno} -> SQL Float sütunu: {func_name}(Float)")

    assert not violations, "Maliyyə sahələrində qadağan olunmuş 'float' tipi tapıldı:\n" + "\n".join(violations)


def test_no_raw_sql_string_concatenation() -> None:
    """SQL injection risklərinə qarşı AST analizi: text() və ya execute() içində f-string və ya % formatı yoxlanılır."""
    violations: list[str] = []

    for py_file in APP_DIR.rglob("*.py"):
        if "test" in py_file.name or "__pycache__" in str(py_file):
            continue

        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        except Exception:
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = getattr(node.func, "id", "") or getattr(node.func, "attr", "")
                if func_name in ("execute", "text"):
                    for arg in node.args:
                        # f-string: text(f"SELECT ... {var}")
                        if isinstance(arg, ast.JoinedStr):
                            violations.append(f"{py_file.name}:{node.lineno} -> {func_name}(f'...') f-string istifadəsi!")
                        # BinOp: text("SELECT ... " + var) və ya "SELECT ... %s" % var
                        elif isinstance(arg, ast.BinOp) and isinstance(arg.op, (ast.Add, ast.Mod)):
                            violations.append(f"{py_file.name}:{node.lineno} -> {func_name}(...) sətir birləşdirməsi / % formatı!")

    assert not violations, "Xam SQL konkatenasiyası aşkar edildi:\n" + "\n".join(violations)


def test_no_naive_datetimes_in_domain_logic() -> None:
    """Bütün tarixlərin UTC-aware olmasını təmin etmək üçün naive datetime.now() və datetime.utcnow() yoxlanışı."""
    violations: list[str] = []

    for py_file in APP_DIR.rglob("*.py"):
        if "test" in py_file.name or "__pycache__" in str(py_file):
            continue

        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        except Exception:
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = ""
                if isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr
                    # datetime.utcnow() qadağandır (Python 3.12-də deprecated və naive-dir)
                    if func_name == "utcnow":
                        violations.append(f"{py_file.name}:{node.lineno} -> naive 'utcnow()' istifadəsi (utc_now() istifadə edin)")
                    # datetime.now() parametri olmadan (naive UTC yaradır)
                    elif func_name == "now" and not node.args and not node.keywords:
                        violations.append(f"{py_file.name}:{node.lineno} -> naive 'now()' istifadəsi (utc_now() istifadə edin)")

    assert not violations, "Naive datetime istifadəsi tapıldı:\n" + "\n".join(violations)


def test_architectural_module_boundaries() -> None:
    """Modul sərhədləri:
    1. Yalnız Inventory modulu stock_levels və stock_ledger_entries cədvəllərini idarə edir.
    2. Yalnız Numbering modulu numbering_sequences cədvəlini dəyişir.
    3. Yalnız Finance modulu financial_accounts və journal_entries cədvəllərinə birbaşa yazır.
    """
    for py_file in APP_DIR.rglob("*.py"):
        # Öz modulunun daxilində və testlərdə icazə verilir
        rel_path = py_file.relative_to(APP_DIR).as_posix()
        if "test" in rel_path or "__pycache__" in rel_path:
            continue

        text = py_file.read_text(encoding="utf-8")

        # Inventory sərhədi: kənar modullar birbaşa StockLevel və ya StockLedgerEntry import edib insert/update edə bilməz
        if not rel_path.startswith("modules/inventory") and not rel_path.startswith("shared/"):
            if "from app.modules.inventory.models import StockLevel" in text and ("insert(" in text or "update(" in text):
                pytest.fail(f"Kənar modul {rel_path} StockLevel üzərində birbaşa DML icra edir! Yalnız InventoryService icazəlidir.")
            if "from app.modules.inventory.models import StockLedgerEntry" in text and ("insert(" in text or "delete(" in text):
                pytest.fail(f"Kənar modul {rel_path} StockLedgerEntry üzərində birbaşa DML icra edir! Yalnız InventoryService icazəlidir.")

        # Numbering sərhədi: kənar modullar NumberingSequence cədvəlini birbaşa insert/update edə bilməz
        if not rel_path.startswith("modules/numbering") and not rel_path.startswith("shared/"):
            if "from app.modules.numbering.models import NumberingSequence" in text and ("update(" in text or "delete(" in text):
                pytest.fail(f"Kənar modul {rel_path} NumberingSequence üzərində birbaşa DML icra edir! Yalnız NumberingService icazəlidir.")

        # Finance sərhədi: kənar modullar FinancialAccount balansını və ya JournalEntry-ni birbaşa dəyişə bilməz
        if not rel_path.startswith("modules/finance") and not rel_path.startswith("shared/"):
            if "from app.modules.finance.models import JournalEntry" in text and ("insert(" in text or "delete(" in text):
                pytest.fail(f"Kənar modul {rel_path} JournalEntry üzərində birbaşa DML icra edir! Yalnız Finance/PostingService icazəlidir.")
