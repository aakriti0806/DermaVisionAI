from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import ProfileUpdate
from ..serializers import user_out

router = APIRouter(prefix="/api/user", tags=["user"])


@router.get("/profile")
def get_profile(user: User = Depends(get_current_user)):
    return user_out(user)


@router.put("/profile")
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.email is not None and body.email.lower() != user.email:
        email = body.email.lower()
        if db.scalar(select(User).where(User.email == email)):
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use")
        user.email = email
    db.commit()
    return user_out(user)
