#!/bin/bash
set -e

# Release script for mcpx
# Usage: ./scripts/release.sh or npm run release or bun run release

echo "🚀 Preparing mcpx release..."

# Check if working directory is clean
if ! git diff --quiet; then
  echo "❌ Working directory has uncommitted changes. Please commit or stash them first."
  exit 1
fi

if ! git diff --staged --quiet; then
  echo "❌ There are staged changes. Please commit them first."
  exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

echo "📦 Current version: $VERSION"

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Tag $TAG already exists. If you want to re-release, delete it first:"
  echo "   git tag -d $TAG && git push --delete origin $TAG"
  exit 1
fi

# Create and push tag
echo "🏷️  Creating tag $TAG..."
git tag "$TAG"
git push origin "$TAG"

# Create GitHub release
echo "📤 Creating GitHub release $TAG..."
gh release create "$TAG" \
  --title "$TAG" \
  --generate-notes \
  --latest

echo "✅ Release completed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. The update-homebrew.yml workflow will automatically update the Homebrew formula"
echo "   2. Check workflow status: gh run list --workflow=update-homebrew.yml"
echo "   3. View release: gh release view $TAG"
