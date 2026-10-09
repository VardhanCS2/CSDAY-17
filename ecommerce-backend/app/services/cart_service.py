from sqlalchemy.orm import Session

from app.models.product import Product


from app.redis.cache import (
    add_to_cart,
    get_cart,
    remove_from_cart,
    clear_cart,
    update_cart_item
)



def add_product_to_cart(
    user_id: int,
    product_id: int,
    quantity: int
):

    return add_to_cart(
        user_id,
        product_id,
        quantity
    )



def get_user_cart(
    db: Session,
    user_id: int
):
    cart = get_cart(
        user_id
    )

    if not cart:
        return []

    product_ids = [int(product_id) for product_id in cart]
    products = db.query(Product).filter(Product.id.in_(product_ids)).all()
    products_by_id = {product.id: product for product in products}

    return [
        {
            "product_id": product.id,
            "name": product.name,
            "description": product.description,
            "image_url": product.image_url,
            "price": product.price,
            "quantity": cart[str(product_id)],
            "total_price": product.price * cart[str(product_id)],
        }
        for product_id in product_ids
        if (product := products_by_id.get(product_id)) is not None
    ]




def remove_product_from_cart(
    user_id: int,
    product_id: int
):

    return remove_from_cart(
        user_id,
        product_id
    )



def clear_user_cart(
    user_id: int
):

    return clear_cart(
        user_id
    )



def update_product_in_cart(
    user_id: int,
    product_id: int,
    quantity: int
):

    return update_cart_item(
        user_id,
        product_id,
        quantity
    )