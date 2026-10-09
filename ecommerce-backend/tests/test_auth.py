def test_register_user(client, user_credentials):

    response = client.post(
        "/auth/register",
        json=user_credentials
    )


    assert response.status_code == 200



def test_login_user(client, user_credentials):

    registration = client.post("/auth/register", json=user_credentials)
    assert registration.status_code == 200
    response = client.post(
        "/auth/login",
        json=user_credentials
    )


    assert response.status_code == 200


    data = response.json()


    assert data["success"] is True

    assert "access_token" in data["data"]


def test_refresh_rotates_tokens_and_refresh_tokens_cannot_access_protected_routes(client, user_credentials):
    assert client.post("/auth/register", json=user_credentials).status_code == 200
    login = client.post("/auth/login", json=user_credentials)
    tokens = login.json()["data"]

    refreshed = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    new_tokens = refreshed.json()["data"]
    assert new_tokens["access_token"] != tokens["access_token"]
    assert new_tokens["refresh_token"] != tokens["refresh_token"]
    assert client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
    ).status_code == 200
    assert client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {tokens['refresh_token']}"},
    ).status_code == 401


def test_refresh_rejects_access_tokens(client, user_credentials):
    assert client.post("/auth/register", json=user_credentials).status_code == 200
    login = client.post("/auth/login", json=user_credentials)

    response = client.post(
        "/auth/refresh",
        json={"refresh_token": login.json()["data"]["access_token"]},
    )

    assert response.status_code == 401


def test_cors_allows_configured_frontend_origin(client):
    response = client.options(
        "/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"