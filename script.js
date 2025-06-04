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

            const responseData = await response.json();

            questions = responseData.questions;
            if (typeof responseData.time_limit === 'number' && responseData.time_limit > 0) {
                currentQuizTimeLimit = responseData.time_limit;
            } else {
                currentQuizTimeLimit = 30;
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
        console.log('startTimer: Called with duration:', duration, 'and displayElement:', displayElement);

        if (!displayElement) {
            console.error('startTimer: displayElement is null or undefined!');
            return;
        }
        console.log('startTimer: displayElement is valid.');

        if (typeof duration !== 'number' || duration <= 0) {
            console.error('startTimer: Invalid duration:', duration);
            // Fallback to a default if duration is invalid, to prevent timer from breaking completely
            // duration = 30;
            // console.warn('startTimer: Using fallback duration of 30s due to invalid input.');
            // Alternatively, just return:
            return;
        }
        console.log('startTimer: Duration is valid:', duration);

        console.log('startTimer: Clearing previous timer interval ID:', questionTimerInterval);
        clearInterval(questionTimerInterval);
        questionTimerInterval = null; // Explicitly set to null after clearing

        let timeLeft = duration;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        displayElement.textContent = `Time left: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        console.log('startTimer: Initial timer text set to:', displayElement.textContent);

        questionTimerInterval = setInterval(() => {
            console.log('startTimer interval: timeLeft before decrement:', timeLeft);
            timeLeft--;
            const m = Math.floor(timeLeft / 60);
            const s = timeLeft % 60;

            // Ensure displayElement is still part of the DOM (it should be, but good for robustness)
            if (document.body.contains(displayElement)) {
                 displayElement.textContent = `Time left: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                 console.log('startTimer interval: new textContent:', displayElement.textContent);
            } else {
                console.warn('startTimer interval: displayElement no longer in DOM. Clearing interval.');
                clearInterval(questionTimerInterval);
                return;
            }

            if (timeLeft < 0) {
                console.log('startTimer interval: Time expired.');
                clearInterval(questionTimerInterval);
                questionTimerInterval = null; // Explicitly set to null
                if (document.body.contains(displayElement)) {
                    displayElement.textContent = 'Time up!';
                }
                handleNextSubmit(true);
            }
        }, 1000);
        console.log('startTimer: New timer interval ID set:', questionTimerInterval);
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
        questionElement.appendChild(timerDisplay); // Appended before startTimer call

        // Logging added as per subtask
        console.log('renderQuestion: Calling startTimer with duration:', currentQuizTimeLimit, 'and element:', timerDisplay);
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
        // Log before clearing, to see if it was already null
        console.log('handleNextSubmit: Called. isTimerExpired:', isTimerExpired, 'Current timer ID:', questionTimerInterval);
        if (questionTimerInterval) {
            clearInterval(questionTimerInterval);
            questionTimerInterval = null; // Explicitly set to null
            console.log('handleNextSubmit: Timer interval cleared.');
        } else {
            console.log('handleNextSubmit: No active timer interval to clear (was already null or cleared).');
        }

        if (currentQuestionIndex >= questions.length) {
            console.log('handleNextSubmit: Already past the last question. currentQuestionIndex:', currentQuestionIndex);
            return;
        }

        const selectedOption = document.querySelector(`input[name="question-${currentQuestionIndex}"]:checked`);
        if (selectedOption) {
            userAnswers[currentQuestionIndex] = selectedOption.value;
            console.log('handleNextSubmit: Answer for question', currentQuestionIndex, 'stored as', selectedOption.value);
        } else {
            userAnswers[currentQuestionIndex] = null;
            console.log('handleNextSubmit: Question', currentQuestionIndex, 'unanswered.');
        }

        currentQuestionIndex++;
        console.log('handleNextSubmit: currentQuestionIndex incremented to', currentQuestionIndex);

        if (currentQuestionIndex < questions.length) {
            console.log('handleNextSubmit: Rendering next question.');
            renderQuestion();
        } else {
            console.log('handleNextSubmit: End of quiz. Showing results.');
            showResults();
        }
    }

    function showResults() {
        console.log('showResults: Called. Current timer ID:', questionTimerInterval);
        if (questionTimerInterval) {
            clearInterval(questionTimerInterval);
            questionTimerInterval = null; // Explicitly set to null
            console.log('showResults: Timer interval cleared.');
        } else {
            console.log('showResults: No active timer interval to clear.');
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
        console.log('showResults: Score calculated:', score, '/', questions.length);

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
            if (questionTimerInterval) { // Should be null already, but good practice
                clearInterval(questionTimerInterval);
                questionTimerInterval = null;
            }
            console.log('Try Another Quiz: UI reset.');
        });
        resultsContainer.appendChild(tryAgainButton);
    }

    async function handleShowExplanation(event) {
        const button = event.target;
        const questionIndex = parseInt(button.dataset.questionIndex, 10);
        const explanationDiv = document.getElementById(`explanation-${questionIndex}`);
        console.log('handleShowExplanation: questionIndex:', questionIndex, 'Current display:', explanationDiv.style.display);


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
        console.log('handleShowExplanation: Fetching explanation with data:', explanationRequestData);

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
            console.log('handleShowExplanation: Explanation loaded for questionIndex:', questionIndex);

        } catch (error) {
            console.error('Error fetching explanation:', error);
            explanationDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    }
});
