# Use Python 3.12 slim image. Pin Bookworm because the current Trixie
# variant can fail with "exec format error" on some Docker Desktop/WSL2 setups.
FROM python:3.12-slim-bookworm

# Install system dependencies (ffmpeg is required by whisper for audio transcription).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
ARG PIP_EXTRA_INDEX_URL=""
ENV PIP_EXTRA_INDEX_URL=$PIP_EXTRA_INDEX_URL

# Install CPU-only PyTorch first. The default PyPI torch wheel pulls the entire
# CUDA stack (nvidia-* libraries + a ~197 MB triton wheel) that this CPU-only
# container never uses and that frequently times out mid-download. The CPU wheel
# (torch==2.12.0+cpu, which satisfies the torch==2.12.0 pin below) has none of
# those deps. --retries/--timeout add resilience to transient network blips.
RUN pip install --no-cache-dir --retries 5 --timeout 300 \
        torch==2.12.0 \
        --index-url https://download.pytorch.org/whl/cpu \
        --extra-index-url https://pypi.org/simple \
 && pip install --no-cache-dir --retries 5 --timeout 300 -r requirements.txt

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
