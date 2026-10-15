from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas.user import RecommendationOut
from ..services.recommender import generate_recommendations

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.get("", response_model=list[RecommendationOut])
async def get_recommendations(db: AsyncSession = Depends(get_db)):
    return await generate_recommendations(db)
