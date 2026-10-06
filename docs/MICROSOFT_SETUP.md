# School Microsoft sign-in

Students may use an administrator-created local account or a preapproved school Microsoft Entra identity. Administrators and teachers use local accounts. School identity is matched by the verified tenant ID and object ID, never by email. CLASO records the full `name` claim at sign-in; school IT must maintain complete names in the directory.

## Register the application

1. A school Entra administrator creates an app registration for **Accounts in this organizational directory only**. Do not select personal accounts or multiple organizations.
2. Add a **Web** redirect URI: `https://YOUR-SCHOOL-ORIGIN/api/auth/microsoft/callback`. It must match `APP_ORIGIN` exactly, including any port. The preview's temporary hostname may change; a stable school hostname is recommended before real use.
3. In Token configuration, add the optional **ID token** claim `acct`. CLASO requires `acct=0` for members and rejects guests or a missing claim. The registration manifest can express this as `optionalClaims.idToken: [{"name":"acct","source":null,"essential":true,"additionalProperties":[]}]`.
4. Create a client secret and place its **value** in secure server environment configuration as `MICROSOFT_CLIENT_SECRET`. Never put it in frontend variables, Git, screenshots, Slack or documentation. Monitor its expiration and rotate it through deployment configuration.
5. Set `MICROSOFT_TENANT_ID` to the Directory (tenant) UUID, `MICROSOFT_CLIENT_ID` to the Application (client) UUID, and `APP_ORIGIN` to the public HTTPS origin. Restart the server after configuration changes.
6. In Enterprise applications, require user assignment and assign the school's student group. This limits who in the school directory may open a new student account. CLASO never derives elevated roles from provider claims.
7. In CLASO, the administrator opens People → Students → Create Microsoft student account, enters the student's full name, UPN and immutable Object ID from the configured tenant, then enrolls the student in classes. Test with that assigned student. Check the full name, student role and empty initial academic scope. An administrator then enrolls the student in the correct classes.

Only `openid profile email` is requested. Microsoft Graph access, offline refresh tokens, directory-write permissions and application-wide Graph permissions are not needed. CLASO does not store Microsoft access/refresh/ID tokens after sign-in.

## Security and recovery

The authorization-code flow uses PKCE S256, nonce, state, a browser-bound HttpOnly Secure SameSite=Lax transaction cookie, and ten-minute single-use server transactions. The OIDC library verifies signature, issuer, audience, expiration and nonce. Normal CLASO sessions remain HttpOnly Secure SameSite=Strict with CSRF validation. An approved directory identity always remains in the `student` role. Microsoft sign-in never creates a new account. There is no email-based linking to existing local accounts. An email collision is rejected for administrator investigation; it never takes over an existing account.

Archiving a student revokes CLASO access while preserving history. Microsoft password recovery belongs to school IT. Entra disabling a user prevents future sign-ins; existing CLASO sessions expire after eight hours unless the CLASO administrator archives the account sooner. Configure school procedures accordingly.

Local student accounts and imports are available to administrators. Microsoft accounts must be explicitly created by an administrator with the immutable Object ID; an existing local student is never automatically linked by email. Existing local records remain intact. Converting an established local identity requires a separately reviewed mapping, without losing its academic history.

## Verification and limitations

Automated tests exercise real signed-token validation with an isolated HTTPS transport fixture, including bad signatures, nonce, audience, issuer, expiry, browser binding, replay and PKCE. CodeRabbit emulate v0.0.1 supports Microsoft discovery, token exchange and RS256 keys, but does not emit the required `acct` member claim. Its token exchange was tested and its incomplete identity correctly rejected. This does not replace acceptance testing against the school's actual Entra tenant and conditional-access policies.

Official references: [OpenID Connect sign-in](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc), [optional claims](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference), [openid-client example](https://github.com/panva/openid-client/blob/main/examples/oidc.ts).
