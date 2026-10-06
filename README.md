# Code Arena

Registration, payments, ticketing, contest arena, judging and results for the CODE//ARENA coding contest — Vite, Firebase and Razorpay.

## Project layout

- `src/design/` — every screen: `templates.html` (markup), `styles.css`, `app.js` (page logic), `backend.js` (Firebase + Razorpay)
- `functions/` — Cloud Functions: student lookup (college API), account creation, demo payment, Razorpay orders and verification (ready for later), offline payments
- `firestore.rules` — database access controls

## Run locally

1. Copy `.env.example` to `.env` and add Firebase web app settings plus your Razorpay public key.
2. Copy `functions/.env.example` to `functions/.env` and add Razorpay credentials. Keep this file private.
3. Install packages in both folders:
   ```powershell
   npm install
   Set-Location functions; npm install; Set-Location ..
   ```
4. Start the web app with `npm run dev`.

## Deploy Firebase

Build the app, then deploy Hosting, Firestore rules, and Functions:

```powershell
npm run build
Set-Location functions; npm run build; Set-Location ..
firebase deploy
```

## First-time setup (Firebase console)

1. **Authentication → Sign-in method:** enable **Email/Password**.
2. **Authentication → Users → Add user:** email `admin@codearena.local` with the organiser password. The organiser logs in on the site with ID `admin` and that password. The password is never stored in the code.
3. Deploy (above), log in as admin, then in **Admin → Settings**:
   - fill in the event details (name, date and start time, venue, college, fee, capacity, duration, eligible years) and save. The landing page schedule is calculated from the start time and duration.
4. Add the problems in **Admin → Questions**.

## How it works

- **Students** enter their roll number on `/register`; the `lookupStudent` function fetches their record from the college API (`mlrit-api.onrender.com`) and passes only name, course, branch, roll no, year and email to the browser. They create a password, which becomes their login (roll number + password).
- **Payment is a demo for now** (`demoPay` function — no money is charged). It issues tickets in order: TK-01, TK-02, … Delete `demoPay` and switch the register page to `payWithRazorpay` when Razorpay goes live.
- **Contest day:** start the contest in **Competition control**. Problems unlock only for paid students while the contest is open. Submissions are stored; judge each one in **Results → Judge submissions** — scores and the leaderboard update as you judge.
- **After the contest:** end it, finish judging, publish results (the leaderboard becomes public), then issue certificates.
- If a student paid offline, use **Mark as paid** in Participants or Payments.
