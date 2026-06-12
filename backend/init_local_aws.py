import os
import sys
import time
import boto3
from botocore.exceptions import EndpointConnectionError

# Inside docker network, Floci is available at pulse-floci
FLOCI_ENDPOINT = os.getenv("FLOCI_ENDPOINT_URL", "http://pulse-floci:4566")
REGION = os.getenv("AWS_DEFAULT_REGION", "ap-south-1")

print(f"🔄 Connecting to Floci Server at {FLOCI_ENDPOINT} (Region: {REGION})...")

# Wait for Floci to be ready
attempts = 0
max_attempts = 15
ssm_client = None
cognito_client = None

while attempts < max_attempts:
    try:
        ssm_client = boto3.client(
            "ssm",
            region_name=REGION,
            endpoint_url=FLOCI_ENDPOINT,
            aws_access_key_id="mock",
            aws_secret_access_key="mock",
        )
        cognito_client = boto3.client(
            "cognito-idp",
            region_name=REGION,
            endpoint_url=FLOCI_ENDPOINT,
            aws_access_key_id="mock",
            aws_secret_access_key="mock",
        )
        # Test connection
        ssm_client.describe_parameters(MaxResults=1)
        print("✅ Connected to Floci Server successfully!")
        break
    except (EndpointConnectionError, Exception) as e:
        attempts += 1
        print(f"⏳ Waiting for Floci Server... ({attempts}/{max_attempts}) - {str(e)}")
        time.sleep(2)
else:
    print("❌ Error: Could not connect to Floci Server.")
    sys.exit(1)


