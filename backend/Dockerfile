# Use Python 3.12 slim image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Expose port 8000
EXPOSE 8000

# Set entrypoint
ENTRYPOINT ["./entrypoint.sh"]