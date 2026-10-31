# Google Calendar development setup

TODOer+ uses a Google **Desktop app** OAuth client and calls Google directly from Rust. No hosted backend is required.

1. Create a Google Cloud project, enable Google Calendar API, and configure an external OAuth consent screen.
2. Create a Desktop app OAuth client. Add your Google account as a test user while the consent screen is in Testing.
3. Set `TODOER_GOOGLE_CLIENT_ID` before building or starting Tauri. If the downloaded Desktop configuration includes a client secret, set `TODOER_GOOGLE_CLIENT_SECRET` too. Installed desktop clients cannot keep a client secret confidential; PKCE and state protect the sign-in flow.
4. Run `npm run tauri:dev:plus`. The development Google tab in Calendar Settings connects the account.

The requested scopes are `openid`, `email`, and `https://www.googleapis.com/auth/calendar.app.created`. Sign-in uses the system browser and a temporary `127.0.0.1` listener. Refresh credentials remain in Windows Credential Manager or macOS Keychain; tokens are never returned to React.

Use separate Google projects/clients for development and production. Public distribution requires the production consent screen, support contact, privacy policy, domain configuration, and any applicable Google verification. Testing-mode refresh credentials can expire; that is not a production configuration.

Live Google consent and OS credential prompts must be checked on Windows and macOS with configured OAuth clients before release.
