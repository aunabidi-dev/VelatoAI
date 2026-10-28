FROM python:3.11-slim

WORKDIR /app

# Ensure no swap or dumps for PCI compliance
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["python", "run.py"]
