from sqlalchemy.orm import Session

from fastapi import HTTPException


from app.redis.cache import (
    get_cart,
    clear_cart
)


from app.models.product import Product
from app.models.order_item import OrderItem
from app.models.order import Order
from app.models.user import User


from app.crud.order import (
    create_order,
    get_all_orders as get_all_orders_crud,
    get_user_orders,
    get_order_by_id,
    cancel_order_by_id,
    update_order_status_by_id,
)

from sqlalchemy.orm import selectinload


from app.celery.tasks import send_order_email



def place_order(
    db: Session,
    user_id: int,
    shipping_address: dict | None = None,
    requested_items: list[dict[str, int]] | None = None,
    payment_method: str | None = None,
):

    cart = (
        {str(item["product_id"]): item["quantity"] for item in requested_items}
        if requested_items is not None
        else get_cart(user_id)
    )


    if not cart:

        raise HTTPException(
            status_code=400,
            detail="Cart is empty"
        )



    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )


    if not user:

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )



    product_ids = [int(product_id) for product_id in cart]
    products_by_id = {
        product.id: product
        for product in db.query(Product)
        .filter(Product.id.in_(product_ids))
        .with_for_update()
        .all()
    }
    total_amount = 0.0
    products = []

    for product_id, quantity in cart.items():
        product = products_by_id.get(int(product_id))


        if not product:

            raise HTTPException(
                status_code=404,
                detail="Product not found"
            )



        if product.stock < quantity:

            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock for {product.name}"
            )



        total_amount += (
            product.price * quantity
        )


        products.append(
            (
                product,
                quantity
            )
        )



    # Create order

    order = create_order(
        db,
        user_id,
        total_amount,
        shipping_address=shipping_address,
        payment_method=payment_method,
    )



    # Create order items and reduce stock

    for product, quantity in products:


        db.add(OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=quantity,
            price=product.price,
        ))
        product.stock -= quantity

    db.commit()
    order = (
        db.query(Order)
        .options(selectinload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order.id)
        .one()
    )

    if requested_items is None:
        clear_cart(user_id)

    send_order_email.delay(user.email, order.id)
    return order


def get_orders(
    db: Session,
    user_id: int
):

    return get_user_orders(
        db,
        user_id
    )


def get_all_orders(
    db: Session
):

    return get_all_orders_crud(db)


def get_order(
    db: Session,
    order_id: int,
    user_id: int | None = None
):

    return get_order_by_id(
        db,
        order_id,
        user_id
    )


def cancel_order(
    db: Session,
    order_id: int,
    user_id: int | None = None
):

    return cancel_order_by_id(
        db,
        order_id,
        user_id
    )


def update_order_status(db: Session, order_id: int, status: str):
    return update_order_status_by_id(db, order_id, status)
