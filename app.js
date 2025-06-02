// Global variables for quiz state
let currentQuizQuestions = [];
let userAnswers = [];
let currentQuestionIndex = 0;
let questionTimer = null; // Timer for each question
let currentQuizLevel = ""; // To store the difficulty level for timer settings
const TIME_LIMITS = { "Beginner": 30, "Intermediate": 45, "Advanced": 60 }; // Time limits in seconds

// Difficulty button selection logic
const difficultyButtons = document.querySelectorAll(".difficulty-btn");
difficultyButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    difficultyButtons.forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  });
});

// Event listener for the generate quiz button
document.getElementById("generate-btn").addEventListener("click", async function () {
    const topicSelect = document.getElementById("topic");
    const topic = topicSelect.options[topicSelect.selectedIndex].text;

    const numQuestionsSelect = document.getElementById("num-questions");
    const questionText = numQuestionsSelect.options[numQuestionsSelect.selectedIndex].text;
    const question_number = parseInt(questionText);

    const levelBtns = document.querySelectorAll(".difficulty-btn");
    let level = "";
    levelBtns.forEach((btn) => {
        if (btn.classList.contains("selected")) {
            level = btn.getAttribute("data-level");
        }
    });

    if (!topic || !question_number || !level) {
        alert("Please select topic, number of questions, and difficulty level.");
        return;
    }

    currentQuizLevel = level; // Store the level for timer use

    console.log("Requesting quiz with - Topic:", topic, "Num Questions:", question_number, "Level:", currentQuizLevel);

    try {
        const response = await fetch("http://localhost:8000/generate-quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic, question_number, level: currentQuizLevel }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Failed to generate quiz. Status: ${response.status}`);
        }

        const questions = await response.json();
        console.log("Quiz data received:", questions);

        if (questions && questions.length > 0) {
            document.getElementById("quiz-box").style.display = "none";
            document.getElementById("quiz-display-area").style.display = "block";
            displayQuiz(questions);
        } else {
            alert("No questions were generated for the selected criteria. Please try different options or try again.");
        }
    } catch (error) {
        console.error("Error generating quiz:", error);
        alert("Error generating quiz: " + error.message);
    }
});

function displayQuiz(questions) {
    currentQuizQuestions = questions;
    userAnswers = new Array(questions.length).fill(null);
    currentQuestionIndex = 0;

    document.getElementById("quiz-box").style.display = "none";
    const quizDisplayArea = document.getElementById("quiz-display-area");
    quizDisplayArea.style.display = "block";
    document.getElementById("results-area").style.display = "none";

    renderQuestion(currentQuestionIndex);
}

