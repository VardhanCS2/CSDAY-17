# E-commerce Backend

## Local Setup

Use Python 3.10 or later. PostgreSQL and Redis must be running before starting the API. Start from `.env.example`, copy it to the ignored `.env` file, and fill in local values. Never commit `.env` or place production secrets in source, tests, or frontend `VITE_*` variables.

The backend pins `bcrypt<4.1` because the current `passlib` release is incompatible with newer bcrypt versions and can fail password hashing during registration or login. Install dependencies from this backend's `requirements.txt` and restart the API after changing dependencies; do not rely on a different workspace virtual environment.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Set `DATABASE_URL` to the local PostgreSQL database, generate a private `JWT_SECRET_KEY`, and configure Redis URLs for `REDIS_URL`, `CELERY_BROKER_URL`, and `CELERY_RESULT_BACKEND`. The SMTP settings are required by the current settings model; order email work is currently logged by the Celery task.

Set `CORS_ORIGINS` to a comma-separated list of exact frontend origins (including scheme and port), for example `http://localhost:5173,http://127.0.0.1:5173`. `ENVIRONMENT` identifies the deployment environment. Never use wildcard origins with credentials enabled. The frontend uses `/api` and `/ws` through the Vite development proxy by default; production deployments should set `VITE_API_BASE_URL` and `VITE_WS_BASE_URL` to their API and secure WebSocket endpoints.

```powershell
alembic upgrade head
uvicorn app.main:app --reload
```

In another terminal, start the Celery worker for email, invoice, and CSV-import tasks:

```powershell
celery -A app.celery.worker.celery_app worker --loglevel=info --pool=solo
```

API docs are available at `http://127.0.0.1:8000/docs`. Tests generate per-test users and connect to the configured database and Redis service:

```powershell
pytest -q
```

The checkout endpoint accepts an optional validated `shipping_address` object and stores it with the order. `alembic upgrade head` applies the nullable address column without invalidating existing orders or clients that still submit an empty order request.

The authenticated WebSocket endpoint is `/ws?token=<access-token>`. It accepts `ping` and `chat.send` events, forwards customer support messages to connected administrators, and routes administrator replies to one customer. Order creation and status changes publish `order.updated` and `notification` events only to the customer who owns that order. Administrators advance orders through `Pending` → `Packed` → `Shipped` → `Out for Delivery` → `Delivered` → `Completed` with `PATCH /orders/{order_id}/status` and a JSON `status` value; the API rejects skipped or out-of-order transitions. WebSocket connections use the same signed, expiring access JWTs as HTTP requests.

## Background jobs, search, and payments

Run `alembic upgrade head` after updating. The migration adds durable `background_jobs` and `chats` tables, a nullable order payment-method field, and (on PostgreSQL) `pg_trgm` plus GIN indexes for full-text and trigram product search. Product listing search accepts `search_mode=full_text`, `fuzzy`, or `hybrid`; non-PostgreSQL development/test dialects use a case-insensitive substring fallback.

- `POST /jobs/invoices/{order_id}` queues invoice creation; `GET /jobs/` and `GET /jobs/{job_id}` return persisted status, progress, errors, and results; `GET /jobs/invoices/{order_id}/download` serves the completed PDF after verifying order ownership.
- Invoice and CSV-import requests require a responding Celery worker; if none is available, the API returns HTTP 503 instead of leaving a job queued indefinitely. Job polling also reconciles Celery's completed, failed, and progress states with the persisted job row.
- Admins upload product CSV files to `POST /jobs/imports/products` (`name,price,stock` required; `description,image_url` optional; image URLs must be absolute HTTP(S) URLs; 10 MB maximum). Invalid rows are reported in the completed job result. The web process and Celery worker must share the backend's ignored `private_files/` directory.
- `GET /chats/` returns the authenticated customer's saved conversation; administrators may retrieve all conversations or filter with `customer_id`. WebSocket chat messages are written to `chats` before delivery.
- `POST /orders/` may include `items` for a direct purchase and `payment_method` (`card`, `upi`, or `cash_on_delivery`). A direct purchase does not clear or change the Redis cart. Checkout is a demo only: card/UPI details are validated in the browser and are never sent to or stored by the backend.

Order creation locks requested product rows and loads them in one query; order history eagerly loads items and their products to avoid per-item N+1 queries.

Administrators can create products with either an uploaded image or a validated absolute HTTP(S) `image_url`; product updates accept `image_url`, and `POST /products/{product_id}/image` replaces an uploaded image.
