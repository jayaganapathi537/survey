# Firebase Survey Website (2 Pages)

This is a complete two-page website:
- `index.html` (public survey form)
- `admin.html` (secure admin dashboard with login, analytics, and question management)

Everything is powered by Firebase Firestore + Firebase Auth. Charts use Chart.js and update in real time.

## Folder Structure
```
survey-site/
  index.html
  admin.html
  config.js
  firestore.rules
  css/
    styles.css
  js/
    admin.js
    firebase.js
    main.js
    utils.js
```

## Firebase Setup (Required)
1. Create a Firebase project at console.firebase.google.com.
2. Enable **Firestore** (production mode is fine).
3. Enable **Authentication** with **Email/Password**.
4. Create your admin user in Firebase Auth.
5. Open **Project Settings → General** and copy your Firebase web app config.
6. Paste the config values into `survey-site/config.js`.
7. Update the admin email list in `survey-site/config.js` and `survey-site/firestore.rules` to match your admin account.

## Firestore Rules
Deploy the rules in `survey-site/firestore.rules` (update admin email first):
- Public can **read questions** and **create responses**.
- Only admin can read/write responses and manage questions.

You can deploy via Firebase console or CLI:
```
firebase deploy --only firestore:rules
```

## Local Run
From the `survey-site` folder:
```
python3 -m http.server
```
Then open:
- Main form: `http://localhost:8000/index.html`
- Admin dashboard: `http://localhost:8000/admin.html`

## How It Works
- **Main page** listens to the `questions` collection in Firestore and renders the form dynamically.
- After a successful submission, the main form hides and shows a thank-you message.
- **Admin page** requires Firebase Auth login. Once authenticated, it:
  - Seeds the default 12 questions if the `questions` collection is empty.
  - Shows all responses in a table.
  - Builds charts for each question (bar/pie) that update in real time.
  - Lets you add/edit/delete/reorder questions, including dropdown questions (updates the public form instantly).
  - Exports responses to CSV.
  - Opens the live Google Sheet from the Responses header.
  - Shows abuse reports in a separate table.

## Abuse Reports
The public page includes a **Report content** link (top right). Submissions are stored in the `reports` collection and shown separately in the admin dashboard.

## Google Sheets Live Sync (Automatic)
Responses are written to Firestore first, then synced to Google Sheets via a Firebase Cloud Function.
This keeps the data flow **only through Firebase** while still updating the Sheet.

### 1) Enable Google Sheets API
In Google Cloud Console (same Firebase project):
- Enable **Google Sheets API**.

### 2) Create a Service Account
- Create a service account and download the JSON key.
- Share your Google Sheet with the service account email (Editor access).

### 3) Configure Firebase Functions
From `survey-site/`, run:
```
firebase init functions
```
Select JavaScript (Node 18). Then replace the generated `functions/index.js` with the provided one.

Set config values (use your service account JSON):
```
firebase functions:config:set \
  sheets.id="1LaLmPx0GqQMiP90TzazzmFK7MYoZeMvqjAuoNgwx0S4" \
  sheets.tab="Responses" \
  sheets.client_email="YOUR_SERVICE_ACCOUNT_EMAIL" \
  sheets.private_key="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

Deploy the function:
```
firebase deploy --only functions
```

### 4) Sheet Tab Name
Make sure the spreadsheet has a tab named **Responses** (or update `sheets.tab` above).

## Notes
- All responses are stored as single documents in the `responses` collection.
- Question changes are live across both pages.
- Replace the admin email in both `config.js` and `firestore.rules` to secure access.
