"""add_compliance_module

Revision ID: 0008_compliance_module
Revises: 0007_finance_module
Create Date: 2026-10-24 19:27:02.551675

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0008_compliance_module'
down_revision: Union[str, None] = '0007_finance_module'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

