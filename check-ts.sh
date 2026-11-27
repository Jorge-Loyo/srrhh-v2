#!/bin/bash
export NVM_DIR="/home/jorge_loyo/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 20 --silent
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
npx tsc --project apps/api/tsconfig.build.json --noEmit 2>&1 | head -60
