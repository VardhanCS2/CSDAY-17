from collections import defaultdict
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[int, set[WebSocket]] = defaultdict(set)
        self.connection_roles: dict[WebSocket, str] = {}

    async def connect(self, user_id: int, role: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[user_id].add(websocket)
        self.connection_roles[websocket] = role

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        self.active_connections[user_id].discard(websocket)
        self.connection_roles.pop(websocket, None)
        if not self.active_connections[user_id]:
            del self.active_connections[user_id]

    async def send_personal_message(self, user_id: int, message: dict[str, Any]) -> None:
        for websocket in tuple(self.active_connections.get(user_id, ())):
            try:
                await websocket.send_json(message)
            except (WebSocketDisconnect, RuntimeError):
                self.disconnect(user_id, websocket)

    async def broadcast_to_role(self, role: str, message: dict[str, Any]) -> None:
        recipients = [
            (user_id, websocket)
            for user_id, sockets in tuple(self.active_connections.items())
            for websocket in tuple(sockets)
            if self.connection_roles.get(websocket) == role
        ]
        for user_id, websocket in recipients:
            try:
                await websocket.send_json(message)
            except (WebSocketDisconnect, RuntimeError):
                self.disconnect(user_id, websocket)

    async def publish_order_change(self, order: Any, customer_name: str | None = None) -> None:
        items = [
            {
                "product_id": item.product_id,
                "product_name": getattr(getattr(item, "product", None), "name", f"Product #{item.product_id}"),
                "quantity": item.quantity,
                "price": item.price,
            }
            for item in getattr(order, "items", ())
        ]
        order_data = {
            "order_id": order.id,
            "user_id": order.user_id,
            "status": order.status,
            "total_amount": order.total_amount,
            "items": items,
        }
        order_update = {"type": "order.updated", "data": order_data}
        await self.send_personal_message(order.user_id, order_update)
        await self.broadcast_to_role("admin", order_update)

        if order.status == "Pending":
            await self.send_personal_message(order.user_id, {
                "type": "notification",
                "data": {
                    **order_data,
                    "title": "Order placed successfully",
                    "message": f"Your order #{order.id} has been placed successfully.",
                },
            })
            await self.broadcast_to_role("admin", {
                "type": "notification",
                "data": {
                    **order_data,
                    "title": "New order",
                    "message": f"Order #{order.id} was placed by {customer_name or 'a customer'}.",
                },
            })
        else:
            item_summary = ", ".join(
                f"{item['quantity']} × {item['product_name']}"
                for item in items
            ) or "no items"
            await self.send_personal_message(order.user_id, {
                "type": "notification",
                "data": {
                    **order_data,
                    "title": "Order update",
                    "message": (
                        f"Your order #{order.id} ({item_summary}, "
                        f"total ₹{order.total_amount:,.2f}) is now {order.status.lower()}."
                    ),
                },
            })


manager = ConnectionManager()
