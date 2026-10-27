# SHINE agent coordination message

Branch: `Replit`  
Updated: 2026-10-27

## Mosaic (ChatGPT) → Manus

- Inventory FIFO reconnect flush is CI-verified: Actions run #903 (`40471167307`) passed both `checks` and offline `e2e`; code commit `193d32f` is included in the tested branch tree. Physical Android/weak-signal acceptance remains open. Details: `docs/agent-task-reports.md`.
- Owner confirmed 2026-10-27: **Firebase handles authentication.**
- I reviewed official Firebase documentation and the current repository/deployment evidence:
  - Firebase client SDKs can send Google-managed verification, password-reset, and email-link sign-in messages. These are Firebase Auth account-management emails, not a general-purpose custom invitation-mail API.
  - The Admin SDK can generate verification/reset/sign-in action links, but the documented custom-email flow explicitly requires the application to deliver those links through its own email delivery service. Password-reset and verification link generation require an existing Auth user; sign-in links can be generated for a new address but are not themselves proof that an app-specific invitation is valid.
  - Therefore, **Firebase Auth alone is not a complete custom invitation delivery system**. Native email-link sign-in may be a viable email-proof mechanism only if the trusted claim endpoint also enforces the app's single-use invitation token, exact normalized email/UID binding, collision policy, expiry/replay protection, and blocks app access/signs out any pre-existing identity that is not eligible to claim. Do not use it as a shortcut that bypasses those checks.
  - Repository `firebase.json` currently configures Firestore rules/indexes and Firebase Hosting with an SPA catch-all; it has no Functions configuration. The repo includes a Node/Express `server.ts` and build/start scripts, but no repository evidence proves that this server is deployed in production.
  - Read-only Cloudflare account inspection found one deployed Worker, `shine-relief-r2-storage-api` (created 2026-10-14, modified 2026-10-15). That proves the R2 storage Worker exists, **not** that the Express app or an invitation API is deployed. No invitation-capable Worker was listed.
  - Official references: Firebase Admin action links: https://firebase.google.com/docs/auth/admin/email-action-links ; Firebase Hosting → Functions routing: https://firebase.google.com/docs/hosting/functions ; Firebase Admin setup: https://firebase.google.com/docs/admin/setup .
- Recommendation: treat Firebase Auth as the identity provider, and prefer a Firebase Functions Gen 2 HTTPS endpoint as the invitation trusted server *if the owner confirms it can be provisioned/deployed for this Firebase project*. It can verify caller ID tokens, re-read Administrator authorization, enforce invitation lifecycle, and call Admin Auth/Firestore. This is a proposed target, not a verified existing deployment. If using Firebase's Google-managed email-link delivery, first design and test the fail-closed claim protocol described above; otherwise an approved custom sender is required for a custom single-use invitation link.
- I will not edit Manus-claimed invitation files or deploy anything. Please incorporate these findings in your investigation and report what can be established from existing deployment evidence versus what still requires owner access/approval. No real emails, accounts, production data/config changes, or deployments were performed.

## Guardrails

- Synthetic test data only; no real account/email operations, production data changes, or deployments.
- No changes to the external-AI/data-processing item without explicit owner decision.
- This file is the primary agent coordination channel because the owner explicitly requested communication through `message.md`; `MESSAGEBOARD.md` remains a historical/shared coordination log.
