# 1. Base Image
FROM python:3.10-slim

# 2. Working Directory
WORKDIR /app

# 3. Copy requirements.txt
COPY requirements.txt .

# 4. Install Dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy Application Files
COPY app.py .
COPY static/ static/
COPY templates/ templates/

# 6. Expose Port
EXPOSE 5000

# 7. Command
CMD ["python", "app.py"]
