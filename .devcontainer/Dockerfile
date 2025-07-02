FROM mcr.microsoft.com/devcontainers/typescript-node:18-bullseye

# Install additional tools if needed
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/* \

# Set working directory
WORKDIR /workspaces

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm install

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Run claude with dangerously-skip-permissions
RUN claude --dangerously-skip-permissions

# Initialize claude-flow with SPARC
RUN npx claude-flow@latest init --sparc

# Expose ports
EXPOSE 3000 3001