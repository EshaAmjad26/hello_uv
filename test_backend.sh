#!/bin/bash

echo "Attempting to install dependencies..."
pip install google-generativeai python-dotenv colorama fastapi uvicorn

# Start FastAPI server in the background
python quiz8.py &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for the server to start
sleep 8

OUTPUT_FILE="curl_output.txt"
echo "Starting backend tests..." > $OUTPUT_FILE

# Function to make requests and store output
run_curl_test() {
    REQUEST_NAME="$1"
    URL="$2"
    PAYLOAD="$3"

    echo "Testing $REQUEST_NAME..." >> $OUTPUT_FILE
    echo "URL: $URL" >> $OUTPUT_FILE
    echo "Payload: $PAYLOAD" >> $OUTPUT_FILE

    TEMP_RESPONSE_FILE=$(mktemp)
    HTTP_CODE=$(curl -L --connect-timeout 10 --max-time 25 -s -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$PAYLOAD" "$URL" -o $TEMP_RESPONSE_FILE)
    CURL_EXIT_CODE=$?

    if [ $CURL_EXIT_CODE -ne 0 ]; then
        if [ $CURL_EXIT_CODE -eq 7 ]; then
            echo "Status Code: $HTTP_CODE (Curl Error: $CURL_EXIT_CODE - Connection refused/failed)" >> $OUTPUT_FILE
            echo "Curl command failed to connect. Server might not be running or accessible." >> $OUTPUT_FILE
        else
            echo "Status Code: $HTTP_CODE (Curl Error: $CURL_EXIT_CODE)" >> $OUTPUT_FILE
        fi
    else
        echo "Status Code: $HTTP_CODE" >> $OUTPUT_FILE
    fi

    echo "Response Body:" >> $OUTPUT_FILE
    cat $TEMP_RESPONSE_FILE >> $OUTPUT_FILE
    echo "" >> $OUTPUT_FILE
    echo "------------------------------------" >> $OUTPUT_FILE
    rm $TEMP_RESPONSE_FILE
}

# Test /generate-quiz endpoint
echo "--- /generate-quiz tests ---" >> $OUTPUT_FILE
run_curl_test "Beginner Quiz" "http://localhost:8000/generate-quiz" '{"topic": "Python lists", "question_number": 2, "level": "beginner"}'
run_curl_test "Intermediate Quiz" "http://localhost:8000/generate-quiz" '{"topic": "Python functions", "question_number": 2, "level": "intermediate"}'
run_curl_test "Advanced Quiz" "http://localhost:8000/generate-quiz" '{"topic": "Python decorators", "question_number": 2, "level": "advanced"}'

# Test /get-explanation endpoint
echo "--- /get-explanation test ---" >> $OUTPUT_FILE
# Corrected payload: "question_number" changed to "num_questions"
run_curl_test "Get Explanation (Intermediate)" "http://localhost:8000/get-explanation" '{"topic": "Python functions", "num_questions": 2, "level": "intermediate", "question_index": 0}'


# Kill the server
echo "Killing server PID: $SERVER_PID" >> $OUTPUT_FILE
if ps -p $SERVER_PID > /dev/null; then
   kill $SERVER_PID
   sleep 2
else
   echo "Server process $SERVER_PID not found." >> $OUTPUT_FILE
fi

echo "Backend tests finished." >> $OUTPUT_FILE
cat $OUTPUT_FILE
