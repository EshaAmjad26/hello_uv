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
        quizSetupDiv.style.display = 'none'; // Hide setup
        quizContainer.style.display = 'block'; // Show quiz area

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

            questions = await response.json();
            if (!questions || questions.length === 0 || questions.length < quizNumQuestions) {
                quizContainer.innerHTML = `<p style="color: orange;">Could not generate the requested number of questions (${quizNumQuestions}). Received ${questions.length}. Please try different parameters or a broader topic.</p>`;
                quizSetupDiv.style.display = 'block'; // Show setup again
                return;
            }

            // Adjust quizNumQuestions if API returned fewer than requested but some questions
            quizNumQuestions = questions.length;

            currentQuestionIndex = 0;
            userAnswers = new Array(questions.length).fill(null);
            renderQuestion();
        } catch (error) {
            console.error('Error starting quiz:', error);
            quizContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
            quizSetupDiv.style.display = 'block'; // Show setup again on error
        }
    });

    function renderQuestion() {
        quizContainer.innerHTML = ''; // Clear previous question

        if (currentQuestionIndex >= questions.length) {
            showResults();
            return;
        }

        const questionData = questions[currentQuestionIndex];
        const questionElement = document.createElement('div');
        questionElement.classList.add('question-item');

        const questionText = document.createElement('p');
        questionText.innerHTML = `<strong>Question ${currentQuestionIndex + 1}/${questions.length}:</strong> ${questionData.question}`;
        questionElement.appendChild(questionText);

        if (questionData.code && questionData.code.trim() !== "") {
            const codeElement = document.createElement('pre');
            const codeTag = document.createElement('code');
            // Basic escaping for HTML, though backend should ideally provide clean code
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
        nextButton.addEventListener('click', handleNextSubmit);
        questionElement.appendChild(nextButton);

        quizContainer.appendChild(questionElement);
    }

    function handleNextSubmit() {
        const selectedOption = document.querySelector(`input[name="question-${currentQuestionIndex}"]:checked`);
        if (selectedOption) {
            userAnswers[currentQuestionIndex] = selectedOption.value;
        } else {
            userAnswers[currentQuestionIndex] = null; // Or some other indicator for unanswered
        }

        currentQuestionIndex++;
        if (currentQuestionIndex < questions.length) {
            renderQuestion();
        } else {
            showResults();
        }
    }

    function showResults() {
        quizContainer.innerHTML = ''; // Clear last question
        quizContainer.style.display = 'none'; // Hide quiz area
        resultsContainer.innerHTML = ''; // Clear previous results
        resultsContainer.style.display = 'block'; // Show results area

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
            resultItem.classList.add('result-item', 'question-item'); // Reuse question-item styling

            const questionText = document.createElement('p');
            questionText.innerHTML = `<strong>${index + 1}. ${questionData.question}</strong>`;
            resultItem.appendChild(questionText);

            if (questionData.code && questionData.code.trim() !== "") {
                const codeElement = document.createElement('pre');
                codeElement.innerHTML = `<code>${questionData.code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`;
                resultItem.appendChild(codeElement);
            }

            const userAnswerText = document.createElement('p');
            const userAnswerDisplay = userAnswers[index] ? `${userAnswers[index]}) ${questionData.options[userAnswers[index]]}` : 'Unanswered';
            userAnswerText.innerHTML = `Your answer: <span class="${userAnswers[index] === questionData.correct ? 'correct' : 'incorrect'}">${userAnswerDisplay}</span>`;
            resultItem.appendChild(userAnswerText);

            if (userAnswers[index] !== questionData.correct) {
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
            explanationDiv.style.display = 'none'; // Initially hidden
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
        });
        resultsContainer.appendChild(tryAgainButton);
    }

    async function handleShowExplanation(event) {
        const button = event.target;
        const questionIndex = parseInt(button.dataset.questionIndex, 10);
        const explanationDiv = document.getElementById(`explanation-${questionIndex}`);

        if (explanationDiv.style.display === 'block' && explanationDiv.innerHTML !== 'Loading explanation...') {
            explanationDiv.style.display = 'none'; // Toggle off
            button.textContent = 'Show Explanation';
            return;
        }

        explanationDiv.innerHTML = 'Loading explanation...';
        explanationDiv.style.display = 'block';
        button.textContent = 'Hide Explanation';

        const explanationRequestData = {
            topic: quizTopic,
            level: quizLevel,
            num_questions: quizNumQuestions, // Use the actual number of questions in the current quiz
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
