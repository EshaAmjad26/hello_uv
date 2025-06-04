import os
# threading and time are not used, so I'll remove them.
# import threading
# import time
from typing import Dict, List

import colorama
import google.generativeai as genai
from colorama import Fore, Style
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException # Added HTTPException for error responses
from pydantic import BaseModel

app = FastAPI()

# Pydantic Models
class QuizRequest(BaseModel):
    topic: str
    question_number: int # Field name in JS is question_number, but model uses this. Keep consistent.
    level: str

class ExplanationRequest(BaseModel): # New model for the explanation endpoint
    topic: str
    level: str
    num_questions: int # Renaming this to match the QuizAgent.generate_quiz parameter
    question_index: int

class ExplanationResponse(BaseModel): # Response model for the explanation
    explanation: str

class QuizAgent:
    def __init__(self):
        colorama.init()
        load_dotenv()
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set.")
        genai.configure(api_key=self.gemini_api_key)
        self.model = genai.GenerativeModel("gemini-1.5-flash")
        self.difficulty_levels = ["beginner", "intermediate", "advanced"]
        self.quiz_prompts = {
            "beginner": """Generate {num_questions} multiple-choice questions about {topic} in Python at {level} level.
            Each question must strictly follow this format:

            Q1. [Conceptual Question text]
            A) [Option A]
            B) [Option B]
            C) [Option C]
            D) [Option D]
            Correct: [Correct option letter]
            Explanation: [Detailed explanation]

            Ensure exactly {num_questions} conceptual questions are generated with correct formatting. Do not include code snippets.
            """,
            "intermediate": """Generate {num_questions} multiple-choice questions about {topic} in Python at {level} level.
            Each question must strictly follow this format:

            Q1. [Question text]
            ```python
            [Code snippet]
            ```
            A) [Option A]
            B) [Option B]
            C) [Option C]
            D) [Option D]
            Correct: [Correct option letter]
            Explanation: [Detailed explanation]

            Ensure exactly {num_questions} questions are generated with correct formatting.
            """,
            "advanced": """Generate {num_questions} multiple-choice conceptual questions about {topic} in Python at {level} level.
             Each question must strictly follow this format:

             Q1. [Conceptual Question text]
             A) [Option A]
             B) [Option B]
             C) [Option C]
             D) [Option D]
             Correct: [Correct option letter]
             Explanation: [Detailed explanation]

             Ensure exactly {num_questions} conceptual questions are generated with correct formatting. Do not include code snippets.
             """
        }

    def generate_quiz(self, topic: str, level: str, num_questions: int) -> List[Dict]:
        if level not in self.quiz_prompts:
            # This error should ideally be caught by the endpoint and returned as an HTTPException
            raise ValueError(f"Invalid difficulty level: {level}. Choose from {', '.join(self.difficulty_levels)}")
        if num_questions <= 0:
            raise ValueError("Number of questions must be positive.")

        prompt = self.quiz_prompts[level].format(topic=topic, level=level, num_questions=num_questions)

        try:
            response = self.model.generate_content(prompt)
            if not response.text:
                # This exception will be caught by the endpoint
                raise Exception("Failed to generate quiz questions from API: No text in response.")
        except Exception as e: # Catching broader exceptions from API call
            # Log the error for server-side diagnostics if needed
            # print(f"Gemini API call failed: {e}")
            raise Exception(f"Failed to generate quiz questions from API: {e}")


        questions = []
        raw_questions = response.text.split("Q")[1:]
        for q_text in raw_questions: # Renamed q to q_text for clarity
            try:
                lines = q_text.strip().split("\n")
                question_text = ""
                code_snippet = ""
                options = {}
                correct = ""
                explanation = ""

                if ". " in lines[0]:
                    question_text = lines[0].split(". ", 1)[1].strip()
                else:
                    # print(Fore.YELLOW + f"Skipping question block due to missing question number: {lines[0]}" + Style.RESET_ALL)
                    continue

                options_start_index = 1
                if level == "intermediate": # Simplified condition
                    code_lines = []
                    in_code = False
                    # Corrected loop to avoid skipping first line of code snippet
                    for idx, line in enumerate(lines[1:]): # Iterate from the actual second line (index 1 of `lines`)
                        if line.strip().startswith("```python"):
                            in_code = True
                            # options_start_index = idx + 1 # Mark the line after ```python
                            continue # Skip the ```python line itself
                        elif line.strip() == "```" and in_code:
                            in_code = False
                            options_start_index = idx + 2 # Options start after the closing ``` line (idx is 0-based for lines[1:])
                            break
                        elif in_code:
                            code_lines.append(line)
                    code_snippet = "\n".join(code_lines)

                # Ensure options_start_index is valid and there are enough lines
                # Need 6 lines for: A, B, C, D, Correct, Explanation from options_start_index
                if options_start_index + 5 >= len(lines):
                    # print(Fore.YELLOW + f"Skipping question block due to insufficient lines for options/answer/explanation. Options expected at {options_start_index}, total lines {len(lines)}" + Style.RESET_ALL)
                    continue

                try:
                    options = {
                        "A": lines[options_start_index].split("A) ")[1].strip(),
                        "B": lines[options_start_index + 1].split("B) ")[1].strip(),
                        "C": lines[options_start_index + 2].split("C) ")[1].strip(),
                        "D": lines[options_start_index + 3].split("D) ")[1].strip(),
                    }
                    correct = lines[options_start_index + 4].split("Correct: ")[1].strip().upper()
                    explanation = lines[options_start_index + 5].split("Explanation: ")[1].strip()
                except (IndexError, ValueError) as inner_e:
                    # print(Fore.YELLOW + f"Skipping poorly formatted question options/answer/explanation: {lines[options_start_index:options_start_index+6]} - {inner_e}" + Style.RESET_ALL)
                    continue

                questions.append({
                    "question": question_text,
                    "code": code_snippet,
                    "options": options,
                    "correct": correct,
                    "explanation": explanation,
                })
            except Exception as e:
                # print(Fore.RED + f"❌ Error parsing individual question: {q_text[:50]}... - {e}" + Style.RESET_ALL)
                continue

        if len(questions) < num_questions:
            # print(Fore.YELLOW + f"⚠️ Only {len(questions)} of {num_questions} questions were successfully parsed." + Style.RESET_ALL)
            pass

        return questions

