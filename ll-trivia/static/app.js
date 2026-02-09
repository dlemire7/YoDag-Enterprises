// ── Flashcard Study App ─────────────────────────────────────────────────────

let questions = [];
let currentIndex = 0;
let isFlipped = false;

const flashcard = document.getElementById("flashcard");
const card = document.getElementById("card");
const cardControls = document.getElementById("card-controls");
const emptyMsg = document.getElementById("empty-msg");
const sessionInfo = document.getElementById("session-info");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const cardMeta = document.getElementById("card-meta");
const cardMetaBack = document.getElementById("card-meta-back");
const cardQuestion = document.getElementById("card-question");
const cardAnswer = document.getElementById("card-answer");
const cardPct = document.getElementById("card-pct");

// ── Load questions ──────────────────────────────────────────────────────────

document.getElementById("load-btn").addEventListener("click", loadQuestions);

async function loadQuestions() {
    const category = document.getElementById("category-filter").value;
    const difficulty = document.getElementById("difficulty-filter").value;
    const mode = document.getElementById("mode-filter").value;

    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (difficulty) params.set("difficulty", difficulty);
    if (mode) params.set("mode", mode);

    try {
        const resp = await fetch("/api/questions?" + params.toString());
        questions = await resp.json();
        currentIndex = 0;

        if (questions.length === 0) {
            flashcard.style.display = "none";
            cardControls.style.display = "none";
            sessionInfo.style.display = "none";
            emptyMsg.style.display = "";
            emptyMsg.querySelector("p").textContent =
                "No questions match your filters. Try different settings.";
            return;
        }

        emptyMsg.style.display = "none";
        flashcard.style.display = "";
        sessionInfo.style.display = "";
        showCard();
    } catch (err) {
        console.error("Failed to load questions:", err);
    }
}

// ── Apply URL params on page load ───────────────────────────────────────────

(function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category");
    if (cat) {
        const sel = document.getElementById("category-filter");
        for (const opt of sel.options) {
            if (opt.value === cat) { sel.value = cat; break; }
        }
    }
})();

// ── Card display ────────────────────────────────────────────────────────────

function showCard() {
    if (currentIndex >= questions.length) {
        finishSession();
        return;
    }

    const q = questions[currentIndex];
    const meta = `${q.season} MD${q.match_day} Q${q.question_number}  |  ${q.category}`;
    cardMeta.textContent = meta;
    cardMetaBack.textContent = meta;
    cardQuestion.textContent = q.question_text;
    cardAnswer.textContent = q.answer;

    if (q.percent_correct != null) {
        cardPct.textContent = `${q.percent_correct}% of players got this right`;
    } else {
        cardPct.textContent = "";
    }

    // Reset flip state and learn more
    isFlipped = false;
    card.classList.remove("flipped");
    cardControls.style.display = "none";
    document.getElementById("learn-more-btn").style.display = "";
    document.getElementById("learn-more-btn").disabled = false;
    document.getElementById("learn-more-btn").textContent = "Learn More";
    document.getElementById("learn-more-content").style.display = "none";
    document.getElementById("learn-more-content").textContent = "";

    updateProgress();
}

function flipCard() {
    if (questions.length === 0) return;
    isFlipped = !isFlipped;
    card.classList.toggle("flipped");

    if (isFlipped) {
        cardControls.style.display = "";
    } else {
        cardControls.style.display = "none";
    }
}

function updateProgress() {
    const total = questions.length;
    const done = currentIndex;
    const pct = total > 0 ? (done / total) * 100 : 0;
    progressBar.style.width = pct + "%";
    progressText.textContent = `${done} / ${total}`;
}

function finishSession() {
    flashcard.style.display = "none";
    cardControls.style.display = "none";
    progressBar.style.width = "100%";
    progressText.textContent = `${questions.length} / ${questions.length}`;

    emptyMsg.style.display = "";
    emptyMsg.querySelector("p").textContent =
        "Session complete! Load more questions or take a break.";
}

// ── Rating ──────────────────────────────────────────────────────────────────

async function rateCard(confidence, correct) {
    const q = questions[currentIndex];

    try {
        await fetch("/api/progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question_id: q.id,
                correct: correct,
                confidence: confidence,
            }),
        });
    } catch (err) {
        console.error("Failed to save progress:", err);
    }

    currentIndex++;
    showCard();
}

function skipCard() {
    currentIndex++;
    showCard();
}

// ── Learn More ─────────────────────────────────────────────────────────────

async function learnMore() {
    const q = questions[currentIndex];
    const btn = document.getElementById("learn-more-btn");
    const content = document.getElementById("learn-more-content");

    btn.disabled = true;
    btn.textContent = "Loading...";
    content.style.display = "none";

    try {
        const resp = await fetch("/api/learn-more", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question_text: q.question_text,
                answer: q.answer,
                category: q.category,
            }),
        });
        const data = await resp.json();

        if (data.error) {
            content.textContent = "Error: " + data.error;
        } else {
            content.textContent = data.explanation;
        }
        content.style.display = "";
        btn.style.display = "none";
    } catch (err) {
        content.textContent = "Failed to load explanation.";
        content.style.display = "";
        btn.disabled = false;
        btn.textContent = "Retry";
    }
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
    // Don't capture when typing in inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

    switch (e.code) {
        case "Space":
            e.preventDefault();
            flipCard();
            break;
        case "Digit1":
        case "Numpad1":
            if (isFlipped) rateCard(1, false);
            break;
        case "Digit2":
        case "Numpad2":
            if (isFlipped) rateCard(2, true);
            break;
        case "Digit3":
        case "Numpad3":
            if (isFlipped) rateCard(3, true);
            break;
        case "KeyS":
            if (isFlipped) skipCard();
            break;
        case "ArrowRight":
            if (isFlipped) skipCard();
            break;
    }
});

// ── Click to flip ───────────────────────────────────────────────────────────

if (flashcard) {
    flashcard.addEventListener("click", (e) => {
        // Don't flip when clicking buttons
        if (e.target.closest(".card-controls") || e.target.closest("button") || e.target.closest(".learn-more-content")) return;
        flipCard();
    });
}
