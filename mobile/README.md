# ULMS Mobile (Flutter)

Mobile client for the University Library Management System. It talks to the
existing **Node.js / Express / MongoDB** API in `../backend` (`/api/v1`), so
there is one backend and one database for the web and mobile apps.

## What it does

| Area | Screens |
| --- | --- |
| Account | Sign in (email, registration or staff number), forgot/reset password with emailed code, change password, profile, sign out |
| Home | Member dashboard (loans, due soon, overdue, fine balance, holds, recommendations); headline figures for librarians/admins |
| Catalogue | Search with type filters, book details, copies, reserve when all copies are out |
| My library | Loans (filter, renew), reservations (queue position, cancel), fines (read-only; paid at the desk) |
| Digital library | Search the repository, download and open PDFs/documents in an installed app |
| More | Notifications (read, swipe to delete), clearance request, reading groups and sessions |
| Staff | Circulation desk: issue and return by member number and accession number or barcode |

Menus follow the permissions the API returns for the account; the server still
enforces every rule. Administration, reports, purchase orders, inventory and
user management stay in the web console.

## Setup

Requires the Flutter SDK (3.19 or newer), the backend running, and MongoDB.

```powershell
# 1. Backend (once): see ../README.md, then
cd backend
npm install
npm run seed
npm run dev

# 2. Mobile
cd ../mobile
./setup.ps1      # generates android/ and ios/, runs pub get, patches the Android manifest
flutter run
```

`setup.ps1` runs `flutter create` around the existing sources and adds the
`INTERNET` permission and (for development only) cleartext HTTP to the Android
manifest. On iOS, allow plain HTTP for a development server by adding
`NSAppTransportSecurity > NSAllowsArbitraryLoads = true` to `ios/Runner/Info.plist`.
Remove both for a production build and use an `https://` API.

### Server address

Set it on the sign-in screen (bottom link). Defaults:

* Android emulator: `http://10.0.2.2:5000`
* iOS simulator / desktop: `http://localhost:5000`
* Physical phone: `http://<your computer's LAN IP>:5000`, on the same Wi-Fi, with
  the firewall allowing port 5000.

No CORS change is needed: native requests send no `Origin` header, which the API allows.

## How authentication works on mobile

The web app keeps the refresh token in an HTTP-only cookie. A phone has none,
so the API returns the refresh token in the login response and accepts it in the
body of `/auth/refresh` and `/auth/logout`. The app keeps it in the platform
keystore (`flutter_secure_storage`), holds the access token in memory only, and
refreshes once on a 401 before retrying the request.

## Layout

```
lib/
  core/      config (server URL), api_client (Dio, refresh), format, permissions
  models/    typed API payloads
  state/     AuthProvider (session, settings, permissions)
  widgets/   PagedList, AsyncBody, StatusChip, Cover
  screens/   one file per screen
test/        unit tests for config, formatting and model parsing
```

## Status

Written against the API as it exists in this repository. It has **not** been
compiled or run yet (the Flutter SDK was not available where it was written), so
expect to fix a few analyzer messages on the first `flutter analyze` and run
`flutter test` once.
