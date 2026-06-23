"""
backend/dev_cognito.py
──────────────────────
Local-development helper for the Floci (mock AWS) Cognito user pool.

The local Floci container has no email delivery, so a user who signs up through the
app is stranded in UNCONFIRMED status. This script lets you confirm/create/manage
those dev accounts manually against the running Floci server.

Run it inside the backend container (Floci is reachable there as pulse-floci:4566):

    docker exec -i pulse-backend python dev_cognito.py confirm  <email>
    docker exec -i pulse-backend python dev_cognito.py create   <email> [password] [name]
    docker exec -i pulse-backend python dev_cognito.py password <email> <password>
    docker exec -i pulse-backend python dev_cognito.py list

Defaults: password = "Password123!" (same as the seeded dev accounts). The pool id
is resolved from Floci SSM (the source of truth the seeder writes), falling back to
the newest pool named "AxioraPulseUserPool-dev". NOT for production use.
"""

import os
import sys

import boto3
from botocore.exceptions import ClientError

ENDPOINT = os.getenv("AWS_ENDPOINT_URL") or os.getenv("FLOCI_ENDPOINT_URL") or "http://pulse-floci:4566"
REGION = os.getenv("AWS_DEFAULT_REGION", "ap-south-1")
POOL_NAME = "AxioraPulseUserPool-dev"
SSM_POOL_PARAM = "/axiorapulse/dev/COGNITO_USER_POOL_ID"
DEFAULT_PASSWORD = "Password123!"


def _client(service):
    return boto3.client(
        service,
        region_name=REGION,
        endpoint_url=ENDPOINT,
        aws_access_key_id="mock",
        aws_secret_access_key="mock",
    )


def resolve_pool_id(cognito) -> str:
    """Find the active user-pool id: prefer the SSM value the seeder wrote, else the
    most recently created pool with the expected name."""
    try:
        val = _client("ssm").get_parameter(Name=SSM_POOL_PARAM)["Parameter"]["Value"]
        if val:
            return val
    except Exception:
        pass

    pools = cognito.list_user_pools(MaxResults=60).get("UserPools", [])
    matching = [p for p in pools if p.get("Name") == POOL_NAME]
    if not matching:
        print(f"❌ No user pool named '{POOL_NAME}' found at {ENDPOINT}. Is Floci seeded/running?")
        sys.exit(1)
    matching.sort(key=lambda p: p.get("CreationDate", 0), reverse=True)
    return matching[0]["Id"]


def cmd_confirm(cognito, pool_id, email):
    try:
        cognito.admin_confirm_sign_up(UserPoolId=pool_id, Username=email)
        print(f"✅ Confirmed {email}")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        msg = e.response.get("Error", {}).get("Message", "")
        if code == "NotAuthorizedException" or "Current status is CONFIRMED" in msg:
            print(f"ℹ️  {email} was already confirmed")
        elif code == "UserNotFoundException":
            print(f"❌ {email} does not exist in the pool. Use `create` first.")
            sys.exit(1)
        else:
            print(f"❌ Confirm failed for {email}: {code} {msg}")
            sys.exit(1)
    # Always make sure the email is marked verified so sign-in is unblocked.
    cognito.admin_update_user_attributes(
        UserPoolId=pool_id,
        Username=email,
        UserAttributes=[{"Name": "email_verified", "Value": "true"}],
    )
    print(f"   email_verified=true set for {email}")


def cmd_create(cognito, pool_id, email, password, name):
    try:
        cognito.admin_create_user(
            UserPoolId=pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "name", "Value": name},
            ],
            MessageAction="SUPPRESS",  # no email; this is local dev
        )
        print(f"✅ Created {email}")
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "UsernameExistsException":
            print(f"ℹ️  {email} already exists — setting password instead")
        else:
            raise
    cognito.admin_set_user_password(UserPoolId=pool_id, Username=email, Password=password, Permanent=True)
    print(f"✅ {email} is ready — password: {password}")


def cmd_password(cognito, pool_id, email, password):
    cognito.admin_set_user_password(UserPoolId=pool_id, Username=email, Password=password, Permanent=True)
    print(f"✅ Password set for {email}: {password}")


def cmd_list(cognito, pool_id):
    users = cognito.list_users(UserPoolId=pool_id).get("Users", [])
    if not users:
        print("(no users)")
        return
    for u in users:
        email = next((a["Value"] for a in u.get("Attributes", []) if a["Name"] == "email"), u.get("Username"))
        print(f"  {email:40s} {u.get('UserStatus')}")


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print(__doc__)
        return

    action = args[0]
    cognito = _client("cognito-idp")
    pool_id = resolve_pool_id(cognito)
    print(f"🗂️  Pool: {pool_id} @ {ENDPOINT}")

    if action == "confirm":
        if len(args) < 2:
            print("Usage: dev_cognito.py confirm <email>")
            sys.exit(1)
        cmd_confirm(cognito, pool_id, args[1])
    elif action == "create":
        if len(args) < 2:
            print("Usage: dev_cognito.py create <email> [password] [name]")
            sys.exit(1)
        email = args[1]
        password = args[2] if len(args) > 2 else DEFAULT_PASSWORD
        name = args[3] if len(args) > 3 else email.split("@")[0]
        cmd_create(cognito, pool_id, email, password, name)
    elif action == "password":
        if len(args) < 3:
            print("Usage: dev_cognito.py password <email> <password>")
            sys.exit(1)
        cmd_password(cognito, pool_id, args[1], args[2])
    elif action == "list":
        cmd_list(cognito, pool_id)
    else:
        print(f"Unknown command: {action}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
