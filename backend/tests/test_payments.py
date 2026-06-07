from fastapi.testclient import TestClient
from app.main import app
import uuid
import hmac
import hashlib

client = TestClient(app)


def test_get_plans():
    response = client.get("/payments/plans")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) >= 2


def test_create_order(auth_headers):
    payload = {"plan_code": "pro"}
    response = client.post("/payments/create-order", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "order_id" in data
    assert data["amount"] > 0


def test_verify_payment(auth_headers):
    # Create order first to have it in the DB
    payload = {"plan_code": "pro"}
    create_resp = client.post("/payments/create-order", json=payload, headers=auth_headers)
    assert create_resp.status_code == 200
    order_id = create_resp.json()["order_id"]

    # Generate a unique payment ID using UUID
    pay_id = f"pay_verified_{uuid.uuid4().hex[:12]}"

    # Calculate valid signature using hmac and core config secret
    from core import config

    secret = config.RAZORPAY_KEY_SECRET or "mock_secret"
    expected_sig = hmac.new(
        secret.encode(),
        f"{order_id}|{pay_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    # Verify payment
    verify_payload = {
        "razorpay_payment_id": pay_id,
        "razorpay_order_id": order_id,
        "razorpay_signature": expected_sig,
        "plan_code": "pro",
    }
    response = client.post("/payments/verify", json=verify_payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_verify_payment_invalid_sig(auth_headers):
    # Verify with invalid signature
    verify_payload = {
        "razorpay_payment_id": "pay_invalid_123",
        "razorpay_order_id": "order_mock_123",
        "razorpay_signature": "invalid",
        "plan_code": "pro",
    }
    response = client.post("/payments/verify", json=verify_payload, headers=auth_headers)
    assert response.status_code == 400


def test_webhook_payment_captured(auth_headers):
    # Create order first
    payload = {"plan_code": "pro"}
    create_resp = client.post("/payments/create-order", json=payload, headers=auth_headers)
    assert create_resp.status_code == 200
    order_id = create_resp.json()["order_id"]

    # Generate unique payment ID using UUID
    pay_id = f"pay_captured_web_{uuid.uuid4().hex[:12]}"

    webhook_payload = {
        "event": "payment.captured",
        "payload": {
            "payment": {"entity": {"id": pay_id, "order_id": order_id, "method": "upi", "error_description": None}}
        },
    }
    response = client.post("/payments/webhook", json=webhook_payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_webhook_payment_failed(auth_headers):
    # Create order first
    payload = {"plan_code": "pro"}
    create_resp = client.post("/payments/create-order", json=payload, headers=auth_headers)
    assert create_resp.status_code == 200
    order_id = create_resp.json()["order_id"]

    webhook_payload = {
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_failed_web_999",
                    "order_id": order_id,
                    "error_description": "User cancelled payment transaction",
                }
            }
        },
    }
    response = client.post("/payments/webhook", json=webhook_payload)
    assert response.status_code == 200


def test_get_subscription(auth_headers):
    response = client.get("/payments/subscription", headers=auth_headers)
    # The endpoint might return 200 (if active subscription) or 404
    assert response.status_code in (200, 404)
