# Security update

Changes require deploying backend and CRM frontend together. Existing browser tokens
are invalidated: every user must log in again. No database migration is required.

- Browser authentication uses a host-only HttpOnly, SameSite=Strict cookie; production
  also uses Secure and the __Host- prefix. Use HTTPS and VITE_API_URL=/api on the CRM.
- Sessions expire after 30 minutes. Logout revokes all sessions for that account.
  Changing the user record or password also invalidates previously issued tokens.
- Production backend must remain private, behind exactly one trusted Caddy proxy.
  Do not publish port 3000: IP limiting and Origin checks assume this topology.
- Rate limits are per backend process: 10 login requests / 15 min, 5 lead requests /
  15 min, 300 other requests / min per IP. Multiple replicas require a shared limiter.
- PUBLIC_LEADS_ENABLED defaults to false in production and blocks both landing and
  VK lead creation. Enable only when real collection is intentionally configured.
- Trainers cannot change lesson status through CRM HTTP API. Admins and managers can.
  Trainer-specific attendance via VK retains its existing ownership checks.
- Trainer responses recursively redact contact, medical and financial fields.
  Sensitive collections are returned empty for compatibility with read-only screens.
- Repeated unauthenticated submissions cannot overwrite existing pending leads.
- Membership assignment verifies ownership, service eligibility and validity.
  Automatic membership selection cancels pending cash charges and rejects switching
  an already paid cash booking to a membership.

Before rollout: preserve production env files, back up PostgreSQL, build both
frontends, validate Compose, then rebuild/restart the existing deployment. Never
copy demonstration credentials over the production configuration.

After rollout verify HTTPS login, HttpOnly/Secure cookie, absence of a JWT in browser
storage, manager actions, trainer denial (403), nested response redaction, logout
revocation and the disabled public lead response (503). Test using synthetic records.

The removed .tmp/prod-check.env remains recoverable from Git history. If any values
from example/test env files have been used on VPS, rotate those actual secrets.
This patch does not inspect VPS logs or prove that no past access occurred.

Unchanged audit work: real PostgreSQL concurrency testing, queue retry scheduling,
full scheduling constraints and performance optimization require separate validation.
