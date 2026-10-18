# Contributing Guidelines

Thank you for your interest in contributing to Personalized Notes.

## Development Workflow

1. Fork the repository and create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Run automated tests before committing:
   ```bash
   npm test
   ```

5. Verify production build:
   ```bash
   npm run build
   ```

## Code Standards

- Architecture: Follow the multi-layer canvas architecture and tool interfaces.
- Performance: Ensure that drawing interactions maintain 60 FPS and avoid DOM thrashing during stroke capture.
- Formatting: Maintain standard JavaScript ES module conventions and clean Vanilla CSS variables.
- Privacy: Never introduce third-party trackers, unvetted external scripts, or API key dependencies.

## Submitting Pull Requests

- Keep commits atomic and focused.
- Ensure all automated unit tests pass.
- Provide a clear explanation of changes and test results in the pull request description.
