from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.database import get_db
from app.models.chat_message import ChatMessage
from app.models.user import User
from app.utils.response import success_response

router = APIRouter(prefix="/chats", tags=["Chats"])


@router.get("/")
def get_chat_history(
    customer_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ChatMessage)
    if current_user.role == "admin":
        if customer_id is not None:
            customer = db.query(User).filter(User.id == customer_id, User.role != "admin").first()
            if customer is None:
                raise HTTPException(status_code=404, detail="Customer not found")
            query = query.filter(
                (ChatMessage.sender_id == customer_id) | (ChatMessage.recipient_id == customer_id)
            )
    else:
        if customer_id is not None and customer_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only access your own conversation.")
        query = query.filter(
            (ChatMessage.sender_id == current_user.id) | (ChatMessage.recipient_id == current_user.id)
        )

    messages = query.order_by(ChatMessage.created_at.desc()).limit(500).all()
    messages.reverse()
    user_ids = {user_id for message in messages for user_id in (message.sender_id, message.recipient_id)}
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    result = [
        {
            "id": message.id,
            "sender_id": message.sender_id,
            "sender_name": users[message.sender_id].name if message.sender_id in users else "Former user",
            "recipient_id": message.recipient_id,
            "recipient_name": users[message.recipient_id].name if message.recipient_id in users else "Former user",
            "text": message.text,
            "created_at": message.created_at,
        }
        for message in messages
    ]
    return success_response(data=result, message="Chat history fetched")
