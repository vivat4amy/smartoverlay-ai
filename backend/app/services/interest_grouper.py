"""Группировка интересов на основе истории распознаваний."""

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.recognition import Recognition
from ..models.interest import Interest

_CATEGORY_ICONS = {
    "gaming": "🎮",
    "video": "🎬",
    "music": "🎵",
    "coding": "💻",
    "social": "💬",
    "browsing": "🌐",
    "documents": "📄",
    "general": "💡",
}

_CATEGORY_NAMES = {
    "gaming": "Игры",
    "video": "Видео",
    "music": "Музыка",
    "coding": "Программирование",
    "social": "Соцсети и чаты",
    "browsing": "Веб-сёрфинг",
    "documents": "Документы",
    "general": "Разное",
}


async def update_interests_from_recognition(
    category: str,
    title: str,
    detected_objects: list[str],
    db: AsyncSession,
) -> None:
    """Обновить или создать интерес на основе нового распознавания."""
    interest_name = _CATEGORY_NAMES.get(category, category.capitalize())

    result = await db.execute(
        select(Interest).where(Interest.name == interest_name)
    )
    interest = result.scalar_one_or_none()

    new_tags = _extract_tags(title, detected_objects)

    if interest:
        interest.count += 1
        existing_tags = interest.tags or []
        merged = list(dict.fromkeys(existing_tags + new_tags))[:20]
        interest.tags = merged
    else:
        interest = Interest(
            name=interest_name,
            category=category,
            icon=_CATEGORY_ICONS.get(category, "💡"),
            count=1,
            tags=new_tags[:10],
        )
        db.add(interest)

    await db.commit()


async def rebuild_all_interests(db: AsyncSession) -> int:
    """Пересобрать все интересы из истории распознаваний."""
    await db.execute(select(Interest).execution_options(synchronize_session="fetch"))

    stmt = (
        select(
            Recognition.category,
            func.count(Recognition.id).label("cnt"),
        )
        .group_by(Recognition.category)
    )
    result = await db.execute(stmt)
    categories = result.all()

    count = 0
    for cat, cnt in categories:
        interest_name = _CATEGORY_NAMES.get(cat, cat.capitalize())

        tags_stmt = select(Recognition.detected_objects).where(
            Recognition.category == cat
        ).limit(50)
        tags_result = await db.execute(tags_stmt)
        all_objects = []
        for row in tags_result.scalars().all():
            if isinstance(row, list):
                all_objects.extend(row)

        top_tags = _get_top_items(all_objects, k=10)

        existing = await db.execute(
            select(Interest).where(Interest.name == interest_name)
        )
        interest = existing.scalar_one_or_none()

        if interest:
            interest.count = cnt
            interest.tags = top_tags
        else:
            interest = Interest(
                name=interest_name,
                category=cat,
                icon=_CATEGORY_ICONS.get(cat, "💡"),
                count=cnt,
                tags=top_tags,
            )
            db.add(interest)
        count += 1

    await db.commit()
    return count


def _extract_tags(title: str, detected_objects: list[str]) -> list[str]:
    tags = []
    for word in title.split():
        word = word.strip("—-:,.")
        if len(word) > 2:
            tags.append(word.lower())
    for obj in detected_objects:
        tags.append(obj.lower())
    return list(dict.fromkeys(tags))[:10]


def _get_top_items(items: list[str], k: int = 10) -> list[str]:
    freq: dict[str, int] = {}
    for item in items:
        key = item.lower().strip()
        if key:
            freq[key] = freq.get(key, 0) + 1
    return [w for w, _ in sorted(freq.items(), key=lambda x: x[1], reverse=True)[:k]]
