import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { db, isConfigValid } from "./firebase.js";
import { clearChildren, createEl } from "./utils.js";

const form = document.getElementById("survey-form");
const questionsContainer = document.getElementById("questions-container");
const successEl = document.getElementById("form-success");
const errorEl = document.getElementById("form-error");
const configErrorEl = document.getElementById("config-error");
const surveyCard = document.getElementById("survey-card");
const surveyThanks = document.getElementById("survey-thanks");
const openReportBtn = document.getElementById("open-report");
const reportOverlay = document.getElementById("report-overlay");
const closeReportBtn = document.getElementById("close-report");
const reportForm = document.getElementById("report-form");
const reportSuccess = document.getElementById("report-success");
const reportError = document.getElementById("report-error");
const reportOtherWrapper = document.getElementById("report-other-wrapper");
const reportOtherInput = document.getElementById("report-other");
const reportDescriptionInput = document.getElementById("report-description");
const reportToast = document.getElementById("report-toast");

const REPORT_TOAST_MESSAGE =
  "Your report has been saved and will be reviewed after verification.";

let currentQuestions = [];
let hasSubmittedSurvey = false;
try {
  hasSubmittedSurvey = localStorage.getItem("surveySubmitted") === "true";
} catch (err) {
  hasSubmittedSurvey = false;
}

if (!isConfigValid) {
  configErrorEl.textContent =
    "Firebase configuration is missing. Update config.js with your project settings.";
  configErrorEl.classList.remove("hidden");
  form.querySelector("button").disabled = true;
} else {
  if (hasSubmittedSurvey) {
    showSurveyThankYou();
  } else {
    subscribeToQuestions();
  }
}

if (openReportBtn && reportOverlay) {
  openReportBtn.addEventListener("click", () => {
    reportOverlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  });
}

if (closeReportBtn && reportOverlay) {
  closeReportBtn.addEventListener("click", () => {
    closeReportOverlay();
  });
}

if (reportOverlay) {
  reportOverlay.addEventListener("click", (event) => {
    if (event.target === reportOverlay) {
      closeReportOverlay();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && reportOverlay && !reportOverlay.classList.contains("hidden")) {
    closeReportOverlay();
  }
});

function subscribeToQuestions() {
  const questionsRef = collection(db, "questions");
  const questionsQuery = query(questionsRef, orderBy("order", "asc"));
  onSnapshot(questionsQuery, (snapshot) => {
    currentQuestions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    renderQuestions();
  });
}

function renderQuestions() {
  if (hasSubmittedSurvey) {
    return;
  }
  clearChildren(questionsContainer);
  successEl.classList.add("hidden");
  errorEl.classList.add("hidden");

  if (!currentQuestions.length) {
    const emptyState = createEl(
      "p",
      "muted",
      "No questions are available yet. Please check back soon."
    );
    questionsContainer.appendChild(emptyState);
    return;
  }

  currentQuestions.forEach((question, index) => {
    const fieldWrapper = createEl("div", "field");
    fieldWrapper.dataset.questionId = question.id;
    fieldWrapper.dataset.type = question.type;
    fieldWrapper.dataset.required = question.required ? "true" : "false";

    const label = createEl(
      "label",
      null,
      `${index + 1}. ${question.text}${question.required ? " *" : ""}`
    );
    fieldWrapper.appendChild(label);

    if (question.type === "short_text") {
      const input = createEl("input");
      input.type = "text";
      input.name = question.id;
      input.placeholder = "Your response";
      if (question.required) input.required = true;
      fieldWrapper.appendChild(input);
    }

    if (question.type === "single_choice") {
      fieldWrapper.appendChild(
        buildOptions(question, "radio-group", "radio")
      );
    }

    if (question.type === "dropdown") {
      const select = createEl("select");
      select.name = question.id;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select an option";
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);
      (Array.isArray(question.options) ? question.options : []).forEach(
        (option) => {
          const opt = document.createElement("option");
          opt.value = option;
          opt.textContent = option;
          select.appendChild(opt);
        }
      );
      if (question.required) select.required = true;
      fieldWrapper.appendChild(select);
    }

    if (question.type === "multi_choice") {
      fieldWrapper.appendChild(
        buildOptions(question, "checkbox-group", "checkbox")
      );
    }

    if (question.type === "yes_no") {
      fieldWrapper.appendChild(
        buildOptionList(question, ["Yes", "No"], "radio-group", "radio")
      );
    }

    if (question.type === "scale_1_5") {
      fieldWrapper.appendChild(
        buildOptionList(
          question,
          ["1", "2", "3", "4", "5"],
          "radio-group",
          "radio",
          true
        )
      );
    }

    const error = createEl("div", "error hidden");
    error.id = `error-${question.id}`;
    fieldWrapper.appendChild(error);

    questionsContainer.appendChild(fieldWrapper);
  });
}

function buildOptions(question, groupClass, inputType) {
  const options = Array.isArray(question.options) ? question.options : [];
  return buildOptionList(question, options, groupClass, inputType);
}

