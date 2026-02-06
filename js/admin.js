import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { db, auth, adminEmails, isConfigValid } from "./firebase.js";
import {
  clearChildren,
  createEl,
  formatTimestamp,
  normalizeAnswer,
  toSafeArray
} from "./utils.js";

const configErrorEl = document.getElementById("config-error");
const authSection = document.getElementById("auth-section");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const questionForm = document.getElementById("question-form");
const questionError = document.getElementById("question-error");
const questionList = document.getElementById("question-list");
const questionSubmitBtn = document.getElementById("question-submit");
const cancelEditBtn = document.getElementById("cancel-edit");
const editIndicator = document.getElementById("edit-indicator");
const questionTypeSelect = document.getElementById("question-type");
const questionOptionsInput = document.getElementById("question-options");
const responsesTable = document.getElementById("responses-table");
const reportsTable = document.getElementById("reports-table");
const reportsCountEl = document.getElementById("reports-count");
const totalResponsesEl = document.getElementById("total-responses");
const totalQuestionsEl = document.getElementById("total-questions");
const chartsContainer = document.getElementById("charts-container");
const downloadCsvBtn = document.getElementById("download-csv");

const state = {
  questions: [],
  responses: [],
  reports: [],
  charts: new Map(),
  listening: false,
  editingQuestionId: null
};

if (!isConfigValid) {
  configErrorEl.textContent =
    "Firebase configuration is missing. Update config.js with your project settings.";
  configErrorEl.classList.remove("hidden");
  authSection.classList.add("hidden");
} else {
  initAuth();
}

function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showLogin();
      return;
    }

    if (!isAdminUser(user.email)) {
      await signOut(auth);
      showLogin("Access denied. This account is not an admin.");
      return;
    }

    showDashboard();
    await seedDefaultQuestions();
    startListeners();
  });
}

function isAdminUser(email) {
  if (!email) return false;
  if (!adminEmails.length) return true;
  return adminEmails.includes(email);
}

function showLogin(message) {
  authSection.classList.remove("hidden");
  dashboard.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  if (message) {
    loginError.textContent = message;
    loginError.classList.remove("hidden");
  }
}

