# Household management and invite codes — design

*Updated at the end of the API + web work to match what shipped (rulings R-H1–R-H18 in the build ledger).*

## Why

A household head needs to run their household from any device: see who's in it, bring people in, take people out, and stop an invite code from working once it has gone further than intended. Today a removed member still knows the code and can walk straight back in, "Invite by email" stores a row but never sends anything, and the iPhone app has no household screens yet.

The owner's rule from 2026-10-29 applies: **every interface ships the same features** — the web and the iPhone app (and the AI assistant server where it fits). This feature is built for the API, the web and the app together.

## Goals

- The head can **get a new invite code** at any time; the old code stops working immediately.
- **Removing a member rotates the code automatically**, so the person removed can't rejoin with the code they knew. *(My call.)*
- The head can **rename** the household and **delete** it (removes everyone; their own data is untouched).
- **Invitations by email actually arrive**, list as pending, can be **revoked**, and can be **accepted in the app or on the web** with the invitation code from the email (the web link prefills it).
- Members can see the household, members and what each shares; edit their own sharing; leave. The head can remove members and hand over ownership. (These exist on the web; the app gets them.)
- **The same set of actions, with the same words, on web and iPhone.**

## Non-goals

- Household dashboard numbers (dial, drill-down, shared goals and debts) — that's the iPhone Home tab's second plan; the web already has it.
- MCP tools for managing a household. Assistants keep the existing read-only `get_household_dashboard`; changing membership or codes is something a person does in the app. *(My call.)*

## Decisions

### The invite code
- **Only the head sees the code.** The code lives in its own table, `household_invite_codes (household_id primary key → households on delete cascade, code unique, updated_at)`, not on `households` (any member can read the `households` row through RLS). Row-level security lets only that household's head **select** it; there is no client insert/update/delete — creating, rotating and joining go through the API with the service role. The API adds `invite_code` to the household it returns **for the head only**; for everyone else the key is absent. A household can have no code row (the key is then absent for the head too, and the head is offered only "Get a new code"). *(R-H4, R-H6.)*
- **New code format:** 10 characters from the Crockford base-32 alphabet (no I, L, O, U), about 50 bits, stored lowercase, shown as `ABCDE-FGHJK`. *(My call — the old 8-hex-character codes are about 32 bits and are now the only credential.)*
- **Join accepts what people type:** spaces and hyphens are removed and letters lower-cased before the lookup. Existing 8-character codes keep working until the head gets a new one (they're lowercase hex, a subset of the alphabet, and a different length, so they can't collide). Existing codes were copied into the new table unchanged (R-H5).
- **"Get a new code"** (head only): a confirm dialog titled "Get a new code?" with "Anyone who has the old code won't be able to use it. People already in your household stay.", buttons "Cancel" and "Get a new code" (R-H16). Then the new code shows with Copy and Share. Rotation upserts the code row and checks it was saved.
- **Joining by code** (`POST /join` and `POST /:id/join`) is capped at 5 failed attempts per user per 15 minutes, one budget shared by both routes ("Too many attempts. Try again in 15 minutes.").