# CORS Middleware
from fastapi.middleware.cors import CORSMiddleware
origins = ["http://127.0.0.1:5500"] # Keep this simple for now
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Endpoints
@app.post("/generate-quiz", response_model=List[Dict])
async def generate_quiz_endpoint(data: QuizRequest): # Made async for consistency
    quiz_agent = QuizAgent()
    try:
        questions = quiz_agent.generate_quiz(
            topic=data.topic,
            level=data.level,
            num_questions=data.question_number
        )
        if not questions and data.question_number > 0 : # If requested questions but got none
             raise HTTPException(status_code=500, detail="No questions were generated by the agent. The prompt might be too restrictive or the API might be having issues.")
        return questions
    except ValueError as ve: # Catch validation errors from QuizAgent
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e: # Catch other errors from QuizAgent (e.g., API call failure)
        # Log the full error server-side for debugging
        # print(f"Error in /generate-quiz endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred while generating the quiz: {e}")


@app.post("/get-explanation", response_model=ExplanationResponse) # Use the new response model
async def get_explanation_endpoint(data: ExplanationRequest): # Made async
    quiz_agent = QuizAgent()
    try:
        # Regenerate questions to get the explanation
        questions = quiz_agent.generate_quiz(
            topic=data.topic,
            level=data.level,
            num_questions=data.num_questions # Use num_questions from ExplanationRequest
        )

        if not questions: # Check if any questions were generated at all
            raise HTTPException(status_code=500, detail="Failed to generate quiz to retrieve explanation. No questions returned.")

        if not (0 <= data.question_index < len(questions)):
            raise HTTPException(status_code=400, detail=f"Invalid question index: {data.question_index}. Number of questions: {len(questions)}.")

        explanation = questions[data.question_index].get("explanation")
        if explanation is None: # Should not happen if parsing is correct and explanation is mandatory
             raise HTTPException(status_code=404, detail="Explanation not found for this question.")

        return ExplanationResponse(explanation=explanation)
    except ValueError as ve: # Catch validation errors from QuizAgent (e.g. invalid level)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e: # Catch other generic errors
        # print(f"Error in /get-explanation endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred while retrieving the explanation: {e}")

# Removed the if __name__ == "__main__": block as it's not typical for FastAPI apps deployed with uvicorn
