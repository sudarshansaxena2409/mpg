#!/usr/bin/env bash

set -e

# Styling colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}   🚀 MPA: Multiplayer Agent Session Setup          ${NC}"
echo -e "${CYAN}====================================================${NC}\n"

# 1. Check Node.js installation
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed.${NC}"
    echo "Please install Node.js (v22 or newer recommended) from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js found: ${NODE_VERSION}${NC}"

# 2. Install dependencies
echo -e "\n${YELLOW}📦 Installing root dependencies...${NC}"
npm install --quiet

echo -e "${YELLOW}📦 Installing SpacetimeDB dependencies...${NC}"
(cd spacetimedb && npm install --quiet)

# 3. Type check & build
echo -e "\n${YELLOW}🛠 Building project...${NC}"
npm run build --quiet
echo -e "${GREEN}✓ Build completed successfully!${NC}\n"

# 4. Handle direct command arguments if passed (e.g. ./setup.sh join <session_id> --as alice)
if [ "$#" -gt 0 ]; then
    echo -e "${GREEN}🚀 Launching MPA session with provided arguments...${NC}\n"
    npm run dev -- "$@"
    exit 0
fi

# 5. Interactive Mode
echo -e "${CYAN}How would you like to proceed?${NC}"
echo "  1) Join an existing session (Collaborator)"
echo "  2) Host a new session (Host)"
echo "  3) Setup only (Exit)"
echo ""
read -p "Select option (1-3): " CHOICE

case "$CHOICE" in
    1)
        read -p "Enter Session ID to join: " SESSION_ID
        read -p "Enter your name (e.g. alice): " USER_NAME
        if [ -z "$SESSION_ID" ] || [ -z "$USER_NAME" ]; then
            echo -e "${RED}❌ Session ID and Name are required.${NC}"
            exit 1
        fi
        echo -e "\n${GREEN}🔗 Joining session '${SESSION_ID}' as '${USER_NAME}'...${NC}\n"
        npm run dev -- join "$SESSION_ID" --as "$USER_NAME"
        ;;
    2)
        read -p "Enter session title: " SESSION_TITLE
        read -p "Enter your name (e.g. shub): " USER_NAME
        SESSION_TITLE=${SESSION_TITLE:-"Pairing Session"}
        USER_NAME=${USER_NAME:-"host"}
        
        if ! command -v codex &> /dev/null && [ ! -f "$HOME/.local/bin/codex" ]; then
            echo -e "${YELLOW}⚠️ Warning: 'codex' CLI was not found in PATH.${NC}"
            echo "Hosting requires Codex CLI logged in (codex login)."
        fi
        
        echo -e "\n${GREEN}👑 Creating new session '${SESSION_TITLE}' as '${USER_NAME}'...${NC}\n"
        npm run dev -- new "$SESSION_TITLE" --as "$USER_NAME"
        ;;
    3)
        echo -e "${GREEN}✓ Setup complete! You are ready to run mpa.${NC}"
        echo "Example join command: npm run dev -- join <session-id> --as alice"
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac
