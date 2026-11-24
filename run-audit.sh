#!/bin/bash
NVM_NODE="/home/jorge_loyo/.nvm/versions/node/v20.20.2/bin"
export PATH="$NVM_NODE:$PATH"
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
# Buscar tsx
find . -name "tsx" -path "*/node_modules/.bin/*" 2>/dev/null | head -5
