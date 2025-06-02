import os
from typing import Dict, List

import colorama
import google.generativeai as genai
from colorama import Fore, Style
from dotenv import load_dotenv

# Unused imports like pydantic.BaseModel, threading, time, and duplicate typing.List have been removed.

# QuizRequest class has been removed.

class QuizAgent:
    def __init__(self):
        colorama.init()  # Initialize colorama for colored text

        # Load environment variables
        load_dotenv()
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set.")

        # Configure Gemini API
        genai.configure(api_key=self.gemini_api_key)
        self.model = genai.GenerativeModel("gemini-1.5-flash")

        # Quiz settings
        self.difficulty_levels = ["beginner", "intermediate", "advanced"]
        # self.time_limits was removed as it was only used by run_quiz

        # Different prompts based on difficulty level
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
        """Generate quiz questions using Gemini API."""
        prompt = self.quiz_prompts[level].format(topic=topic, level=level, num_questions=num_questions)
        response = self.model.generate_content(prompt)

        if not response.text:
            raise Exception("Failed to generate quiz questions.")

        questions = []
        raw_questions = response.text.split("Q")[1:]  # Extract each question

        for q in raw_questions:
            try:
                lines = q.strip().split("\n")
                question_text = ""
                code_snippet = ""
                options = {}
                correct = ""
                explanation = ""

                # Step 1: Extract question text
                if ". " in lines[0]:
                    question_text = lines[0].split(". ", 1)[1].strip()
                else:
                    continue

                # Step 2: Extract code if present
                if level in ["intermediate"]:
                    code_lines = []
                    in_code = False
                    options_start_index = 1

                    for idx, line in enumerate(lines[1:], start=1):
                        if line.strip().startswith("```python"):
                            in_code = True
                            continue
                        elif line.strip() == "```" and in_code:
                            in_code = False
                            options_start_index = idx + 1
                            break
                        elif in_code:
                            code_lines.append(line)

                    code_snippet = "\n".join(code_lines)
                else:
                    options_start_index = 1  # For beginner level (no code)

                # Step 3: Parse options, correct answer, and explanation
                try:
                    options = {
                        "A": lines[options_start_index].split("A) ")[1].strip(),
                        "B": lines[options_start_index + 1].split("B) ")[1].strip(),
                        "C": lines[options_start_index + 2].split("C) ")[1].strip(),
                        "D": lines[options_start_index + 3].split("D) ")[1].strip(),
                    }
                    correct = lines[options_start_index + 4].split("Correct: ")[1].strip().upper()
                    explanation = lines[options_start_index + 5].split("Explanation: ")[1].strip()
                except Exception as inner_e:
                    print(Fore.YELLOW + f"Skipping poorly formatted question block: {inner_e}" + Style.RESET_ALL)
                    continue

                questions.append(
                    {
                        "question": question_text,
                        "code": code_snippet,
                        "options": options,
                        "correct": correct,
                        "explanation": explanation,
                    }
                )
            except Exception as e:
                print(Fore.RED + f"❌ Error parsing question: {e}" + Style.RESET_ALL)
                continue

        if len(questions) < num_questions:
            print(Fore.YELLOW + f"⚠️ Only {len(questions)} questions generated, retrying..." + Style.RESET_ALL)
            return self.generate_quiz(topic, level, num_questions)

        return questions

# run_quiz method has been completely removed.
# if __name__ == "__main__": block has been completely removed.