function buildOptionList(
  question,
  options,
  groupClass,
  inputType,
  isScale
) {
  const wrapper = createEl("div", groupClass);
  if (isScale) {
    wrapper.classList.add("scale-row");
  }

  options.forEach((option, idx) => {
    const optionId = `${question.id}-${idx}`;
    const label = createEl(
      "label",
      inputType === "checkbox" ? "checkbox-option" : "radio-option"
    );
    const input = document.createElement("input");
    input.type = inputType;
    input.name = question.id;
    input.value = option;
    input.id = optionId;
    label.appendChild(input);

    if (isScale) {
      const pill = createEl("span", "scale-pill", option);
      label.appendChild(pill);
    } else {
      const text = createEl("span", null, option);
      label.appendChild(text);
    }

    wrapper.appendChild(label);
  });

  return wrapper;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentQuestions.length) return;

  successEl.classList.add("hidden");
  errorEl.classList.add("hidden");

  const answers = {};
  let hasError = false;

  currentQuestions.forEach((question) => {
    const field = document.querySelector(
      `[data-question-id="${question.id}"]`
    );
    if (!field) return;

    const value = getFieldValue(question, field);
    const error = document.getElementById(`error-${question.id}`);

    const isEmpty = Array.isArray(value)
      ? value.length === 0
      : value === "" || value === null || value === undefined;

    if (question.required && isEmpty) {
      hasError = true;
      if (error) {
        error.textContent = "This field is required.";
        error.classList.remove("hidden");
      }
    } else if (error) {
      error.textContent = "";
      error.classList.add("hidden");
    }

    if (!isEmpty) {
      answers[question.id] = value;
    }
  });

  if (hasError) {
    errorEl.textContent = "Please complete all required fields.";
    errorEl.classList.remove("hidden");
    return;
  }

  const submitButton = form.querySelector("button");
  submitButton.disabled = true;

  try {
    await addDoc(collection(db, "responses"), {
      createdAt: serverTimestamp(),
      answers
    });
    form.reset();
    try {
      localStorage.setItem("surveySubmitted", "true");
      hasSubmittedSurvey = true;
    } catch (err) {
      hasSubmittedSurvey = true;
    }
    showSurveyThankYou();
  } catch (err) {
    errorEl.textContent = "Submission failed. Please try again.";
    errorEl.classList.remove("hidden");
  } finally {
    submitButton.disabled = false;
  }
});

if (reportForm) {
  reportForm.addEventListener("change", (event) => {
    if (event.target && event.target.name === "report-reason") {
      updateReportOther();
    }
  });

  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    reportSuccess.classList.add("hidden");
    reportError.classList.add("hidden");

    const name = document.getElementById("report-name").value.trim();
    const email = document.getElementById("report-email").value.trim();
    const reason = getSelectedReason();
    const description = reportDescriptionInput.value.trim();
    const otherReason = reportOtherInput.value.trim();

    if (!name || !email || !reason || !description) {
      reportError.textContent = "Please complete all required fields.";
      reportError.classList.remove("hidden");
      return;
    }

    if (reason === "Other" && !otherReason) {
      reportError.textContent = "Please describe the other reason.";
      reportError.classList.remove("hidden");
      return;
    }

    const submitBtn = reportForm.querySelector("button");
    submitBtn.disabled = true;

    try {
      await addDoc(collection(db, "reports"), {
        createdAt: serverTimestamp(),
        name,
        email,
        reason,
        description,
        otherReason: reason === "Other" ? otherReason : ""
      });
      reportForm.reset();
      updateReportOther();
      closeReportOverlay();
      showToast(REPORT_TOAST_MESSAGE);
    } catch (err) {
      reportError.textContent = "Failed to submit report. Please try again.";
      reportError.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
    }
  });

  updateReportOther();
}

function updateReportOther() {
  if (!reportOtherWrapper) return;
  const reason = getSelectedReason();
  if (reason === "Other") {
    reportOtherWrapper.classList.remove("hidden");
    reportOtherInput.required = true;
  } else {
    reportOtherWrapper.classList.add("hidden");
    reportOtherInput.required = false;
    reportOtherInput.value = "";
  }
}

function getSelectedReason() {
  const checked = document.querySelector(
    "input[name=\"report-reason\"]:checked"
  );
  return checked ? checked.value : "";
}

function closeReportOverlay() {
  reportOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  reportSuccess.classList.add("hidden");
  reportError.classList.add("hidden");
}

function showToast(message) {
  if (!reportToast) return;
  reportToast.textContent = message;
  reportToast.classList.remove("hidden");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    reportToast.classList.add("hidden");
  }, 4000);
}

function showSurveyThankYou() {
  if (surveyCard) {
    surveyCard.classList.add("hidden");
  }
  if (surveyThanks) {
    surveyThanks.classList.remove("hidden");
  } else {
    successEl.classList.remove("hidden");
  }
}

function getFieldValue(question, field) {
  if (question.type === "short_text") {
    const input = field.querySelector("input");
    return input ? input.value.trim() : "";
  }

  if (
    question.type === "single_choice" ||
    question.type === "yes_no" ||
    question.type === "scale_1_5"
  ) {
    const checked = field.querySelector("input[type=radio]:checked");
    if (!checked) return "";
    if (question.type === "scale_1_5") {
      return Number(checked.value);
    }
    return checked.value;
  }

  if (question.type === "dropdown") {
    const select = field.querySelector("select");
    return select ? select.value : "";
  }

  if (question.type === "multi_choice") {
    const checked = Array.from(
      field.querySelectorAll("input[type=checkbox]:checked")
    ).map((input) => input.value);
    return checked;
  }

  return "";
}
