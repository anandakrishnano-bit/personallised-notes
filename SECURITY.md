# Security Policy

## Security Model

Personalized Notes operates entirely client-side. The application does not collect, transmit, or store user data on external servers.

### Architectural Principles
- Client-Side Privacy: All notes, strokes, and images are stored locally in the browser's IndexedDB.
- Zero External Telemetry: No third-party tracking scripts, analytics, or behavioral telemetry are embedded.
- Hardened HTTP Headers: The application serves strict Content Security Policy (CSP), anti-clickjacking frame guards, and restricted permission directives.
- Zero API Dependencies: The application requires no external backend services, credentials, or API keys to operate.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | Yes                |

## Reporting a Vulnerability

If you discover a security vulnerability or have a security concern:
1. Please open a security advisory on GitHub or report it via repository issues.
2. Provide detailed steps to reproduce the issue along with the expected and actual behavior.
3. Reports are reviewed and addressed promptly.
