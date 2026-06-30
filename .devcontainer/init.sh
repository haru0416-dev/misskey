#!/bin/bash

set -xe

sudo mkdir -p node_modules
sudo chown "$(id -u):$(id -g)" node_modules
sudo apt-get update
sudo apt-get -y install libgtk2.0-0 libgtk-3-0 libgbm-dev libnotify-dev libnss3 libxss1 libasound2 libxtst6 xauth xvfb
git config --global --add safe.directory /workspace
git submodule update --init
bun install --frozen-lockfile
cp .devcontainer/devcontainer.yml .config/default.yml
bun run build
bun run migrate
bun run playwright:install
