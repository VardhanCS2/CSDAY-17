from app.database.database import SessionLocal
from app.models.order import Order
from app.models.product import Product


def test_create_order(client, auth_headers):

    cart_response = client.post(
        "/cart/add",
        headers=auth_headers,
        params={
            "product_identifier": "1",
            "quantity": 1
        }
    )

    assert cart_response.status_code == 200

    shipping_address = {
        "full_name": "Test Customer",
        "email": "customer@example.com",
        "phone": "+1 555 010 0150",
        "address_line": "10 Example Street",
        "city": "Example City",
        "postal_code": "10001",
        "country": "Example Country",
    }
    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={"shipping_address": shipping_address, "payment_method": "card"},
    )


    assert response.status_code == 200
    assert response.json()["data"]["shipping_address"] == shipping_address
    assert response.json()["data"]["payment_method"] == "card"

    order_id = response.json()["data"]["id"]
    customer_orders = client.get("/orders/", headers=auth_headers)
    saved_order = next(order for order in customer_orders.json()["data"] if order["id"] == order_id)
    assert saved_order["payment_method"] == "card"

    admin_orders = client.get("/orders/admin/all", headers=auth_headers)
    admin_order = next(order for order in admin_orders.json()["data"] if order["id"] == order_id)
    assert admin_order["payment_method"] == "card"

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
        if order:
            for item in order.items:
                product = db.query(Product).filter(Product.id == item.product_id).first()
                if product:
                    product.stock += item.quantity
            db.delete(order)
            db.commit()
    finally:
        db.close()


def test_create_order_without_shipping_details_remains_supported(client, auth_headers):
    cart_response = client.post(
        "/cart/add",
        headers=auth_headers,
        params={"product_identifier": "1", "quantity": 1},
    )
    assert cart_response.status_code == 200
    response = client.post("/orders/", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["data"]["shipping_address"] is None

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.id == response.json()["data"]["id"]).first()
        if order:
            for item in order.items:
                product = db.query(Product).filter(Product.id == item.product_id).first()
                if product:
                    product.stock += item.quantity
            db.delete(order)
            db.commit()
    finally:
        db.close()



def test_get_orders(client, auth_headers):

    response = client.get(
        "/orders/",
        headers=auth_headers
    )


    assert response.status_code == 200


def test_admin_can_get_all_orders(client, auth_headers):

    response = client.get(
        "/orders/admin/all",
        headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    orders = response.json()["data"]
    if orders:
        assert "customer" in orders[0]
        assert all("product_name" in item for item in orders[0]["items"])
        assert "hashed_password" not in orders[0]


def test_all_orders_requires_admin(client):

    response = client.get("/orders/admin/all")

    assert response.status_code == 401


def test_customer_cannot_get_all_orders(client, customer_headers):
    response = client.get(
        "/orders/admin/all",
        headers=customer_headers
    )

    assert response.status_code == 403


def test_admin_must_advance_order_through_each_fulfillment_status(client, auth_headers):

    profile = client.get("/auth/me", headers=auth_headers).json()["data"]
    db = SessionLocal()
    order = Order(user_id=profile["id"], total_amount=10, status="Pending")
    db.add(order)
    db.commit()
    db.refresh(order)
    order_id = order.id
    db.close()

    response = client.patch(
        f"/orders/{order_id}/status",
        headers=auth_headers,
        json={"status": "Completed"},
    )
    assert response.status_code == 400

    for status in ("Packed", "Shipped", "Out for Delivery", "Delivered", "Completed"):
        response = client.patch(
            f"/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": status},
        )
        assert response.status_code == 200
        assert response.json()["data"]["status"] == status

    db = SessionLocal()
    try:
        db.query(Order).filter(Order.id == order_id).delete()
        db.commit()
    finally:
        db.close()


def test_customer_cannot_advance_order_status(client, customer_headers):
    response = client.patch(
        "/orders/1/status",
        headers=customer_headers,
        json={"status": "Packed"},
    )

    assert response.status_code == 403