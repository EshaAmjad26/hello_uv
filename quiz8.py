import os
import re # For improved parsing
from typing import Dict, List

import colorama
import google.generativeai as genai
from colorama import Fore, Style
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

# Pydantic Models
class QuizRequest(BaseModel):
    topic: str
    question_number: int
    level: str

class ExplanationRequest(BaseModel):
    topic: str
    level: str
    num_questions: int
    question_index: int

class ExplanationResponse(BaseModel):
    explanation: str

class QuizResponse(BaseModel):
    questions: List[Dict]
    time_limit: int

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
        self.time_limits = {"beginner": 30, "intermediate": 45, "advanced": 60}
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
            "advanced": """Generate {num_questions} challenging multiple-choice conceptual questions about {topic} in Python at an advanced level. These questions should require deeper understanding or synthesis of concepts.
            Each question must strictly follow this format:

            Q1. [Challenging conceptual question text]
            A) [Option A]
            B) [Option B]
            C) [Option C]
            D) [Option D]
            Correct: [Correct option letter]
            Explanation: [Detailed explanation]

            Ensure exactly {num_questions} questions are generated with correct formatting. Do not include code snippets.
            """
        }

    def generate_quiz(self, topic: str, level: str, num_questions: int) -> List[Dict]:
        if level not in self.quiz_prompts:
            raise ValueError(f"Invalid difficulty level: {level}. Choose from {', '.join(self.difficulty_levels)}")
        if num_questions <= 0:
            raise ValueError("Number of questions must be positive.")

        prompt = self.quiz_prompts[level].format(topic=topic, level=level, num_questions=num_questions)

        try:
            response = self.model.generate_content(prompt)
            if not response.text:
                raise Exception("Failed to generate quiz questions from API: No text in response.")
        except Exception as e:
            raise Exception(f"Failed to generate quiz questions from API: {e}")

        questions = []
        raw_text = response.text.strip()
        raw_question_blocks = re.split(r'(?=Q\d+\.)', raw_text)

        for block_content in raw_question_blocks:
            block_content = block_content.strip()
            if not block_content or not block_content.startswith("Q"):
                continue

            lines = [line.strip() for line in block_content.split('\n') if line.strip()]
            if not lines:
                continue

            q_num_match = re.match(r"(Q\d+\.)\s*(.*)", lines[0])
            if not q_num_match:
                print(Fore.YELLOW + f"Skipping block: Could not parse question number and text from line: '{lines[0]}'" + Style.RESET_ALL)
                print(Fore.CYAN + "Block content for debugging:\n" + block_content + Style.RESET_ALL)
                continue

            question_number_text = q_num_match.group(1)
            question_text = q_num_match.group(2).strip()

            current_line_idx = 1
            code_snippet = ""
            options = {}
            correct_answer = None
            explanation = None
            options_found_count = 0

            if level == "intermediate":
                if current_line_idx < len(lines) and lines[current_line_idx].startswith("```python"):
                    code_lines = []
                    current_line_idx += 1
                    while current_line_idx < len(lines) and not lines[current_line_idx] == "```":
                        code_lines.append(lines[current_line_idx])
                        current_line_idx += 1
                    if current_line_idx < len(lines) and lines[current_line_idx] == "```":
                        current_line_idx += 1
                    else:
                        print(Fore.YELLOW + f"Skipping question ({question_number_text} {question_text}): Unclosed code snippet." + Style.RESET_ALL)
                        print(Fore.CYAN + "Block content for debugging:\n" + block_content + Style.RESET_ALL)
                        continue
                    code_snippet = "\n".join(code_lines)

            option_prefixes = ["A) ", "B) ", "C) ", "D) "]

            while current_line_idx < len(lines):
                line = lines[current_line_idx]
                is_structural_element = False

                for prefix in option_prefixes:
                    if line.startswith(prefix):
                        options[prefix[0]] = line[len(prefix):].strip()
                        options_found_count += 1
                        is_structural_element = True
                        break
                if is_structural_element:
                    current_line_idx += 1
                    continue

                if line.startswith("Correct:"):
                    correct_answer = line.split("Correct:", 1)[1].strip().upper()
                    is_structural_element = True
                elif line.startswith("Correct Answer:"):
                    correct_answer = line.split("Correct Answer:", 1)[1].strip().upper()
                    is_structural_element = True

                if is_structural_element and correct_answer:
                     current_line_idx += 1
                     continue

                if line.startswith("Explanation:"):
                    exp_lines = [line.split("Explanation:", 1)[1].strip()]
                    current_line_idx += 1
                    while current_line_idx < len(lines) and \
                          not re.match(r"Q\d+\.", lines[current_line_idx]) and \
                          not any(lines[current_line_idx].startswith(op) for op in option_prefixes) and \
                          not lines[current_line_idx].startswith("Correct:"):
                        exp_lines.append(lines[current_line_idx].strip())
                        current_line_idx += 1
                    explanation = "\n".join(exp_lines)
                    is_structural_element = True
                    break

                if not is_structural_element:
                    current_line_idx += 1

            if options_found_count != 4 or not correct_answer or not explanation:
                print(Fore.YELLOW + f"Skipping question ({question_number_text} {question_text}) due to missing elements:" + Style.RESET_ALL)
                print(Fore.YELLOW + f"  Options found: {options_found_count}/4, Correct answer found: {'Yes' if correct_answer else 'No'}, Explanation found: {'Yes' if explanation else 'No'}" + Style.RESET_ALL)
                print(Fore.CYAN + "Block content for debugging:\n" + block_content + Style.RESET_ALL)
                continue

            questions.append({
                "question_number_text": question_number_text,
                "question": question_text,
                "code": code_snippet,
                "options": options,
                "correct": correct_answer,
                "explanation": explanation,
            })
            if len(questions) == num_questions:
                break

        if len(questions) < num_questions:
            print(Fore.MAGENTA + f"WARNING: Generated only {len(questions)} out of {num_questions} requested questions. The API might have returned fewer distinct question blocks or some were unparsable." + Style.RESET_ALL)

        return questions

