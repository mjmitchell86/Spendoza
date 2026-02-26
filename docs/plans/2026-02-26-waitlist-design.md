# Join Waitlist Design

## Problem

Users without an invite code have no way to express interest in Spendoza. We need a waitlist form on the signup page that captures name, email, IP address, and geolocation.

## Database

New `waitlist` table:

- `id` UUID PRIMARY KEY
- `name` TEXT NOT NULL
- `email` TEXT NOT NULL UNIQUE
- `ip_address` TEXT
- `country` TEXT
- `region` TEXT
- `city` TEXT
- `created_at` TIMESTAMPTZ DEFAULT now()

RLS enabled, no client access (service role only).

## API

**POST /api/auth/waitlist** — public endpoint (no auth). Accepts `{ name, email }`. Extracts IP from `x-forwarded-for` header (Vercel sets this). Resolves geography via `ip-api.com` (free, no key). Inserts into waitlist. Returns 201 on success, 409 if email already exists. Covered by existing auth rate limiter (10 req / 15 min).

Geo lookup is non-blocking — if it fails, record is saved with just the IP.

## Frontend

Signup page gets a "Don't have an invite code? Join the waitlist" link below the invite code field. Clicking swaps to a Name + Email form. Back link returns to signup form. Success shows a confirmation message.
