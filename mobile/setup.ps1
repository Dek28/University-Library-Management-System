# One-time setup for the ULMS mobile app.
#
# The repository holds only the Dart sources (lib/, pubspec.yaml). This script
# generates the android/ and ios/ platform projects around them, then patches
# the Android manifest so the app can reach the API over the network.
#
#   cd mobile
#   ./setup.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  throw 'Flutter SDK not found on PATH. Install it from https://docs.flutter.dev/get-started/install'
}

# --project-name keeps the package name the sources import (package:ulms_mobile/...).
flutter create --platforms=android,ios --org edu.ulms --project-name ulms_mobile .
flutter pub get

$manifest = 'android/app/src/main/AndroidManifest.xml'
$xml = Get-Content $manifest -Raw

# Flutter's template grants INTERNET only to debug/profile builds; release needs it too.
if ($xml -notmatch 'android.permission.INTERNET') {
  $xml = $xml -replace '(<application)', "<uses-permission android:name=`"android.permission.INTERNET`"/>`r`n    `$1"
}

# Development servers are plain http on the LAN. Remove this line (and use an
# https API URL) for a production build.
if ($xml -notmatch 'usesCleartextTraffic') {
  $xml = $xml -replace '(<application)', "`$1 android:usesCleartextTraffic=`"true`""
}

Set-Content -Path $manifest -Value $xml -Encoding UTF8
Write-Host 'Done. Start the API, then run: flutter run'
