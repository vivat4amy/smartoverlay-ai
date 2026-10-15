from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from .config import config

DATABASE_URL = f"sqlite+aiosqlite:///{config.db_path}"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# Простые миграции на ALTER TABLE для SQLite — добавляем недостающие колонки.
# Список: (table, column, sql_type, default).
_MIGRATIONS: list[tuple[str, str, str, str]] = [
    ("users", "openai_api_key", "VARCHAR", "''"),
    ("users", "openai_model", "VARCHAR", "'gpt-4o'"),
    ("users", "panel_width", "INTEGER", "380"),
    ("users", "panel_height", "INTEGER", "560"),
]


async def _run_migrations(conn) -> None:
    for table, column, col_type, default in _MIGRATIONS:
        # Проверим, существует ли таблица и нужная колонка.
        result = await conn.exec_driver_sql(f"PRAGMA table_info({table})")
        cols = [row[1] for row in result.fetchall()]
        if not cols:
            # таблицы ещё нет — её создаст create_all
            continue
        if column not in cols:
            await conn.exec_driver_sql(
                f"ALTER TABLE {table} ADD COLUMN {column} {col_type} DEFAULT {default}"
            )


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _run_migrations(conn)


async def get_db():
    async with async_session() as session:
        yield session
