.PHONY: help install dev build preview clean generate-test-pdf generate-raw-pdf

# Default target
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install

dev: ## Start Vite dev server
	npm run dev

build: ## Build for production
	npm run build

preview: ## Preview production build
	npm run preview

generate-test-pdf: ## Generate test PDF with redaction issues
	npm run generate-test-pdf

generate-raw-pdf: ## Generate raw test PDF
	npm run generate-raw-pdf

clean: ## Remove build artifacts
	rm -rf dist node_modules/.vite tsconfig.tsbuildinfo
