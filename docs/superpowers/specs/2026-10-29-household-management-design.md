# Household management and invite codes — design

## Why

A household head needs to run their household from any device: see who's in it, bring people in, take people out, and stop an invite code from working once it has gone further than intended. Today a removed member still knows the code and can walk straight back in, "Invite by email" stores a row but never sends anything, and the iPhone app has no household screens yet.

The owner's rule from 2026-10-29 applies: **every interface ships the same features** — the web and the iPhone app (and the AI assistant server where it fits). This feature is built for the API, the web and the app together.

## Goals

- The head can **get a new invite code** at any time; the old code stops working immediately.
- **Removing a member rotates the code automatically**, so the person removed can't rejoin with the code they knew. *(My call.)*
- The head can **rename** the household and **delete** it (removes everyone; their own data is untouched).
- **Invitations by email actually arrive**, list as pending, can be **revoked**, and can be **accepted in the app or on the web** without typing a code.
- Members can see the household, members and what each shares; edit their own sharing; leave. The head can remove members and hand over ownership. (These exist on the web; the app gets them.)
- **The same set of actions, with the same words, on web and iPhone.**

## Non-goals

- Household dashboard numbers (dial, drill-down, shared goals and debts) — that's the iPhone Home tab's second plan; the web already has it.
- Letting someone **without a Spendoza account** join from an invitation — sign-up is invite-only and stays that way. The email tells them to ask the sender for a Spendoza invite code. *(Open for the owner — see below.)*
- Changing who can use households (the Pro plan check stays as it is).
- MCP tools for managing a household. Assistants keep the existing read-only `get_household_dashboard`; changing membership or codes is something a person does in the app. *(My call.)*

## Decisions

### The invite code
- **Only the head sees the code.** The API stops sending `invite_code` to other members (the web already hides it from them). *(My call — matches the web today.)*
- **New code format:** 10 characters from the Crockford base-32 alphabet (no I, L, O, U), about 50 bits, stored lowercase, shown as `ABCDE-FGHJK`. *(My call — the old 8-hex-character codes are about 32 bits and are now the only credential.)*
- **Join accepts what people type:** spaces and hyphens are removed and letters lower-cased before the lookup. Existing 8-character codes keep working until the head gets a new one (they're lowercase hex, a subset of the alphabet, and a different length, so they can't collide).
- **"Get a new code"** (head only): confirm sheet — "Anyone who has the old code won't be able to use it. People already in your household stay." Then the new code shows with Copy and Share.
- The existing per-user limit of 5 failed joins per 15 minutes stays.

### Invitations
- **Invite by email** sends an email (Resend, the provider already used for report emails): "<Inviter> invited you to join <Household> on Spendoza. Sign in to accept." with a link to `https://www.spendoza.io/household`. The email does **not** contain the code, so rotating the code never breaks an invitation. *(My call.)*
- An invitation is valid for 7 days (the table already has `expires_at`). Inviting the same email again while one is pending resends it and resets the 7 days instead of creating a duplicate.
- **The head sees pending invitations** (email, sent date, expires) and can **revoke** one.
- **The invitee sees their pending invitations** where "Create or join a household" appears (web household page and onboarding; app Home tab) with **Accept** and **Decline**. Accepting checks: invitation is for their email, still pending, not expired, they aren't in a household, the household has room.

### Household
- **Rename** (head): 1–100 characters, same rule as create.
- **Delete** (head): confirm by typing the household name. Everyone's `household_id` is cleared, pending invitations are deleted, the household row is deleted. Members' own money data is untouched.
- **Remove member** (head): only someone in this household (fixes today's bug where any user id was accepted), then the code rotates.
- **Create** refuses if you're already in a household ("Leave your household before creating a new one").

### Words (same on web and app)
"Get a new code", "Copy", "Share", "Invite by email", "Pending invitations", "Revoke", "Accept", "Decline", "Rename household", "Delete household", "Remove from household", "Make head of household", "Leave household". Errors use the API's text verbatim.

## Constraints

- API: Express + Zod schemas in `packages/shared`, TDD, PR against `test`.
- Web: React + TanStack Query hooks in `packages/web/src/hooks/use-household.ts`, components in `packages/web/src/components/household/`.
- App: the iPhone app's Home tab, built on the app foundation (`docs/superpowers/plans/2026-10-29-ios-foundation-health.md`): `SpendozaAPI`, `Theme`, `MainTabs`.
- The app's Home tab only appears once it has real screens, so the API and web parts can ship first; the app's household management lands in the first build that has a Home tab. *(My reading of the parity rule while the app is TestFlight-only.)*

## Open for the owner

1. **Invitees without an account.** Should a household invitation also let someone create a Spendoza account (skipping the sign-up invite code)? Today they'd need a separate sign-up invite code.
2. **Free-plan invitees.** All household routes need Pro, so a free user who's invited can't accept. Keep, or let anyone join a Pro member's household?
