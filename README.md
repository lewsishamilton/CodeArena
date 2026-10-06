# Code Arena

Registration,payments, ticketing, contest arena, judging and results for the CODE//ARENA coding contest — Vite, Firebase and PayU.

## Project layout

- `src/design/` — every screen: `templates.html` (markup), `styles.css`, `app.js` (page logic), `backend.js` (Firebase + PayU)
- `api/` — Serverless functions (Vercel): student lookup (college API), PayU order creation with SHA-512 hashing, server-to-server PayU verification (`verify_payment`), and PayU response callbacks
- `firestore.rules` — database access controls

## Run locally

1. Copy `.env.example` to `.env` and add Firebase web app settings plus your PayU credentials (`PAYU_KEY`, `PAYU_SALT`, `PAYU_ENV`).
2. Install packages:
   ```powershell
   npm install
   ```
3. Start the web app with `npm run dev`.

## How it works

- **Students** enter their roll number on `/register`; the `lookupStudent` function fetches their record from the college API (`mlrit-api.onrender.com`) and passes only name, course, branch, roll no, year and email to the browser. They create a password, which becomes their login (roll number + password).
- **Payment** is handled seamlessly via PayU (`payWithPayU` function). It initiates PayU Checkout (via PayU Bolt modal or hosted redirect), verifies the transaction securely on the server via PayU's `verify_payment` API, and issues tickets in order: TK-01, TK-02, …
- **Contest day:** start the contest in **Competition control**. Problems unlock only for paid students while the contest is open. Submissions are stored; judge each one in **Results → Judge submissions** — scores and the leaderboard update as you judge.
- **After the contest:** end it, finish judging, publish results (the leaderboard becomes public), then issue certificates.
- If a student paid offline, use **Mark as paid** in Participants or Payments.
