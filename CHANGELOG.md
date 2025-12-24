# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

## [Unreleased]
- TBD

## [1.0.0] - 2025-12-22
### Added
- Overlay auto-import from `rgzr/custom/*.json` and localStorage with upsert by `id` or normalized question text.
- Global overlay toolbar: import/export/clear, upload to server.
- Direct import for Word/PDF/TXT/MD, bundled `mammoth` (docx) and `pdf.js` (pdf).
- Server endpoints: `/custom/index.json` (listing), local-only `/custom/upload` (2MB limit).
- Docs: 覆盖层使用指南、示例模板。
- Security hardening: CSP, X-Frame-Options, COOP/CORP, Referrer-Policy, nosniff, traversal protection.

### Changed
- UI/UX improvements: practice/browse/collect/wrong/stats modes, shuffle options, auto-advance.

### Fixed
- Minor stability and import robustness.

[Unreleased]: https://github.com/C1066g/QuizPilot/compare/main...HEAD
[1.0.0]: https://github.com/C1066g/QuizPilot/releases/tag/v1.0.0
