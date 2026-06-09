# Use Python 3.12 slim image
FROM python:3.12-slim

# Install system dependencies (ffmpeg is required by whisper)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
ARG PIP_EXTRA_INDEX_URL=""
ENV PIP_EXTRA_INDEX_URL=$PIP_EXTRA_INDEX_URL
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Normalize Windows line endings and keep the entrypoint outside mounted source
RUN sed -i 's/\r$//' entrypoint.sh \
    && cp entrypoint.sh /usr/local/bin/axiorapulse-entrypoint.sh \
    && chmod +x /usr/local/bin/axiorapulse-entrypoint.sh

# Expose port 8000
EXPOSE 8000

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/axiorapulse-entrypoint.sh"]
