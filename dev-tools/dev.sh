#!/bin/bash

# Simple entry point for the AxioraPulse Development Orchestrator
# Ensures python3 is available to run the main script

set -e

# Colors for output
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Starting AxioraPulse Orchestrator...${NC}"

# Check if python3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed. Please install it to continue."
    exit 1
fi

# Run the orchestrator
python3 "$(dirname "$0")/orchestrate.py" "$@"
