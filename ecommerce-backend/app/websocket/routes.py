from datetime import timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.security import decode_token
from app.database.database import SessionLocal
from app.models.user import User
from app.models.chat_message import ChatMessage
from app.websocket.manager import manager


router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = "") -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    payload = decode_token(token) if token else None
    if not payload or payload.get("token_type") != "access":
        await websocket.close(code=4401, reason="Valid access token required")
        return

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        await websocket.close(code=4401, reason="Invalid access token")
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            await websocket.close(code=4401, reason="User not found")
            return
        connected_user = {"id": user.id, "name": user.name, "role": user.role}
    finally:
        db.close()

    await manager.connect(connected_user["id"], connected_user["role"], websocket)
    try:
        while True:
            message = await websocket.receive_json()
            await handle_message(websocket, connected_user, message)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(connected_user["id"], websocket)


async def handle_message(
    websocket: WebSocket,
    sender: dict[str, Any],
    message: Any,
) -> None:
    if not isinstance(message, dict):
        await websocket.send_json({"type": "error", "data": {"message": "Message must be an object."}})
        return

    event_type = message.get("type")
    data = message.get("data")
    if event_type == "ping":
        await websocket.send_json({"type": "pong", "data": {}})
        return
    if event_type != "chat.send" or not isinstance(data, dict):
        await websocket.send_json({"type": "error", "data": {"message": "Unsupported message type."}})
        return

    text = data.get("text")
    if not isinstance(text, str) or not text.strip() or len(text.strip()) > 2000:
        await websocket.send_json({
            "type": "error",
            "data": {"message": "Message text must contain 1 to 2000 characters."},
        })
        return

    recipient_id: int | None = None
    if sender["role"] == "admin":
        try:
            recipient_id = int(data["recipient_id"])
        except (KeyError, TypeError, ValueError):
            await websocket.send_json({
                "type": "error",
                "data": {"message": "Choose a customer before sending a reply."},
            })
            return

        db = SessionLocal()
        try:
            recipient = db.query(User).filter(User.id == recipient_id).first()
            if recipient is None or recipient.role == "admin":
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": "Customer not found."},
                })
                return
        finally:
            db.close()
    else:
        db = SessionLocal()
        try:
            admin = db.query(User).filter(User.role == "admin").order_by(User.id).first()
            if admin is None:
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": "Live support is not available right now."},
                })
                return
            recipient_id = admin.id
        finally:
            db.close()

    db = SessionLocal()
    try:
        saved_message = ChatMessage(
            sender_id=sender["id"],
            recipient_id=recipient_id,
            text=text.strip(),
        )
        db.add(saved_message)
        db.commit()
        db.refresh(saved_message)
        created_at = saved_message.created_at.replace(tzinfo=timezone.utc).isoformat()
    finally:
        db.close()

    chat_data = {
        "id": saved_message.id,
        "sender_id": sender["id"],
        "sender_name": sender["name"],
        "recipient_id": recipient_id,
        "text": text.strip(),
        "created_at": created_at,
    }
    chat_message = {"type": "chat.message", "data": chat_data}
    if sender["role"] != "admin":
        await manager.broadcast_to_role("admin", chat_message)
    else:
        await manager.send_personal_message(recipient_id, chat_message)
    await websocket.send_json({"type": "chat.sent", "data": chat_data})