# CORS Middleware
from fastapi.middleware.cors import CORSMiddleware
origins = ["http://127.0.0.1:5500"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Endpoints
@app.post("/generate-quiz", response_model=QuizResponse)
async def generate_quiz_endpoint(data: QuizRequest):
    quiz_agent = QuizAgent()
    try:
        questions = quiz_agent.generate_quiz(
            topic=data.topic,
            level=data.level,
            num_questions=data.question_number
        )
        if not questions and data.question_number > 0 :
             raise HTTPException(status_code=500, detail="No questions were generated by the agent. The prompt might be too restrictive, the API might be having issues, or the response format was not parsable.")

        time_limit_for_level = quiz_agent.time_limits.get(data.level.lower(), 30)

        return QuizResponse(questions=questions, time_limit=time_limit_for_level)

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred while generating the quiz: {e}")

@app.post("/get-explanation", response_model=ExplanationResponse)
async def get_explanation_endpoint(data: ExplanationRequest):
    quiz_agent = QuizAgent()
    try:
        questions = quiz_agent.generate_quiz(
            topic=data.topic,
            level=data.level,
            num_questions=data.num_questions
        )
        if not questions:
            raise HTTPException(status_code=500, detail="Failed to generate quiz to retrieve explanation. No questions returned from agent.")
        if not (0 <= data.question_index < len(questions)):
            raise HTTPException(status_code=400, detail=f"Invalid question index: {data.question_index}. Number of questions generated: {len(questions)}.")

        explanation = questions[data.question_index].get("explanation")
        if explanation is None:
             raise HTTPException(status_code=404, detail="Explanation not found for this question (was None in parsed data).")

        return ExplanationResponse(explanation=explanation)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred while retrieving the explanation: {e}")
