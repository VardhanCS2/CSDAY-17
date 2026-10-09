"""Add background jobs, persistent chats, payments, and PostgreSQL search indexes."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261008_jobs_chats_search"
down_revision: Union[str, Sequence[str], None] = "20261006_shipping_address"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("payment_method", sa.String(length=30), nullable=True))
    op.create_table(
        "background_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("task_type", sa.String(length=40), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_background_jobs_user_id", "background_jobs", ["user_id"])
    op.create_index("ix_background_jobs_resource_id", "background_jobs", ["resource_id"])
    op.create_index("ix_background_jobs_status", "background_jobs", ["status"])
    op.create_table(
        "chats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sender_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recipient_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_chats_id", "chats", ["id"])
    op.create_index("ix_chats_sender_id", "chats", ["sender_id"])
    op.create_index("ix_chats_recipient_id", "chats", ["recipient_id"])
    op.create_index("ix_chats_created_at", "chats", ["created_at"])

    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.execute(
            "CREATE INDEX ix_products_search_vector ON products USING GIN "
            "(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')))"
        )
        op.execute("CREATE INDEX ix_products_name_trgm ON products USING GIN (name gin_trgm_ops)")
        op.execute("CREATE INDEX ix_products_description_trgm ON products USING GIN (description gin_trgm_ops)")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_products_description_trgm")
        op.execute("DROP INDEX IF EXISTS ix_products_name_trgm")
        op.execute("DROP INDEX IF EXISTS ix_products_search_vector")
    op.drop_index("ix_chats_created_at", table_name="chats")
    op.drop_index("ix_chats_recipient_id", table_name="chats")
    op.drop_index("ix_chats_sender_id", table_name="chats")
    op.drop_index("ix_chats_id", table_name="chats")
    op.drop_table("chats")
    op.drop_index("ix_background_jobs_status", table_name="background_jobs")
    op.drop_index("ix_background_jobs_resource_id", table_name="background_jobs")
    op.drop_index("ix_background_jobs_user_id", table_name="background_jobs")
    op.drop_table("background_jobs")
    op.drop_column("orders", "payment_method")
