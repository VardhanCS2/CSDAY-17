from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings


# Password hashing configuration
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


# Hash password
def hash_password(password: str) -> str:

    # bcrypt supports maximum 72 bytes
    password = password[:72]

    return pwd_context.hash(password)



# Verify password
def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:

    # bcrypt supports maximum 72 bytes
    plain_password = plain_password[:72]

    return pwd_context.verify(
        plain_password,
        hashed_password
    )



# Create JWT token
def create_token(
    data: dict,
    expires_delta: timedelta
):

    to_encode = {**data, "jti": uuid4().hex}

    expire = datetime.now(timezone.utc) + expires_delta

    to_encode.update(
        {
            "exp": expire
        }
    )


    return jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )



# Create access token
def create_access_token(
    data: dict
):

    expires = timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    return create_token(
        {**data, "token_type": "access"},
        expires
    )


# Create refresh token
def create_refresh_token(
    data: dict
):

    expires = timedelta(
        hours=settings.REFRESH_TOKEN_EXPIRE_HOURS
    )

    return create_token(
        {**data, "token_type": "refresh"},
        expires
    )



# Decode JWT token
def decode_token(token: str):

    try:

        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[
                settings.JWT_ALGORITHM
            ]
        )

        return payload


    except JWTError:

        return None