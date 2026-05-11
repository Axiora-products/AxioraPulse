"""payment phase 1 database

Revision ID: 4f9a7b2c1d33
Revises: e7da82edf568
Create Date: 2026-05-11

Adds plan, subscription, and payment tables for Razorpay integration,
plus user_profiles.is_internal so Axiora team members can bypass billing gates.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "4f9a7b2c1d33"
down_revision: Union[str, None] = "e7da82edf568"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        ALTER TABLE user_profiles
            ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

        CREATE TABLE IF NOT EXISTS plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code VARCHAR(50) NOT NULL,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            price_paise INTEGER NOT NULL DEFAULT 0,
            currency VARCHAR(3) NOT NULL DEFAULT 'INR',
            billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly',
            max_surveys INTEGER,
            max_responses INTEGER,
            max_team_members INTEGER,
            ai_insights_enabled BOOLEAN NOT NULL DEFAULT false,
            razorpay_plan_id VARCHAR(100),
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_plans_code UNIQUE (code),
            CONSTRAINT uq_plans_razorpay_plan_id UNIQUE (razorpay_plan_id)
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
            status VARCHAR(50) NOT NULL DEFAULT 'active',
            razorpay_subscription_id VARCHAR(100),
            current_period_start TIMESTAMPTZ,
            current_period_end TIMESTAMPTZ,
            cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
            cancelled_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_subscriptions_tenant_id UNIQUE (tenant_id),
            CONSTRAINT uq_subscriptions_razorpay_subscription_id UNIQUE (razorpay_subscription_id)
        );

        CREATE TABLE IF NOT EXISTS payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
            plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
            razorpay_order_id VARCHAR(100),
            razorpay_payment_id VARCHAR(100),
            razorpay_invoice_id VARCHAR(100),
            amount_paise INTEGER NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'INR',
            status VARCHAR(50) NOT NULL DEFAULT 'created',
            method VARCHAR(50),
            paid_at TIMESTAMPTZ,
            failure_reason TEXT,
            provider_payload JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_payments_razorpay_order_id UNIQUE (razorpay_order_id),
            CONSTRAINT uq_payments_razorpay_payment_id UNIQUE (razorpay_payment_id),
            CONSTRAINT uq_payments_razorpay_invoice_id UNIQUE (razorpay_invoice_id)
        );

        CREATE INDEX IF NOT EXISTS ix_plans_code ON plans (code);
        CREATE INDEX IF NOT EXISTS ix_subscriptions_tenant_id ON subscriptions (tenant_id);
        CREATE INDEX IF NOT EXISTS ix_subscriptions_plan_id ON subscriptions (plan_id);
        CREATE INDEX IF NOT EXISTS ix_payments_tenant_id ON payments (tenant_id);
        CREATE INDEX IF NOT EXISTS ix_payments_subscription_id ON payments (subscription_id);
        CREATE INDEX IF NOT EXISTS ix_payments_plan_id ON payments (plan_id);

        INSERT INTO plans (
            code,
            name,
            description,
            price_paise,
            currency,
            billing_period,
            max_surveys,
            max_responses,
            max_team_members,
            ai_insights_enabled,
            is_active
        ) VALUES
            (
                'free',
                'Free',
                'Starter plan for trying AxioraPulse',
                0,
                'INR',
                'monthly',
                3,
                100,
                1,
                false,
                true
            ),
            (
                'pro',
                'Pro',
                'Paid plan for growing teams',
                99900,
                'INR',
                'monthly',
                50,
                10000,
                10,
                true,
                true
            ),
            (
                'enterprise',
                'Enterprise',
                'Custom plan for larger organisations',
                0,
                'INR',
                'monthly',
                NULL,
                NULL,
                NULL,
                true,
                true
            )
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price_paise = EXCLUDED.price_paise,
            currency = EXCLUDED.currency,
            billing_period = EXCLUDED.billing_period,
            max_surveys = EXCLUDED.max_surveys,
            max_responses = EXCLUDED.max_responses,
            max_team_members = EXCLUDED.max_team_members,
            ai_insights_enabled = EXCLUDED.ai_insights_enabled,
            is_active = EXCLUDED.is_active,
            updated_at = now();

        INSERT INTO subscriptions (tenant_id, plan_id, status)
        SELECT tenants.id, plans.id, 'active'
        FROM tenants
        JOIN plans ON plans.code = 'free'
        WHERE NOT EXISTS (
            SELECT 1
            FROM subscriptions
            WHERE subscriptions.tenant_id = tenants.id
        );
        """
    )


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_table("subscriptions")
    op.drop_table("plans")
    op.drop_column("user_profiles", "is_internal")