### Invitations
- **Invite by email** sends an email (Resend, the provider already used for report emails) — wording in "A household invitation is also a way in" below. The email never contains the household's join code, so rotating that code never breaks an invitation. *(My call.)*
- **Emails are stored and matched lowercased** (new invitations, a one-time backfill, and every lookup by the caller's email) (R-H12).
- An invitation is valid for 7 days. Inviting the same email again while one is pending (live or expired) refreshes it — new 7 days, same invitation code — and resends it instead of creating a duplicate.
- **Limits** (R-H10): a head can send 20 invitations per hour ("Too many invitations. Try again later."); the same pending invitation can't be resent within 10 minutes (429 "You just sent this invitation. Try again in a few minutes."). Each send claims the cooldown atomically before it goes out (so two simultaneous resends send one email), and a failed send (502 "Couldn't send the invitation email. Try again.") hands the claim back, so it can be retried straight away. Resends still count toward the 10-member limit (members plus live pending invitations, not counting the one being resent).
- **The head sees pending invitations** ("Sent <date> · Expires <date>") and can **revoke** one.
- **The invitee sees their pending invitations** where "Create or join a household" appears (web household page; app Home tab) with **Accept** and **Decline**. The list shows the household and inviter names but never the code: **accepting and declining need the invitation code from the email** (R-H9). A wrong code, someone else's invitation, a missing, revoked or declined one all answer the same 404 "Invitation not found", so invitations can't be probed; the caller's own expired invitation with the right code answers 400 "This invitation has expired". Accept and decline share a budget of 5 failed attempts per user per 15 minutes. Accepting then checks they aren't in a household and the household has room.
- The web prefills the code from `?invitation=<code>` only when there is exactly one pending invitation (so a prefill can't burn attempts on the wrong row); a signed-out person following the email link signs in and comes back to the same `/household?invitation=…` URL (R-H17).
- **Invitations sent before invitation codes existed** have no code and can't be accepted until the head invites that email again, which gives them a code and sends a fresh email (a never-sent legacy invitation isn't held by the cooldown).
- If a join's database write fails, the person is told "Couldn't join the household. Try again." and their invitation stays pending.

### Household
- **Rename** (head): 1–100 characters, same rule as create.
- **Delete** (head): confirm by typing the household name. Order (R-H8): the household's code row first (no joins mid-delete), then its invitations, then its household-owned `reports`, `goals`, `debts`, `email_jobs` and `email_report_log` rows (`entity_type = 'household'` only), then the household. `profiles.household_id` is `ON DELETE SET NULL`, so the last step detaches everyone atomically; any earlier failure leaves the household and its people intact and the delete can be retried. Members' own money data is untouched. The last member leaving uses the same delete.
- **Remove member** (head): only someone in this household (fixes today's bug where any user id was accepted). The code rotates **before** the member is detached, so there's never a moment when they're out but the old code still works.
- **Make head of household** (head): hands over ownership; the former head stays a member and the code doesn't change.
- **Create** refuses if you're already in a household ("Leave your household before creating a new one").

### Words (same on web and app)
"Get a new code", "Copy", "Share", "Invite by email", "Pending invitations", "Revoke", "Accept", "Decline", "Rename household", "Delete household", "Remove from household", "Make head of household", "Leave household". Errors use the API's text verbatim, except plan refusals, which read "Not available on your plan yet" with a "Plans & billing" link.

## Constraints

- API: Express + Zod schemas in `packages/shared`, TDD, PR against `test`.
- Web: React + TanStack Query hooks in `packages/web/src/hooks/use-household.ts`, components in `packages/web/src/components/household/`.
- App: the iPhone app's Home tab, built on the app foundation (`docs/superpowers/plans/2026-10-29-ios-foundation-health.md`): `SpendozaAPI`, `Theme`, `MainTabs`.
- The app's Home tab only appears once it has real screens, so the API and web parts can ship first; the app's household management lands in the first build that has a Home tab. *(My reading of the parity rule while the app is TestFlight-only.)*

### A household invitation is also a way in (owner's decision, 2026-10-29)
- Someone **without a Spendoza account** can create one from a household invitation, without a separate sign-up invite code.
- Each invitation gets its own **invitation code**: 10 characters, same Crockford alphabet and `ABCDE-FGHJK` display as the household code, stored in the unique column `household_invitations.code`, tied to the invited email, expiring with the invitation. It is not the household's join code, so rotating the household code never breaks an invitation, and revoking an invitation kills its code. Clients have no direct access to the code: invitation reads and writes go through the API.
- **The email** (R-H11): the subject is always "You've been invited to a household on Spendoza". The inviter and household names appear only in the body, as quoted values — newlines stripped, cut to 60 characters, HTML-escaped (the plain-text part likewise): `"<Inviter>" invited you to join the household "<Household>" on Spendoza. The invitation is valid for 7 days.` It shows "Your invitation code: ABCDE-FGHJK", an **Accept invitation** link to `https://www.spendoza.io/household?invitation=<code>`, and "New to Spendoza? Create your account with invitation code ABCDE-FGHJK" → `https://www.spendoza.io/signup?invitation=<code>&email=<email>`.
- **Sign-up accepts either code** in the existing invite-code field, relabelled "Invite code or invitation code" on web and app. A sign-up invite code works as today. An invitation code works only when the sign-up email matches the invited email (case-insensitive) and the invitation is pending and unexpired. It creates the account; then:
  - joins the household and marks the invitation accepted (`joined_household: true`; the web says "You've joined <Household>" before onboarding, since a new account goes through onboarding first);
  - if the household is full, the account is still created, the invitation stays pending, and the person sees "That household is full now" (`household_full: true`);
  - if the household's head isn't on Pro (with plan checks on), the account is still created, the invitation stays pending, and the person sees "That household isn't available on your plan yet" (`household_not_on_plan: true`) (R-H13).
  A wrong code, a different email, a revoked or expired invitation all return the same "Invalid or already-used invite code", so codes can't be probed.
- The invitation code is the proof the person controls that inbox; the invitation's database id is never accepted as a credential.

### Plans (owner's decision, 2026-10-29; refined by R-H14, R-H15, R-H18)
- **Creating a household, and growing or changing one — invite, get a new code, rename — need the caller on Pro.**
- **Using a household — your own sharing, joining by code, accepting an invitation, the household dashboard and household reports — works when the caller is on Pro *or* the household's head is.** Each route names the household it checks (R-H15): join by code checks the household the code belongs to, accept checks the invitation's household, `/:id` routes check that id (their handlers also check membership), and every other route the caller's own household — never a code or id taken from a request body.
- **Seeing your household and managing exits work on any plan**: viewing the household and its members (`GET /household`, `GET /household/:id`), the head's pending-invitations list, leaving, deleting the household, handing over ownership, removing a member, revoking an invitation, listing and declining your own invitations. A head who drops below Pro can always hand over, remove people or close the household, and nobody is trapped.
- If the head drops below Pro, members still see the household and can leave; the plan-gated parts show "Not available on your plan yet" with a "Plans & billing" link (`https://www.spendoza.io/pricing`) until the head is on Pro again or someone on Pro becomes head. Nobody's data is removed.
- On the web, a free user without a household can join with a code and sees their invitations; creating one shows the upgrade prompt ("Upgrade to the Pro plan to create a household").
- With plan checks switched off (no `STRIPE_SECRET_KEY`), everything stays open as today.