function showDashboard() {
  authSection.classList.add("hidden");
  dashboard.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  loginError.classList.add("hidden");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.classList.add("hidden");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = "Sign-in failed. Please check your credentials.";
    loginError.classList.remove("hidden");
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

questionTypeSelect.addEventListener("change", () => {
  updateOptionsFieldState(questionTypeSelect.value);
});

updateOptionsFieldState(questionTypeSelect.value);

cancelEditBtn.addEventListener("click", () => {
  clearEditMode();
});

downloadCsvBtn.addEventListener("click", () => {
  if (!state.questions.length) {
    alert("No questions available to export.");
    return;
  }

  const csv = buildCsv(state.questions, state.responses);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `survey-responses-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

async function seedDefaultQuestions() {
  const questionsRef = collection(db, "questions");
  const snapshot = await getDocs(questionsRef);
  if (!snapshot.empty) return;

  const defaults = getDefaultQuestions();
  const batch = writeBatch(db);

  defaults.forEach((question) => {
    const docRef = doc(questionsRef);
    batch.set(docRef, {
      ...question,
      createdAt: serverTimestamp()
    });
  });

  await batch.commit();
}

function startListeners() {
  if (state.listening) return;
  state.listening = true;

  const questionsQuery = query(
    collection(db, "questions"),
    orderBy("order", "asc")
  );
  const responsesQuery = query(
    collection(db, "responses"),
    orderBy("createdAt", "desc")
  );
  const reportsQuery = query(
    collection(db, "reports"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(questionsQuery, (snapshot) => {
    state.questions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    renderQuestions();
    renderResponses();
    renderCharts();
  });

  onSnapshot(responsesQuery, (snapshot) => {
    state.responses = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    renderResponses();
    renderCharts();
  });

  onSnapshot(reportsQuery, (snapshot) => {
    state.reports = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    renderReports();
  });
}

function renderQuestions() {
  totalQuestionsEl.textContent = state.questions.length.toString();
  clearChildren(questionList);

  if (!state.questions.length) {
    questionList.appendChild(createEl("p", "muted", "No questions yet."));
    return;
  }

  state.questions.forEach((question, index) => {
    const item = createEl("div", "question-item");
    const meta = createEl("div", "question-meta");
    meta.appendChild(createEl("strong", null, question.text));
    meta.appendChild(
      createEl(
        "span",
        "badge",
        `${getTypeLabel(question.type)}${question.required ? " · required" : ""}`
      )
    );

    const actions = createEl("div", "question-actions");

    const moveUpBtn = createEl("button", "ghost", "Up");
    moveUpBtn.type = "button";
    moveUpBtn.disabled = index === 0;
    moveUpBtn.addEventListener("click", () => {
      moveQuestion(index, -1);
    });

    const moveDownBtn = createEl("button", "ghost", "Down");
    moveDownBtn.type = "button";
    moveDownBtn.disabled = index === state.questions.length - 1;
    moveDownBtn.addEventListener("click", () => {
      moveQuestion(index, 1);
    });

    const editBtn = createEl("button", "ghost", "Edit");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => {
      setEditMode(question);
    });

    const deleteBtn = createEl("button", "ghost", "Delete");
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Delete this question?")) return;
      await deleteDoc(doc(db, "questions", question.id));
      if (state.editingQuestionId === question.id) {
        clearEditMode();
      }
    });

    actions.appendChild(moveUpBtn);
    actions.appendChild(moveDownBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(meta);
    item.appendChild(actions);
    questionList.appendChild(item);
  });
}

async function moveQuestion(index, delta) {
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= state.questions.length) return;

  const current = state.questions[index];
  const target = state.questions[targetIndex];

  const currentOrder = Number.isFinite(Number(current.order))
    ? Number(current.order)
    : index + 1;
  const targetOrder = Number.isFinite(Number(target.order))
    ? Number(target.order)
    : targetIndex + 1;

  const batch = writeBatch(db);
  batch.update(doc(db, "questions", current.id), { order: targetOrder });
  batch.update(doc(db, "questions", target.id), { order: currentOrder });

  try {
    await batch.commit();
  } catch (err) {
    alert("Failed to reorder questions. Please try again.");
  }
}

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  questionError.classList.add("hidden");

  const text = document.getElementById("question-text").value.trim();
  const type = document.getElementById("question-type").value;
  const optionsRaw = document.getElementById("question-options").value.trim();
  const required = document.getElementById("question-required").checked;

  if (!text) {
    questionError.textContent = "Question text is required.";
    questionError.classList.remove("hidden");
    return;
  }

  const needsOptions =
    type === "single_choice" || type === "multi_choice" || type === "dropdown";
  const options = needsOptions
    ? optionsRaw.split("\n").map((opt) => opt.trim()).filter(Boolean)
    : [];

  if (needsOptions && !options.length) {
    questionError.textContent = "Please provide at least one option.";
    questionError.classList.remove("hidden");
    return;
  }

  const maxOrder = state.questions.reduce(
    (max, q) => Math.max(max, Number(q.order) || 0),
    0
  );

  try {
    if (state.editingQuestionId) {
      const existing = state.questions.find(
        (question) => question.id === state.editingQuestionId
      );
      await updateDoc(doc(db, "questions", state.editingQuestionId), {
        text,
        type,
        options,
        required,
        order: existing ? existing.order : maxOrder + 1,
        updatedAt: serverTimestamp()
      });
      clearEditMode();
    } else {
      await addDoc(collection(db, "questions"), {
        text,
        type,
        options,
        required,
        order: maxOrder + 1,
        createdAt: serverTimestamp()
      });
      questionForm.reset();
      document.getElementById("question-required").checked = true;
      updateOptionsFieldState(type);
    }
  } catch (err) {
    questionError.textContent = "Failed to save question.";
    questionError.classList.remove("hidden");
  }
});

function renderResponses() {
  totalResponsesEl.textContent = state.responses.length.toString();

  const thead = responsesTable.querySelector("thead");
  const tbody = responsesTable.querySelector("tbody");
  clearChildren(thead);
  clearChildren(tbody);

  if (!state.questions.length) {
    return;
  }

  const headerRow = document.createElement("tr");
  headerRow.appendChild(createEl("th", null, "#"));
  headerRow.appendChild(createEl("th", null, "Submitted"));
  state.questions.forEach((question) => {
    headerRow.appendChild(createEl("th", null, question.text));
  });
  thead.appendChild(headerRow);

  state.responses.forEach((response, index) => {
    const row = document.createElement("tr");
    row.appendChild(createEl("td", null, (index + 1).toString()));
    row.appendChild(createEl("td", null, formatTimestamp(response.createdAt)));

    state.questions.forEach((question) => {
      const answer = response.answers ? response.answers[question.id] : "";
      row.appendChild(createEl("td", null, normalizeAnswer(answer) || "-"));
    });

    tbody.appendChild(row);
  });
}

function renderReports() {
  if (!reportsTable) return;
  const thead = reportsTable.querySelector("thead");
  const tbody = reportsTable.querySelector("tbody");
  clearChildren(thead);
  clearChildren(tbody);

  const total = state.reports.length;
  if (reportsCountEl) {
    reportsCountEl.textContent = `${total} report${total === 1 ? "" : "s"}`;
  }

  const headerRow = document.createElement("tr");
  headerRow.appendChild(createEl("th", null, "#"));
  headerRow.appendChild(createEl("th", null, "Submitted"));
  headerRow.appendChild(createEl("th", null, "Name"));
  headerRow.appendChild(createEl("th", null, "Gmail"));
  headerRow.appendChild(createEl("th", null, "Reason"));
  headerRow.appendChild(createEl("th", null, "Description"));
  headerRow.appendChild(createEl("th", null, "Other Details"));
  thead.appendChild(headerRow);

  if (!total) {
    const row = document.createElement("tr");
    const cell = createEl("td", "muted", "No reports yet.");
    cell.colSpan = 7;
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  state.reports.forEach((report, index) => {
    const row = document.createElement("tr");
    row.appendChild(createEl("td", null, (index + 1).toString()));
    row.appendChild(createEl("td", null, formatTimestamp(report.createdAt)));
    row.appendChild(createEl("td", null, report.name || "-"));
    row.appendChild(createEl("td", null, report.email || "-"));
    row.appendChild(createEl("td", null, report.reason || "-"));
    row.appendChild(createEl("td", null, report.description || "-"));
    row.appendChild(createEl("td", null, report.otherReason || "-"));
    tbody.appendChild(row);
  });
}

function renderCharts() {
  clearChildren(chartsContainer);
  state.charts.forEach((chart) => chart.destroy());
  state.charts.clear();

  if (!state.questions.length) {
    chartsContainer.appendChild(
      createEl("p", "muted", "No charts available yet.")
    );
    return;
  }

  state.questions.forEach((question) => {
    const card = createEl("div", "chart-card");
    card.appendChild(createEl("div", "chart-title", question.text));

    if (!state.responses.length) {
      card.appendChild(createEl("p", "muted", "No responses yet."));
      chartsContainer.appendChild(card);
      return;
    }

    const canvas = document.createElement("canvas");
    card.appendChild(canvas);
    chartsContainer.appendChild(card);

    const { labels, data } = buildChartData(question, state.responses);

    const chartType = getChartType(question, labels);
    const chart = new Chart(canvas.getContext("2d"), {
      type: chartType,
      data: {
        labels,
        datasets: [
          {
            label: "Responses",
            data,
            backgroundColor: getColorPalette(labels.length)
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: chartType === "pie"
          }
        },
        scales: chartType === "pie" ? {} : {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        }
      }
    });

    state.charts.set(question.id, chart);
  });
}

function setEditMode(question) {
  state.editingQuestionId = question.id;
  document.getElementById("question-text").value = question.text;
  document.getElementById("question-type").value = question.type;
  document.getElementById("question-required").checked = Boolean(
    question.required
  );
  questionOptionsInput.value = toSafeArray(question.options).join("\n");
  updateOptionsFieldState(question.type);

  editIndicator.textContent = `Editing question: ${question.text}`;
  editIndicator.classList.remove("hidden");
  cancelEditBtn.classList.remove("hidden");
  questionSubmitBtn.textContent = "Update question";
}

function clearEditMode() {
  state.editingQuestionId = null;
  questionForm.reset();
  document.getElementById("question-required").checked = true;
  editIndicator.classList.add("hidden");
  cancelEditBtn.classList.add("hidden");
  questionSubmitBtn.textContent = "Add question";
  updateOptionsFieldState(questionTypeSelect.value);
}

function updateOptionsFieldState(type) {
  const needsOptions =
    type === "single_choice" || type === "multi_choice" || type === "dropdown";
  questionOptionsInput.disabled = !needsOptions;
  if (!needsOptions) {
    questionOptionsInput.value = "";
    questionOptionsInput.placeholder = "Not required for this question type";
  } else {
    questionOptionsInput.placeholder = "Only for choice questions";
  }
}

function buildChartData(question, responses) {
  const counts = new Map();
  const values = [];

  responses.forEach((response) => {
    const answer = response.answers ? response.answers[question.id] : undefined;
    if (answer === undefined || answer === null || answer === "") return;

    if (question.type === "multi_choice") {
      toSafeArray(answer).forEach((item) => values.push(item));
    } else if (question.type === "scale_1_5") {
      values.push(String(answer));
    } else {
      values.push(answer.toString());
    }
  });

  if (question.type === "yes_no") {
    ["Yes", "No"].forEach((label) => counts.set(label, 0));
  }

  if (question.type === "scale_1_5") {
    ["1", "2", "3", "4", "5"].forEach((label) => counts.set(label, 0));
  }

  if (
    question.type === "single_choice" ||
    question.type === "multi_choice" ||
    question.type === "dropdown"
  ) {
    toSafeArray(question.options).forEach((label) => counts.set(label, 0));
  }

  if (question.type === "short_text") {
    const normalized = values.map((value) => value.trim()).filter(Boolean);
    normalized.forEach((value) => {
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return compressCounts(counts, 5);
  }

  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  const labels = Array.from(counts.keys());
  const data = labels.map((label) => counts.get(label) || 0);
  return { labels, data };
}

function buildCsv(questions, responses) {
  const headers = ["Submitted", ...questions.map((q) => q.text)];
  const rows = responses.map((response) => {
    const timestamp = formatTimestamp(response.createdAt);
    const answers = questions.map((question) => {
      const value = response.answers ? response.answers[question.id] : "";
      return normalizeAnswer(value);
    });
    return [timestamp, ...answers];
  });

  return [headers, ...rows]
    .map((row) => row.map((value) => toCsvValue(value)).join(","))
    .join("\n");
}

function toCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function compressCounts(counts, maxItems) {
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, maxItems);
  const remainder = sorted.slice(maxItems);
  const labels = top.map((item) => item[0]);
  const data = top.map((item) => item[1]);

  if (remainder.length) {
    const otherTotal = remainder.reduce((sum, item) => sum + item[1], 0);
    labels.push("Other");
    data.push(otherTotal);
  }

  if (!labels.length) {
    labels.push("No responses");
    data.push(0);
  }

  return { labels, data };
}

function getChartType(question, labels) {
  if (question.type === "yes_no") return "pie";
  if (
    (question.type === "single_choice" || question.type === "dropdown") &&
    labels.length <= 5
  )
    return "pie";
  return "bar";
}

function getColorPalette(count) {
  const palette = [
    "#2563eb",
    "#38bdf8",
    "#14b8a6",
    "#f59e0b",
    "#ef4444",
    "#a855f7",
    "#22c55e",
    "#f97316",
    "#64748b"
  ];
  return Array.from({ length: count }, (_, idx) => palette[idx % palette.length]);
}

function getTypeLabel(type) {
  switch (type) {
    case "short_text":
      return "Short text";
    case "single_choice":
      return "Single choice";
    case "dropdown":
      return "Dropdown";
    case "multi_choice":
      return "Multi select";
    case "yes_no":
      return "Yes/No";
    case "scale_1_5":
      return "Scale 1-5";
    default:
      return "Custom";
  }
}

function getDefaultQuestions() {
  return [
    {
      text: "Name",
      type: "short_text",
      required: true,
      options: [],
      order: 1
    },
    {
      text: "Institution Name",
      type: "short_text",
      required: true,
      options: [],
      order: 2
    },
    {
      text: "Year of Study",
      type: "single_choice",
      required: true,
      options: [
        "1st year",
        "2nd year",
        "3rd year",
        "4th year",
        "Graduate",
        "Other"
      ],
      order: 3
    },
    {
      text: "Primary Field of Interest",
      type: "single_choice",
      required: true,
      options: [
        "AI/ML",
        "Web Development",
        "Mobile Development",
        "Cybersecurity",
        "Data Science",
        "Cloud/DevOps",
        "IoT/Hardware",
        "Game Development",
        "Other"
      ],
      order: 4
    },
    {
      text: "Have you attended any Hackathons?",
      type: "yes_no",
      required: true,
      options: ["Yes", "No"],
      order: 5
    },
    {
      text: "Problems faced related to hackathon selection",
      type: "short_text",
      required: false,
      options: [],
      order: 6
    },
    {
      text: "Biggest challenge when showcasing projects",
      type: "single_choice",
      required: true,
      options: [
        "Visibility",
        "Feedback quality",
        "Judging criteria",
        "Time to present",
        "Team coordination",
        "Other"
      ],
      order: 7
    },
    {
      text: "Where do you usually search for opportunities?",
      type: "single_choice",
      required: true,
      options: [
        "University notices",
        "Online communities",
        "Social media",
        "Event platforms",
        "Friends/peers",
        "Other"
      ],
      order: 8
    },
    {
      text: "Where do you show your projects now?",
      type: "single_choice",
      required: true,
      options: [
        "GitHub",
        "Personal website",
        "Devpost",
        "LinkedIn",
        "Not currently showcasing",
        "Other"
      ],
      order: 9
    },
    {
      text: "Interest in project-based evaluation platform",
      type: "single_choice",
      required: true,
      options: [
        "Very interested",
        "Interested",
        "Neutral",
        "Not interested",
        "Not sure"
      ],
      order: 10
    },
    {
      text: "Expected useful features",
      type: "multi_choice",
      required: true,
      options: [
        "One-link profile",
        "Project analytics",
        "Peer feedback",
        "Mentor reviews",
        "Hiring visibility",
        "Team matching",
        "Event recommendations",
        "Portfolio templates",
        "Other"
      ],
      order: 11
    },
    {
      text: "Usefulness of one-link project profile",
      type: "scale_1_5",
      required: true,
      options: [],
      order: 12
    }
  ];
}