function renderQuestion(index) {
    if (questionTimer) {
        clearInterval(questionTimer); // Clear previous timer
    }

    const quizDisplayArea = document.getElementById("quiz-display-area");
    quizDisplayArea.innerHTML = "";

    if (index < 0 || index >= currentQuizQuestions.length) {
        console.error("Invalid question index:", index);
        return;
    }

    const questionData = currentQuizQuestions[index];
    const questionElement = document.createElement("div");
    questionElement.className = "question-container";

    const qNumber = document.createElement("h3");
    qNumber.textContent = `Question ${index + 1} of ${currentQuizQuestions.length}`;
    questionElement.appendChild(qNumber);

    const timerDisplay = document.createElement("div");
    timerDisplay.id = "timer-display";
    timerDisplay.className = "timer-display";
    questionElement.appendChild(timerDisplay);

    const qText = document.createElement("p");
    qText.innerHTML = questionData.question; // Use innerHTML for potential HTML entities
    questionElement.appendChild(qText);

    if (questionData.code && questionData.code.trim() !== "") {
        const qCode = document.createElement("pre");
        const codeElem = document.createElement("code");
        codeElem.textContent = questionData.code;
        qCode.appendChild(codeElem);
        questionElement.appendChild(qCode);
    }

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "options-container";
    for (const key in questionData.options) {
        const optionText = questionData.options[key];
        const radioId = `q${index}_opt${key}`;
        const radioInput = document.createElement("input");
        radioInput.type = "radio";
        radioInput.name = `question_${index}`;
        radioInput.value = key;
        radioInput.id = radioId;
        if (userAnswers[index] === key) radioInput.checked = true;
        radioInput.addEventListener("change", () => userAnswers[index] = radioInput.value);
        const label = document.createElement("label");
        label.htmlFor = radioId;
        label.textContent = ` ${key}) ${optionText}`;
        const optionDiv = document.createElement("div");
        optionDiv.appendChild(radioInput);
        optionDiv.appendChild(label);
        optionsDiv.appendChild(optionDiv);
    }
    questionElement.appendChild(optionsDiv);

    const navDiv = document.createElement("div");
    navDiv.className = "navigation-buttons";
    if (index > 0) {
        const prevBtn = document.createElement("button");
        prevBtn.textContent = "Previous";
        prevBtn.id = "prev-btn";
        prevBtn.className = "quiz-nav-btn";
        prevBtn.addEventListener("click", () => {
            currentQuestionIndex--;
            renderQuestion(currentQuestionIndex);
        });
        navDiv.appendChild(prevBtn);
    }
    if (index < currentQuizQuestions.length - 1) {
        const nextBtn = document.createElement("button");
        nextBtn.textContent = "Next";
        nextBtn.id = "next-btn";
        nextBtn.className = "quiz-nav-btn";
        nextBtn.addEventListener("click", () => {
            currentQuestionIndex++;
            renderQuestion(currentQuestionIndex);
        });
        navDiv.appendChild(nextBtn);
    } else {
        const submitBtn = document.createElement("button");
        submitBtn.textContent = "Submit Quiz";
        submitBtn.id = "submit-quiz-btn";
        submitBtn.className = "quiz-nav-btn submit";
        submitBtn.addEventListener("click", submitQuiz);
        navDiv.appendChild(submitBtn);
    }
    questionElement.appendChild(navDiv);
    quizDisplayArea.appendChild(questionElement);

    let timeLeft = TIME_LIMITS[currentQuizLevel] || 30;
    timerDisplay.textContent = `Time: ${timeLeft}s`;
    questionTimer = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = `Time: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(questionTimer);
            timerDisplay.textContent = "Time's up!";
            if (userAnswers[index] === null) {
                userAnswers[index] = "TIMEOUT";
                console.log(`Q${index + 1} marked as TIMEOUT`);
            }
            if (index < currentQuizQuestions.length - 1) {
                currentQuestionIndex++;
                renderQuestion(currentQuestionIndex);
            } else {
                submitQuiz();
            }
        }
    }, 1000);
}

async function submitQuiz() {
    if (questionTimer) {
        clearInterval(questionTimer);
    }
    console.log("Submitting quiz... Answers:", userAnswers);

    const quizDisplayArea = document.getElementById("quiz-display-area");
    const resultsArea = document.getElementById("results-area");

    quizDisplayArea.style.display = "none";
    resultsArea.innerHTML = "<h2>Submitting Quiz...</h2><p>Calculating your results, please wait.</p>";
    resultsArea.style.display = "block";

    const payload = {
        questions: currentQuizQuestions,
        user_answers: userAnswers
    };

    try {
        const response = await fetch("http://localhost:8000/submit-quiz", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Failed to submit quiz");
        }

        const resultsData = await response.json();
        console.log("Submission successful, results:", resultsData);
        displayResults(resultsData);

    } catch (error) {
        console.error("Error submitting quiz:", error);
        resultsArea.innerHTML = `<h2>Error Submitting Quiz</h2><p>${error.message}</p>`;
    }
}

function displayResults(data) {
    const resultsArea = document.getElementById("results-area");
    resultsArea.innerHTML = ""; // Clear previous content

    // Overall Score
    const scoreHeader = document.createElement("h2");
    scoreHeader.textContent = "Quiz Results";
    resultsArea.appendChild(scoreHeader);

    const scoreParagraph = document.createElement("p");
    scoreParagraph.className = "score-summary"; // For styling
    scoreParagraph.textContent = `Your Score: ${data.score} / ${data.total_questions}`;
    resultsArea.appendChild(scoreParagraph);

    // Detailed Feedback Section
    const detailsContainer = document.createElement("div");
    detailsContainer.className = "results-details-container"; // For styling

    data.results.forEach((item, index) => {
        const questionResultDiv = document.createElement("div");
        questionResultDiv.className = "question-result-item"; // For styling
        if (item.is_correct) {
            questionResultDiv.classList.add("correct-answer");
        } else {
            questionResultDiv.classList.add("incorrect-answer");
        }

        const qNum = document.createElement("h4");
        qNum.textContent = `Question ${item.question_num}:`;
        questionResultDiv.appendChild(qNum);

        const qText = document.createElement("p");
        // Use textContent for question text from results to avoid re-interpreting HTML if any
        qText.innerHTML = `<strong>Question:</strong> `;
        const qTextSpan = document.createElement("span");
        qTextSpan.textContent = item.question_text; // Displaying question text from results
        qText.appendChild(qTextSpan);
        questionResultDiv.appendChild(qText);

        // Display code snippet if present in the original question data
        // currentQuizQuestions should be available and match the order of results.
        if (currentQuizQuestions && currentQuizQuestions[index] && currentQuizQuestions[index].code && currentQuizQuestions[index].code.trim() !== "") {
            const qCode = document.createElement("pre");
            const codeElem = document.createElement("code");
            codeElem.textContent = currentQuizQuestions[index].code;
            qCode.appendChild(codeElem);
            questionResultDiv.appendChild(qCode);
        }

        const userAnswerText = document.createElement("p");
        let userAnswerDisplay = item.user_answer;
        if (item.user_answer === null) {
            userAnswerDisplay = "Not Answered";
        } else if (item.user_answer === "TIMEOUT") {
            userAnswerDisplay = "Time's Up!";
        }
        userAnswerText.innerHTML = `<strong>Your Answer:</strong> ${userAnswerDisplay}`;
        questionResultDiv.appendChild(userAnswerText);

        if (!item.is_correct) {
            const correctAnswerText = document.createElement("p");
            correctAnswerText.innerHTML = `<strong>Correct Answer:</strong> ${item.correct_answer}`;
            questionResultDiv.appendChild(correctAnswerText);
        }

        const explanationText = document.createElement("p");
        explanationText.innerHTML = `<strong>Explanation:</strong> ${item.explanation}`; // Using innerHTML for explanation as it might contain formatting
        questionResultDiv.appendChild(explanationText);

        detailsContainer.appendChild(questionResultDiv);
    });

    resultsArea.appendChild(detailsContainer);

    // "Take Another Quiz" Button
    const restartButton = document.createElement("button");
    restartButton.id = "restart-quiz-btn";
    restartButton.className = "quiz-nav-btn"; // Added class for styling
    restartButton.textContent = "Take Another Quiz";
    restartButton.addEventListener("click", () => {
        currentQuizQuestions = [];
        userAnswers = [];
        currentQuestionIndex = 0;
        currentQuizLevel = "";
        if(questionTimer) clearInterval(questionTimer);

        document.getElementById("results-area").style.display = "none";
        const quizDisplayArea = document.getElementById("quiz-display-area");
        if (quizDisplayArea) {
            quizDisplayArea.innerHTML = "";
            quizDisplayArea.style.display = "none";
        }
        document.getElementById("quiz-box").style.display = "block";

        // Optional: Reset form fields in quiz-box
        // document.getElementById("topic").selectedIndex = 0;
        // document.getElementById("num-questions").selectedIndex = 0;
        // const difficultyButtons = document.querySelectorAll(".difficulty-btn");
        // difficultyButtons.forEach(btn => btn.classList.remove("selected"));
    });
    resultsArea.appendChild(restartButton);

    console.log("Detailed results displayed:", data);
}