def seed_ssm():
    print("📥 Seeding Floci SSM parameters...")

    # Default mock/non-sensitive parameters for local development
    parameters = {
        "SECRET_KEY": "local-development-secret-key-1234567890",
        "ENVIRONMENT": "development",
        "FRONTEND_URL": "http://localhost:5173",
        "DATABASE_URL": "postgresql://postgres:root@pulse-db:5432/nexpulse",
        "MIGRATION_LAMBDA_SECRET": "local-migration-secret-token",
        "GEMINI_KEY": "mock-gemini-api-key",
        "ANTHROPIC_KEY": "mock-anthropic-api-key",
        "OPENAI_KEY": "mock-openai-api-key",
        "RAZORPAY_KEY_ID": "rzp_test_mockkeyid123",
        "RAZORPAY_KEY_SECRET": "mockkeysecret123",
        "DISABLE_PAYMENTS": "true",
        "ZOOM_ACCOUNT_ID": "mock-zoom-account-id",
        "ZOOM_CLIENT_ID": "mock-zoom-client-id",
        "ZOOM_CLIENT_SECRET": "mock-zoom-client-secret",
        "AWS_SES_REGION": "ap-south-1",
        "EMAIL_FROM": "Axiora Pulse <noreply@axiorapulse.com>",
        "TWILIO_ACCOUNT_SID": "ACmockaccountsid1234567890",
        "TWILIO_AUTH_TOKEN": "mocktwilioauthtoken1234567890",
        "TWILIO_WHATSAPP_FROM": "+14155238886",
        "META_WHATSAPP_ACCESS_TOKEN": "EAAmockaccesstoken1234567890",
        "META_WHATSAPP_PHONE_NUMBER_ID": "10987654321",
        "COGNITO_REGION": "ap-south-1",
        "MOCK_COGNITO": "false",
    }

    # Attempt to load custom configurations from template file if it exists
    template_path = "/app/.env.local.template"
    if not os.path.isdir("/app"):
        template_path = "backend/.env.local.template"

    if os.path.exists(template_path):
        print(f"📖 Found template file at {template_path}, loading custom values...")
        with open(template_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    parameters[key] = val
    else:
        print(f"📝 Template file not found. Creating a default template at {template_path}...")
        try:
            with open(template_path, "w") as f:
                f.write("# ==============================================================================\n")
                f.write("# AxioraPulse — Local Development Environment Configuration Template\n")
                f.write("# ==============================================================================\n")
                f.write("# This template acts as the local source of truth for your configuration.\n")
                f.write("# Place custom secrets here (it is gitignored). The seeding script will overlay\n")
                f.write("# these parameters on next container startup.\n")
                f.write("# ==============================================================================\n\n")
                for k, v in parameters.items():
                    f.write(f"{k}={v}\n")
            print(f"✅ Created default template file at: {template_path}")
        except Exception as e:
            print(f"⚠️ Failed to write template file: {str(e)}")

    for key, val in parameters.items():
        # Exclude variables we generate/override dynamically
        if key in ["COGNITO_USER_POOL_ID", "COGNITO_APP_CLIENT_ID"]:
            continue
        try:
            ssm_client.put_parameter(
                Name=f"/axiorapulse/dev/{key}",
                Value=val,
                Type="SecureString" if "SECRET" in key or "KEY" in key else "String",
                Overwrite=True,
            )
        except Exception as e:
            print(f"  ⚠️ Failed to seed SSM param {key}: {str(e)}")

    print(f"✅ Floci SSM Parameters seeded ({len(parameters)} variables).")
    return parameters


def seed_cognito():
    print("📥 Seeding Floci Cognito User Pool & Clients...")
    try:
        # Create pool
        pool = cognito_client.create_user_pool(
            PoolName="AxioraPulseUserPool-dev",
            Schema=[
                {"Name": "email", "AttributeDataType": "String", "Required": True},
                {"Name": "name", "AttributeDataType": "String", "Required": False},
            ],
            AutoVerifiedAttributes=["email"],
        )
        pool_id = pool["UserPool"]["Id"]

        # Create client
        client = cognito_client.create_user_pool_client(
            UserPoolId=pool_id,
            ClientName="AxioraPulseClient-dev",
            ExplicitAuthFlows=["USER_PASSWORD_AUTH", "USER_SRP_AUTH"],
            ReadAttributes=["email", "name"],
            WriteAttributes=["email", "name"],
        )
        client_id = client["UserPoolClient"]["ClientId"]

        print(f"🔑 Created User Pool: {pool_id}")
        print(f"🔑 Created Client ID: {client_id}")

        # Seed initial developer users
        dev_users = [
            {"email": "dev@axiorapulse.com", "name": "Developer User"},
            {"email": "admin@axioraadmin.com", "name": "Admin User"},
        ]

        for u in dev_users:
            cognito_client.admin_create_user(
                UserPoolId=pool_id,
                Username=u["email"],
                UserAttributes=[
                    {"Name": "email", "Value": u["email"]},
                    {"Name": "email_verified", "Value": "true"},
                    {"Name": "name", "Value": u["name"]},
                ],
                MessageAction="SUPPRESS",
            )
            cognito_client.admin_set_user_password(
                UserPoolId=pool_id, Username=u["email"], Password="Password123!", Permanent=True
            )
            print(f"👤 Created user: {u['email']} (Password: Password123!)")

        # Also store these generated values in Floci SSM Parameter store
        ssm_client.put_parameter(
            Name="/axiorapulse/dev/COGNITO_USER_POOL_ID", Value=pool_id, Type="String", Overwrite=True
        )
        ssm_client.put_parameter(
            Name="/axiorapulse/dev/COGNITO_APP_CLIENT_ID", Value=client_id, Type="String", Overwrite=True
        )

        return pool_id, client_id
    except Exception as e:
        print(f"❌ Error seeding Cognito: {str(e)}")
        sys.exit(1)


def generate_env_files(pool_id, client_id, ssm_params):
    print("⚙️ Generating local environment files...")

    # 1. Generate Backend env.docker
    backend_env_path = "/app/.env.docker"
    with open(backend_env_path, "w") as f:
        f.write("# ======================================================================\n")
        f.write("# Generated dynamically from local Floci Server SSM Parameter Store\n")
        f.write("# ======================================================================\n")
        for k, v in ssm_params.items():
            if k not in ["COGNITO_USER_POOL_ID", "COGNITO_APP_CLIENT_ID"]:
                f.write(f"{k}={v}\n")
        f.write(f"COGNITO_USER_POOL_ID={pool_id}\n")
        f.write(f"COGNITO_APP_CLIENT_ID={client_id}\n")
        f.write(f"COGNITO_REGION={REGION}\n")
        f.write("DATABASE_URL=postgresql://postgres:root@pulse-db:5432/nexpulse\n")
        f.write("FRONTEND_URL=http://localhost:5173\n")
        f.write("ENVIRONMENT=development\n")
        f.write("MOCK_COGNITO=false\n")  # Run full Cognito authentication flow using Floci!

    print(f"💾 Written backend environment to: {backend_env_path}")

    # 2. Generate Frontend env.local
    frontend_env_path = "/app/.env.local"
    with open(frontend_env_path, "w") as f:
        f.write("# ======================================================================\n")
        f.write("# Generated dynamically from local Floci Server SSM Parameter Store\n")
        f.write("# ======================================================================\n")
        for k, v in ssm_params.items():
            if k.startswith("VITE_"):
                f.write(f"{k}={v}\n")

        f.write(f"VITE_COGNITO_USER_POOL_ID={pool_id}\n")
        f.write(f"VITE_COGNITO_APP_CLIENT_ID={client_id}\n")
        f.write(f"VITE_COGNITO_REGION={REGION}\n")
        f.write("VITE_COGNITO_ENDPOINT=http://localhost:4566\n")
        f.write("VITE_API_BASE_URL=http://localhost:8000\n")
        f.write("VITE_MOCK_COGNITO=false\n")  # Use real Cognito SDK flow pointing to local Floci

    print(f"💾 Written frontend environment to: {frontend_env_path}")


if __name__ == "__main__":
    ssm_params = seed_ssm()
    pool_id, client_id = seed_cognito()
    generate_env_files(pool_id, client_id, ssm_params)
    print("🎉 Floci setup and seeding complete!")
