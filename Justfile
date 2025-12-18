set shell := ["fish", "-c"]

# List available recipes
default:
  @just --list

# Format (Prettier)
fmt:
  npx prettier --check . && npx prettier --write .

# Register
reg:
  curl https://your-worker.workers.dev/registerWebhook
  curl https://your-worker.workers.dev/registerCommands
