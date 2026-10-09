import asyncio

import pytest
from starlette.websockets import WebSocketDisconnect

from app.websocket.manager import ConnectionManager, manager
from app.websocket.routes import handle_message


def _access_token(headers):
    return headers["Authorization"].removeprefix("Bearer ")


def test_websocket_authenticates_and_handles_ping(client, customer_headers):
    customer_token = _access_token(customer_headers)
    customer_id = client.get("/auth/me", headers=customer_headers).json()["data"]["id"]
    origin = {"origin": "http://localhost:5173"}

    with client.websocket_connect(f"/ws?token={customer_token}", headers=origin) as customer_socket:
        customer_socket.send_json({"type": "ping"})
        assert customer_socket.receive_json()["type"] == "pong"
    assert customer_id not in manager.active_connections


def test_customer_messages_are_broadcast_to_administrators(client, customer_headers, monkeypatch):
    customer = client.get("/auth/me", headers=customer_headers).json()["data"]
    delivered = []

    async def capture_broadcast(role, message):
        delivered.append((role, message))

    class FakeWebSocket:
        def __init__(self):
            self.messages = []

        async def send_json(self, message):
            self.messages.append(message)

    monkeypatch.setattr(manager, "broadcast_to_role", capture_broadcast)
    websocket = FakeWebSocket()
    asyncio.run(handle_message(
        websocket,
        {"id": customer["id"], "name": customer["name"], "role": "user"},
        {"type": "chat.send", "data": {"text": "I need help."}},
    ))

    assert delivered[0][0] == "admin"
    assert delivered[0][1]["type"] == "chat.message"
    assert delivered[0][1]["data"]["sender_id"] == customer["id"]
    assert websocket.messages[0]["type"] == "chat.sent"


def test_admin_can_reply_to_a_specific_customer(client, auth_headers, customer_headers, monkeypatch):
    customer = client.get("/auth/me", headers=customer_headers).json()["data"]
    admin = client.get("/auth/me", headers=auth_headers).json()["data"]
    delivered = []

    async def capture_message(user_id, message):
        delivered.append((user_id, message))

    class FakeWebSocket:
        def __init__(self):
            self.messages = []

        async def send_json(self, message):
            self.messages.append(message)

    monkeypatch.setattr(manager, "send_personal_message", capture_message)
    websocket = FakeWebSocket()
    asyncio.run(handle_message(
        websocket,
        {"id": admin["id"], "name": admin["name"], "role": "admin"},
        {"type": "chat.send", "data": {"recipient_id": customer["id"], "text": "We are here to help."}},
    ))

    assert delivered[0][0] == customer["id"]
    assert delivered[0][1]["type"] == "chat.message"
    assert delivered[0][1]["data"]["text"] == "We are here to help."
    assert websocket.messages[0]["type"] == "chat.sent"


def test_order_updates_reach_customer_and_admin_without_status_notification_leak():
    manager_for_test = ConnectionManager()

    class FakeWebSocket:
        def __init__(self):
            self.messages = []

        async def accept(self):
            pass

        async def send_json(self, message):
            self.messages.append(message)

    customer_socket = FakeWebSocket()
    admin_socket = FakeWebSocket()
    other_customer_socket = FakeWebSocket()
    order = type("Order", (), {
        "id": 81,
        "user_id": 11,
        "status": "Shipped",
        "total_amount": 24,
        "items": [type("Item", (), {
            "product_id": 4,
            "product": type("Product", (), {"name": "Everyday mug"})(),
            "quantity": 2,
            "price": 12,
        })()],
    })()

    async def verify_update():
        await manager_for_test.connect(11, "user", customer_socket)
        await manager_for_test.connect(1, "admin", admin_socket)
        await manager_for_test.connect(22, "user", other_customer_socket)
        await manager_for_test.publish_order_change(order)

    asyncio.run(verify_update())
    assert [message["type"] for message in customer_socket.messages] == ["order.updated", "notification"]
    assert customer_socket.messages[-1]["data"]["message"] == "Your order #81 (2 × Everyday mug, total ₹24.00) is now shipped."
    assert customer_socket.messages[-1]["data"]["items"] == [{
        "product_id": 4,
        "product_name": "Everyday mug",
        "quantity": 2,
        "price": 12,
    }]
    assert [message["type"] for message in admin_socket.messages] == ["order.updated"]
    assert other_customer_socket.messages == []


def test_order_placement_sends_one_personalized_notification_to_customer_and_admin():
    manager_for_test = ConnectionManager()

    class FakeWebSocket:
        def __init__(self):
            self.messages = []

        async def accept(self):
            pass

        async def send_json(self, message):
            self.messages.append(message)

    customer_socket = FakeWebSocket()
    admin_socket = FakeWebSocket()
    unrelated_customer_socket = FakeWebSocket()
    order = type("Order", (), {"id": 92, "user_id": 11, "status": "Pending", "total_amount": 42})()

    async def verify_update():
        await manager_for_test.connect(11, "user", customer_socket)
        await manager_for_test.connect(1, "admin", admin_socket)
        await manager_for_test.connect(22, "user", unrelated_customer_socket)
        await manager_for_test.publish_order_change(order, "Taylor Guest")

    asyncio.run(verify_update())
    assert [message["type"] for message in customer_socket.messages] == ["order.updated", "notification"]
    assert customer_socket.messages[-1]["data"]["title"] == "Order placed successfully"
    assert customer_socket.messages[-1]["data"]["message"] == "Your order #92 has been placed successfully."
    assert [message["type"] for message in admin_socket.messages] == ["order.updated", "notification"]
    assert admin_socket.messages[-1]["data"]["title"] == "New order"
    assert admin_socket.messages[-1]["data"]["message"] == "Order #92 was placed by Taylor Guest."
    assert unrelated_customer_socket.messages == []


def test_websocket_rejects_missing_or_invalid_access_token(client):
    with pytest.raises(WebSocketDisconnect) as disconnect:
        with client.websocket_connect("/ws"):
            pass
    assert disconnect.value.code == 4401
