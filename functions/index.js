const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");

admin.initializeApp();

const SHEET_ID = functions.config().sheets?.id;
const SHEET_TAB = functions.config().sheets?.tab || "Responses";
const CLIENT_EMAIL = functions.config().sheets?.client_email;
const RAW_PRIVATE_KEY = functions.config().sheets?.private_key;

function getPrivateKey() {
  if (!RAW_PRIVATE_KEY) return null;
  return RAW_PRIVATE_KEY.replace(/\\n/g, "\n");
}

function getSheetsClient() {
  const privateKey = getPrivateKey();
  if (!SHEET_ID || !CLIENT_EMAIL || !privateKey) {
    console.error(
      "Google Sheets config is missing. Set functions config: sheets.id, sheets.client_email, sheets.private_key."
    );
    return null;
  }

  const auth = new google.auth.JWT(CLIENT_EMAIL, null, privateKey, [
    "https://www.googleapis.com/auth/spreadsheets"
  ]);

  return google.sheets({ version: "v4", auth });
}

function normalizeAnswer(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

async function ensureHeader(sheets, header) {
  const range = `${SHEET_TAB}!A1:1`;
  let existing = [];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range
    });
    existing = res.data.values?.[0] || [];
  } catch (err) {
    console.warn("Header read failed, attempting to write header.");
  }

  const isSame =
    existing.length === header.length &&
    existing.every((value, idx) => value === header[idx]);

  if (isSame) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [header]
    }
  });
}

async function appendRow(sheets, row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row]
    }
  });
}

exports.syncResponseToSheet = functions.firestore
  .document("responses/{responseId}")
  .onCreate(async (snap) => {
    const sheets = getSheetsClient();
    if (!sheets) return null;

    const response = snap.data() || {};
    const answers = response.answers || {};
    const createdAt = response.createdAt?.toDate?.() || new Date();

    const questionsSnap = await admin
      .firestore()
      .collection("questions")
      .orderBy("order", "asc")
      .get();

    const questions = questionsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    const header = ["Submitted", ...questions.map((question) => question.text)];
    const row = [
      createdAt.toISOString(),
      ...questions.map((question) => normalizeAnswer(answers[question.id]))
    ];

    await ensureHeader(sheets, header);
    await appendRow(sheets, row);

    return null;
  });
