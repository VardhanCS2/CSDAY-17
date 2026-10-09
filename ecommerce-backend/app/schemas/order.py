from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator



class ShippingAddress(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=30, pattern=r"^[+()\d\s.-]+$")
    address_line: str = Field(min_length=5, max_length=200)
    city: str = Field(min_length=2, max_length=100)
    postal_code: str = Field(min_length=3, max_length=20)
    country: str = Field(min_length=2, max_length=100)

    @field_validator("phone")
    @classmethod
    def phone_must_contain_a_digit(cls, value: str) -> str:
        if not any(character.isdigit() for character in value):
            raise ValueError("Phone number must contain a digit.")
        return value


class OrderItemCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100)


class OrderCreate(BaseModel):
    shipping_address: ShippingAddress | None = None
    items: list[OrderItemCreate] | None = Field(default=None, min_length=1)
    payment_method: Literal["card", "upi", "cash_on_delivery"] | None = None


class OrderStatusUpdate(BaseModel):
    status: Literal["Packed", "Shipped", "Out for Delivery", "Delivered", "Completed"]


class OrderItemResponse(BaseModel):

    id: int
    product_id: int
    product_name: str | None = None
    quantity: int
    price: float


    model_config = ConfigDict(
        from_attributes=True
    )



class OrderResponse(BaseModel):

    id: int
    user_id: int
    total_amount: float
    status: str
    created_at: datetime
    shipping_address: ShippingAddress | None = None
    payment_method: Literal["card", "upi", "cash_on_delivery"] | None = None
    items: list[OrderItemResponse]


    model_config = ConfigDict(
        from_attributes=True
    )