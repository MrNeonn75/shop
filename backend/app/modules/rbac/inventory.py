"""İnventar və Transfer İcazələri (Inventory & Transfers RBAC).

Modul: inventory, transfers
Risk səviyyələri: normal, sensitive, critical
"""

from __future__ import annotations

from typing import TypedDict


class PermissionDefinition(TypedDict):
    key: str
    module: str
    description: str
    risk_level: str


INVENTORY_PERMISSIONS: list[PermissionDefinition] = [
    # Qalıqlar və Ledger (Stock & Movements)
    {
        "key": "inventory.stock.view",
        "module": "inventory",
        "description": "Filial və mərkəzi anbar qalıqlarına və hərəkət jurnalına baxış",
        "risk_level": "normal",
    },
    {
        "key": "inventory.cost.view",
        "module": "inventory",
        "description": "Anbar maya dəyərinə və dəyər qiymətləndirmə hesabatlarına baxış",
        "risk_level": "sensitive",
    },
    {
        "key": "inventory.negative.override",
        "module": "inventory",
        "description": "Mənfi qalıq qadağasının xüsusi icazə və əsaslandırma ilə aşılması",
        "risk_level": "critical",
    },
    # Sənədlər (Stock Documents)
    {
        "key": "inventory.document.create",
        "module": "inventory",
        "description": "Anbar sənədlərinin (mədaxil, məxaric, xarab/itmiş mal) qaralamasının yaradılması",
        "risk_level": "normal",
    },
    {
        "key": "inventory.document.confirm",
        "module": "inventory",
        "description": "Anbar sənədlərinin təsdiqi və hərəkətlərin jurnala (ledger) yazılması",
        "risk_level": "sensitive",
    },
    {
        "key": "inventory.document.reverse",
        "module": "inventory",
        "description": "Təsdiqlənmiş anbar sənədinin ləğvi və kompensasiya hərəkətlərinin yazılması",
        "risk_level": "critical",
    },
    {
        "key": "inventory.stock.adjust",
        "module": "inventory",
        "description": "Anbar qalığına manual düzəliş edilməsi (artım, azalma)",
        "risk_level": "sensitive",
    },
    # Sayım və İnventarizasiya (Stock Counts)
    {
        "key": "inventory.count.create",
        "module": "inventory",
        "description": "İnventarizasiya sessiyasının başlanması və sayım daxiletmələri",
        "risk_level": "normal",
    },
    {
        "key": "inventory.count.approve",
        "module": "inventory",
        "description": "Sayım kənarlaşmalarının təsdiqi və düzəliş sənədinin formalaşdırılması",
        "risk_level": "sensitive",
    },
    # Transferlər (Inter-warehouse Transfers)
    {
        "key": "transfers.view",
        "module": "transfers",
        "description": "Filiallararası transfer sorğularına və statuslarına baxış",
        "risk_level": "normal",
    },
    {
        "key": "transfers.create",
        "module": "transfers",
        "description": "Yeni transfer sorğusu və ya sifarişinin yaradılması",
        "risk_level": "normal",
    },
    {
        "key": "transfers.approve",
        "module": "transfers",
        "description": "Transfer sorğusunun təsdiqlənməsi",
        "risk_level": "sensitive",
    },
    {
        "key": "transfers.dispatch",
        "module": "transfers",
        "description": "Transfer mallarının yığılması (picking) və yola salınması (dispatch)",
        "risk_level": "sensitive",
    },
    {
        "key": "transfers.receive",
        "module": "transfers",
        "description": "Daxil olan transfer mallarının qəbul edilməsi (tam və ya qismən)",
        "risk_level": "normal",
    },
    {
        "key": "transfers.cancel",
        "module": "transfers",
        "description": "Transferin ləğv edilməsi (və ya yoldan geri qaytarılması)",
        "risk_level": "sensitive",
    },
]
