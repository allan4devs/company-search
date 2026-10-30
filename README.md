# Comp

A company directory for researching engineering employers, filtering role evidence, and saving likes, dislikes, and careers links.

## Run locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

On Windows PowerShell, use `npm.cmd` if script execution blocks `npm.ps1`:

```powershell
npm.cmd install
npm.cmd run dev
```

Open <http://localhost:3000>. The public catalog and browser-local preferences work without a database configuration.

## Optional account sync

MongoDB-backed admin preferences require `MONGODB_URI` and an `ADMIN_JWT_SECRET` used by the host application to sign the `b2b_admin_token` cookie. `MONGODB_DB` is optional and defaults to `lva`. Without MongoDB or an admin token, preferences stay in the current browser.

## Checks

```bash
npm run lint
npm run build
```
