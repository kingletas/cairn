SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

ROOT_DIR := $(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))
PREFIX ?= $(HOME)/bin

# --- getting started ---------------------------------------------------------

.PHONY: help
help: ## List what you can run
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: deps
deps: ## Install everything the build needs
	npm ci || npm install

.PHONY: build
build: ## Build the key module, the tokens and the app
	npm run native
	npm run build

.PHONY: run
run: build ## Build, then start Cairn from this checkout
	npx electron .

.PHONY: install
install: ## Put the launcher on PATH, with a desktop entry and icon
	@scripts/install.sh $(PREFIX)

.PHONY: sandbox
sandbox: ## Print the one privileged command Chromium's sandbox needs
	@CAIRN_HOME=$(ROOT_DIR) $(ROOT_DIR)/bin/cairn --check-sandbox || true

.PHONY: uninstall
uninstall: ## Remove what install placed. Your vault is not touched
	@scripts/uninstall.sh $(PREFIX)

# --- checks ------------------------------------------------------------------

.PHONY: check
check: ## Everything a commit has to pass
	npm run theme:check
	npm run typecheck
	npm run lint
	shellcheck packaging/release-notes.sh scripts/*.sh bin/cairn
	cargo fmt --manifest-path crates/cairn-keyring/Cargo.toml --check
	cargo clippy --manifest-path crates/cairn-keyring/Cargo.toml -- -D warnings
	npm run build
	npm test

.PHONY: theme
theme: ## Rebuild the stylesheet from defaults/theme/cairn.json
	npm run theme

.PHONY: fmt
fmt: ## Format the Rust
	cargo fmt --manifest-path crates/cairn-keyring/Cargo.toml

# --- release -----------------------------------------------------------------

.PHONY: package
package: build ## Build a distributable for this platform
	@scripts/package.sh

.PHONY: icons
icons: ## Redraw the packaging icons from the one SVG
	@command -v convert >/dev/null || { echo "icons: ImageMagick is not installed" >&2; exit 2; }
	@mkdir -p build/icons
	@for size in 16 32 48 64 128 256 512; do \
	  convert -background none -density 1200 -resize $${size}x$${size} \
	    data/com.kingletas.Cairn.svg build/icons/$${size}x$${size}.png; \
	done
	@echo "icons: redrawn into build/icons"

.PHONY: clean
clean: ## Remove build output
	rm -rf dist native release target node_modules/.cache
