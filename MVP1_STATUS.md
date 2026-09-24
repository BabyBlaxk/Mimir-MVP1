# MVP 1 status

## Working

- First-run Founder setup
- Login / logout with hashed passwords and signed sessions
- The Well dashboard
- AI chat with conversation history
- Provider abstraction + local fallback
- Long-term memory create / search / delete
- The Domain explanation and L0–L4 model
- Approvals queue (create, approve, deny)
- Audit log
- The Vault frame (explicitly non-transactional)
- The Forge projects (create, edit, archive)
- The Root settings, flags, oath, provider status
- Mirror proposals and conservative status flow
- System health endpoint
- PWA manifest, icons, service worker shell
- SQLite persistence across restart
- Docker Compose deploy path
- Voice input/output in supported browsers while the tab is open

## Partial

- Streaming model tokens (request/response is complete-turn only)
- WebAuthn / passkeys (architecture reserved; password is the MVP factor)
- Tool calling beyond memory/projects/approvals
- Usage metering is provider-side only
- Offline PWA is shell-only; APIs need the network
- Multi-user is out of scope (single Founder)

## Future

- Native iOS / wearable always-available voice
- PostgreSQL adapter
- Real finance integrations behind L4
- Sandbox code execution and comparison diffs
- Trusted-device register
- Background agents

## Not implemented

- Autonomous money movement
- Silent production self-deploy of security controls
- 24/7 background microphone on iPhone PWA
- Client-side API keys
