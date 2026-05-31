# Contributing to Japan Disaster Alert

Thank you for your interest in contributing! Japan Disaster Alert is an open-source,
[MIT-licensed](LICENSE) multilingual disaster information system, and contributions of all
kinds are welcome — bug reports, feature suggestions, documentation improvements, and code.

## Reporting Issues

Please use [GitHub Issues](https://github.com/TTMK7777/Japan-Disaster-Alert-v2/issues) to
report bugs or request features.

When filing a **bug report**, please include:

- A clear description of the problem and what you expected to happen
- Steps to reproduce
- Whether it affects the backend, the frontend, or both
- Relevant environment details (OS, Python version, Node.js version, browser)
- Any error messages or logs (please redact secrets and personal data)

For a **feature request**, describe the use case and why it would be valuable, especially
how it helps foreign residents and tourists during disasters.

## Development Setup

The project has two layers: a Python (FastAPI) backend and a Next.js frontend.

### Backend (Python 3.11+)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # Edit .env with your settings
python run.py                  # Starts the API at http://localhost:8000
```

Run the backend tests with pytest:

```bash
cd backend
pytest tests/ -v               # 38 tests
```

> Tip: AI API keys are optional. The system runs without them using the built-in static
> location translation table.

### Frontend (Next.js 15 / React 19)

```bash
cd frontend
npm install
npm run dev                    # Starts the app at http://localhost:3001
```

Run the unit tests (Vitest) and end-to-end tests (Playwright):

```bash
cd frontend
npm run test:run               # Vitest unit tests
npx playwright install chromium
npm run test:e2e               # Playwright E2E tests
```

## Pull Request Workflow

1. Branch from `main` — please do **not** push directly to `main`.
2. Keep each pull request focused on a single, well-described change.
3. Make sure the relevant tests pass (pytest for the backend, Vitest and Playwright for the
   frontend).
4. Update documentation when behavior, configuration, or commands change.
5. Open a pull request against `main` and describe what changed and why.

## Coding Conventions

- Follow the existing code style and structure in each layer.
- When you change an API, update the shared TypeScript type definitions in
  `frontend/src/types/`.
- User-facing strings must support all 16 languages (`frontend/src/i18n/`).
- Define backend exceptions in `backend/app/exceptions.py`.
- Lint the frontend with `npm run lint` before submitting.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are
expected to uphold it.
