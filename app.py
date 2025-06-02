# QUIZ/app.py

from fastapi import FastAPI, HTTPException # Request removed
from fastapi.middleware.cors import CORSMiddleware
# JSONResponse removed
# import uvicorn # uvicorn removed

from pydantic import BaseModel
from quiz8 import QuizAgent
from typing import List, Dict, Optional

app = FastAPI()

# Allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic model for /generate-quiz request body
class QuizRequest(BaseModel):
    topic: str
    question_number: int
    level: str

# Pydantic models for /submit-quiz request body
class QuestionDetail(BaseModel):
    question: str
    code: Optional[str] = None
    options: Dict[str, str]
    correct: str
    explanation: str

class QuizSubmissionRequest(BaseModel):
    questions: List[QuestionDetail]
    user_answers: List[Optional[str]]

@app.post("/generate-quiz")
async def generate_quiz_endpoint(data: QuizRequest):
    try:
        quiz_agent = QuizAgent()
        questions = quiz_agent.generate_quiz(
            topic=data.topic,
            level=data.level,
            num_questions=data.question_number
        )
        return questions
    except ValueError as ve:
        print(f"ValueError during quiz generation: {ve}")
        raise HTTPException(status_code=500, detail=str(ve))
    except Exception as e:
        print(f"Unexpected error generating quiz: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred while generating the quiz.")

@app.post("/submit-quiz")
async def submit_quiz_endpoint(submission: QuizSubmissionRequest):
    score = 0
    detailed_results = []
    total_questions = len(submission.questions)

    if len(submission.user_answers) != total_questions:
        raise HTTPException(
            status_code=400,
            detail=f"Number of answers ({len(submission.user_answers)}) does not match number of questions ({total_questions})."
        )

    for i, question_detail in enumerate(submission.questions):
        user_answer = submission.user_answers[i]
        is_correct = (user_answer == question_detail.correct)

        if is_correct:
            score += 1

        detailed_results.append({
            "question_num": i + 1,
            "question_text": question_detail.question,
            "user_answer": user_answer,
            "correct_answer": question_detail.correct,
            "is_correct": is_correct,
            "explanation": question_detail.explanation
        })

    return {
        "score": score,
        "total_questions": total_questions,
        "results": detailed_results
    }

# The old /get-quiz endpoint (which was commented out) has been fully removed.
# The old /submit-quiz endpoint (which was commented out) was already replaced.

# To run: uvicorn app:app --reload
