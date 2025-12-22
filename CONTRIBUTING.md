# Contributing to Final-review

Thanks for taking the time to contribute! Please follow the guidelines below to help us keep things running smoothly.

## Development setup
- Requirements: Node.js >= 14 (recommend 18+)
- Start dev server:
  - `cd rgzr`
  - `npm run start:dev`
  - Open `http://localhost:8001`

## Project structure
- `rgzr/` front-end and local Node server
- `rgzr/custom/` overlay JSON directory (runtime JSON ignored by Git)
- `rgzr/lib/` docx/pdf parsing libs (mammoth, pdf.js)
- `docs/` guides and how-tos

## Submitting changes
1. Fork the repo and create your branch from `main`.
2. Use Conventional Commits for commit messages:
   - `feat(scope): summary`
   - `fix(scope): summary`
   - `docs: ...`, `chore: ...`, `refactor: ...`
3. Ensure the app starts locally and basic smoke tests pass:
   - Open `/` and `/custom/index.json`
4. Submit a Pull Request:
   - Describe changes, screenshots, and test steps.
   - Link related issues.

## Coding style
- Keep the code simple and readable.
- Prefer small, focused changes.
- Avoid introducing heavy dependencies.

## Overlay data format
- See `docs/覆盖层使用指南.md` for JSON schema and merging rules.

## Reporting bugs and requesting features
- Use issue templates under GitHub Issues.
- Include reproducible steps and environment details.

Thanks again for your contributions! 🙌
