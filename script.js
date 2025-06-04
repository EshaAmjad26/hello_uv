document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const topicInput = document.getElementById('topic');
    const numQuestionsInput = document.getElementById('num-questions');
    const levelSelect = document.getElementById('level');
    const startQuizBtn = document.getElementById('start-quiz-btn');
    const quizSetupDiv = document.querySelector('.quiz-setup');
    const quizContainer = document.getElementById('quiz-container');
    const resultsContainer = document.getElementById('results-container');

    // Quiz State
    let currentQuestionIndex = 0;
    let questions = [];
    let userAnswers = [];
    let quizTopic = '';
    let quizNumQuestions = 0;
    let quizLevel = '';

    // Timer State
    let questionTimerInterval = null;
    let currentQuizTimeLimit = 30; // Default time limit, will be updated from backend

    startQuizBtn.addEventListener('click', async () => {
        quizTopic = topicInput.value.trim();
        quizNumQuestions = parseInt(numQuestionsInput.value, 10);
        quizLevel = levelSelect.value;

        if (!quizTopic) {
            alert('Please enter a quiz topic.');
            topicInput.focus();
            return;
        }
        if (isNaN(quizNumQuestions) || quizNumQuestions <= 0) {
            alert('Please enter a valid number of questions.');
            numQuestionsInput.focus();
            return;
        }

        const quizRequestData = {
            topic: quizTopic,
            question_number: quizNumQuestions,
            level: quizLevel
        };

        quizContainer.innerHTML = '<p>Loading questions...</p>';
        resultsContainer.innerHTML = '';
        quizSetupDiv.style.display = 'none';
        quizContainer.style.display = 'block';
        if (questionTimerInterval) clearInterval(questionTimerInterval);

        try {
            const response = await fetch('/generate-quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quizRequestData),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
            }

            const responseData = await response.json(); // Expect {"questions": [...], "time_limit": ...}

            questions = responseData.questions;
            if (typeof responseData.time_limit === 'number' && responseData.time_limit > 0) {
                currentQuizTimeLimit = responseData.time_limit;
            } else {
                currentQuizTimeLimit = 30; // Fallback to default
                console.warn(`Invalid or missing time_limit from backend, defaulting to ${currentQuizTimeLimit} seconds.`);
            }

            if (!questions || questions.length === 0 || questions.length < quizNumQuestions) {
                quizContainer.innerHTML = `<p style="color: orange;">Could not generate the requested number of questions (${quizNumQuestions}). Received ${questions.length}. Please try different parameters or a broader topic.</p>`;
                quizSetupDiv.style.display = 'block';
                return;
            }
            quizNumQuestions = questions.length;

            currentQuestionIndex = 0;
            userAnswers = new Array(questions.length).fill(null);
            renderQuestion();
        } catch (error) {
            console.error('Error starting quiz:', error);
            quizContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
            quizSetupDiv.style.display = 'block';
        }
    });

    function startTimer(duration, displayElement) {
        if (questionTimerInterval) {
            clearInterval(questionTimerInterval);
        }

        let timeLeft = duration;
        displayElement.textContent = `Time left: ${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`;

        questionTimerInterval = setInterval(() => {
            timeLeft--;
            displayElement.textContent = `Time left: ${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`;

            if (timeLeft < 0) { // Changed to < 0 to ensure 00:00 is displayed before 'Time up!'
                clearInterval(questionTimerInterval);
                questionTimerInterval = null;
                displayElement.textContent = 'Time up!';
                handleNextSubmit(true);
            }
        }, 1000);
    }

    function renderQuestion() {
        quizContainer.innerHTML = '';

        if (currentQuestionIndex >= questions.length) {
            showResults();
            return;
        }

        const questionData = questions[currentQuestionIndex];
        const questionElement = document.createElement('div');
        questionElement.classList.add('question-item');

        const timerDisplay = document.createElement('div');
        timerDisplay.id = 'timer-display';
        timerDisplay.classList.add('timer');
        questionElement.appendChild(timerDisplay);
        // Use dynamic time limit here
        startTimer(currentQuizTimeLimit, timerDisplay);

        const questionText = document.createElement('p');
        questionText.innerHTML = `<strong>Question ${currentQuestionIndex + 1}/${questions.length}:</strong> ${questionData.question}`;
        questionElement.appendChild(questionText);

        if (questionData.code && questionData.code.trim() !== "") {
            const codeElement = document.createElement('pre');
            const codeTag = document.createElement('code');
            codeTag.textContent = questionData.code;
            codeElement.appendChild(codeTag);
            questionElement.appendChild(codeElement);
        }

        const optionsDiv = document.createElement('div');
        optionsDiv.classList.add('options');
        for (const key in questionData.options) {
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `question-${currentQuestionIndex}`;
            radio.value = key;
            if (userAnswers[currentQuestionIndex] === key) {
                radio.checked = true;
            }
            label.appendChild(radio);
            label.appendChild(document.createTextNode(` ${key}) ${questionData.options[key]}`));
            optionsDiv.appendChild(label);
        }
        questionElement.appendChild(optionsDiv);

        const nextButton = document.createElement('button');
        nextButton.id = 'next-btn';
        if (currentQuestionIndex === questions.length - 1) {
            nextButton.textContent = 'Submit Quiz';
        } else {
            nextButton.textContent = 'Next Question';
        }
        nextButton.addEventListener('click', () => handleNextSubmit(false));
        questionElement.appendChild(nextButton);

        quizContainer.appendChild(questionElement);
    }

    function handleNextSubmit(isTimerExpired = false) {
        if (questionTimerInterval) {
            clearInterval(questionTimerInterval);
            questionTimerInterval = null;
        }

        if (currentQuestionIndex >= questions.length) {
            return;
        }

        const selectedOption = document.querySelector(`input[name="question-${currentQuestionIndex}"]:checked`);
        if (selectedOption) {
            userAnswers[currentQuestionIndex] = selectedOption.value;
        } else {
            userAnswers[currentQuestionIndex] = null;
        }

        currentQuestionIndex++;
        if (currentQuestionIndex < questions.length) {
            renderQuestion();
        } else {
            showResults();
        }
    }

    function showResults() {
        if (questionTimerInterval) {
            clearInterval(questionTimerInterval);
            questionTimerInterval = null;
        }
        quizContainer.innerHTML = '';
        quizContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'block';

        let score = 0;
        userAnswers.forEach((answer, index) => {
            if (answer === questions[index].correct) {
                score++;
            }
        });

        const scoreElement = document.createElement('h2');
        scoreElement.textContent = `Quiz Results: Your score is ${score} out of ${questions.length}`;
        resultsContainer.appendChild(scoreElement);

        questions.forEach((questionData, index) => {
            const resultItem = document.createElement('div');
            resultItem.classList.add('result-item', 'question-item');

            const questionText = document.createElement('p');
            questionText.innerHTML = `<strong>${index + 1}. ${questionData.question}</strong>`;
            resultItem.appendChild(questionText);

            if (questionData.code && questionData.code.trim() !== "") {
                const codeElement = document.createElement('pre');
                codeElement.innerHTML = `<code>${questionData.code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`;
                resultItem.appendChild(codeElement);
            }

            const userAnswerText = document.createElement('p');
            const userAnswerDisplay = userAnswers[index] ? `${userAnswers[index]}) ${questionData.options[userAnswers[index]]}` : 'Unanswered (Time up or no selection)';
            userAnswerText.innerHTML = `Your answer: <span class="${userAnswers[index] === questionData.correct ? 'correct' : 'incorrect'}">${userAnswerDisplay}</span>`;
            resultItem.appendChild(userAnswerText);

            if (userAnswers[index] !== questionData.correct && userAnswers[index] !== null) {
                const correctAnswerText = document.createElement('p');
                correctAnswerText.innerHTML = `Correct answer: <span class="correct">${questionData.correct}) ${questionData.options[questionData.correct]}</span>`;
                resultItem.appendChild(correctAnswerText);
            }

            const explainButton = document.createElement('button');
            explainButton.textContent = 'Show Explanation';
            explainButton.classList.add('explain-btn');
            explainButton.dataset.questionIndex = index;
            explainButton.addEventListener('click', handleShowExplanation);
            resultItem.appendChild(explainButton);

            const explanationDiv = document.createElement('div');
            explanationDiv.id = `explanation-${index}`;
            explanationDiv.classList.add('explanation');
            explanationDiv.style.display = 'none';
            resultItem.appendChild(explanationDiv);

            resultsContainer.appendChild(resultItem);
        });

        const tryAgainButton = document.createElement('button');
        tryAgainButton.textContent = 'Try Another Quiz';
        tryAgainButton.id = 'try-again-btn';
        tryAgainButton.addEventListener('click', () => {
            resultsContainer.style.display = 'none';
            quizSetupDiv.style.display = 'block';
            topicInput.value = '';
            numQuestionsInput.value = '5';
            levelSelect.value = 'beginner';
            if (questionTimerInterval) clearInterval(questionTimerInterval);
        });
        resultsContainer.appendChild(tryAgainButton);
    }

    async function handleShowExplanation(event) {
        const button = event.target;
        const questionIndex = parseInt(button.dataset.questionIndex, 10);
        const explanationDiv = document.getElementById(`explanation-${questionIndex}`);

        if (explanationDiv.style.display === 'block' && explanationDiv.innerHTML !== 'Loading explanation...') {
            explanationDiv.style.display = 'none';
            button.textContent = 'Show Explanation';
            return;
        }

        explanationDiv.innerHTML = 'Loading explanation...';
        explanationDiv.style.display = 'block';
        button.textContent = 'Hide Explanation';

        const explanationRequestData = {
            topic: quizTopic,
            level: quizLevel,
            num_questions: quizNumQuestions,
            question_index: questionIndex
        };

        try {
            const response = await fetch('/get-explanation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(explanationRequestData),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            explanationDiv.textContent = data.explanation;

        } catch (error) {
            console.error('Error fetching explanation:', error);
            explanationDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    }
});
