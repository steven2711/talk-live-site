#!/bin/bash
set -e

echo "Setting up Claude Flow environment..."

# Install dependencies
npm install
npm install -g @anthropic-ai/claude-code
npx --yes claude-flow@latest init --sparc


# Set up Claude permissions
if command -v claude &> /dev/null; then
    echo "Setting up Claude permissions..."
    claude --dangerously-skip-permissions || true
fi

# Verify installation
echo "Verifying Claude installation..."
if command -v claude &> /dev/null; then
    echo "✅ Claude Code CLI installed successfully"
else
    echo "❌ Claude Code CLI not found"
fi

if command -v ./claude-flow &> /dev/null; then
    echo "✅ Claude-Flow wrapper found"
else
    echo "❌ Claude-Flow wrapper not found"
fi

echo "Claude setup complete!" 