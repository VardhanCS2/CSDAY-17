from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.product import Product


def create_order(
    db: Session,
    user_id: int,
    total_amount: float,
    status: str = "Pending",
    shipping_address: dict | None = None,
    payment_method: str | None = None,
):
    order = Order(
        user_id=user_id,
        total_amount=total_amount,
        status=status,
        shipping_address=shipping_address,
        payment_method=payment_method,
    )
    db.add(order)
    db.flush()
    return order


def create_order_item(
    db: Session,
    order_id: int,
    product_id: int,
    quantity: int,
    price: float,
):
    item = OrderItem(
        order_id=order_id,
        product_id=product_id,
        quantity=quantity,
        price=price,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_user_orders(db: Session, user_id: int):
    return (
        db.query(Order)
        .options(selectinload(Order.items).joinedload(OrderItem.product))
        .filter(Order.user_id == user_id)
        .order_by(Order.created_at.desc())
        .all()
    )


def get_all_orders(db: Session):
    return (
        db.query(Order)
        .options(selectinload(Order.items).joinedload(OrderItem.product))
        .order_by(Order.created_at.desc())
        .all()
    )


def get_order_by_id(
    db: Session,
    order_id: int,
    user_id: int | None = None,
):
    query = db.query(Order).filter(Order.id == order_id)
    if user_id is not None:
        query = query.filter(Order.user_id == user_id)
    return query.options(selectinload(Order.items).joinedload(OrderItem.product)).first()


def cancel_order_by_id(
    db: Session,
    order_id: int,
    user_id: int | None = None,
):
    query = db.query(Order).filter(Order.id == order_id)
    if user_id is not None:
        query = query.filter(Order.user_id == user_id)
    order = query.options(selectinload(Order.items)).first()

    if not order:
        return None, "Order not found"

    if order.status != "Pending":
        return None, f"Cannot cancel an order with status '{order.status}'"

    product_ids = [item.product_id for item in order.items]
    products = {
        product.id: product
        for product in db.query(Product).filter(Product.id.in_(product_ids)).all()
    } if product_ids else {}
    for item in order.items:
        product = products.get(item.product_id)
        if product:
            product.stock += item.quantity

    order.status = "Cancelled"
    db.commit()
    db.refresh(order)
    return order, None


ORDER_STATUS_TRANSITIONS = {
    "Pending": "Packed",
    "Packed": "Shipped",
    "Shipped": "Out for Delivery",
    "Out for Delivery": "Delivered",
    "Delivered": "Completed",
}


def update_order_status_by_id(db: Session, order_id: int, status: str):
    order = (
        db.query(Order)
        .options(selectinload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )

    if not order:
        return None, "Order not found"

    expected_status = ORDER_STATUS_TRANSITIONS.get(order.status)
    if expected_status != status:
        next_status = expected_status or "no further status"
        return None, f"Cannot move an order from '{order.status}' to '{status}'. Next status: '{next_status}'"

    order.status = status
    db.commit()
    db.refresh(order)
    return order, None
