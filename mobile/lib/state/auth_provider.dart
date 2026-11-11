import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../models/models.dart';

enum AuthStatus { loading, signedOut, signedIn }

/// Session and library-wide settings. Screens read the user's permissions from
/// here to decide what to offer; the API still enforces every rule.
class AuthProvider extends ChangeNotifier {
  AuthProvider() {
    api = ApiClient(config);
    api.onSessionLost = _sessionLost;
  }

  final ServerConfig config = ServerConfig();
  late final ApiClient api;

  AuthStatus status = AuthStatus.loading;
  AppUser? user;

  bool finesEnabled = true;
  String currency = r'$';
  String libraryName = 'University Library';

  bool can(String permission) => user?.permissions.contains(permission) ?? false;
  bool canAny(List<String> permissions) => permissions.any(can);

  /// Cold start: restore the saved server address and, if possible, the session.
  Future<void> bootstrap() async {
    await config.load();
    api.reconfigure();
    try {
      final json = await api.restoreSession();
      if (json == null) {
        status = AuthStatus.signedOut;
      } else {
        user = AppUser.fromJson(json);
        status = AuthStatus.signedIn;
        await loadSettings();
      }
    } catch (_) {
      status = AuthStatus.signedOut;
    }
    notifyListeners();
  }

  Future<void> setServer(String url) async {
    await config.save(url);
    api.reconfigure();
    await loadSettings();
    notifyListeners();
  }

  Future<void> loadSettings() async {
    try {
      final data = await api.get('/settings/public');
      if (data is Map) {
        final circulation = data['circulation'];
        if (circulation is Map && circulation['finesEnabled'] != null) {
          finesEnabled = circulation['finesEnabled'] != false;
        }
        final locale = data['locale'];
        if (locale is Map && locale['currencySymbol'] != null) {
          currency = locale['currencySymbol'].toString();
        }
        final library = data['library'] ?? data['general'];
        if (library is Map && (library['name'] ?? library['libraryName']) != null) {
          libraryName = (library['name'] ?? library['libraryName']).toString();
        }
      }
    } catch (_) {
      // Settings only tune the UI; the defaults are safe.
    }
  }

  Future<void> login(String identifier, String password) async {
    final data = await api.post('/auth/login', body: {'identifier': identifier.trim(), 'password': password});
    api.setAccessToken(data['accessToken'] as String?);
    await api.storeRefreshToken(data['refreshToken'] as String?);
    user = AppUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    status = AuthStatus.signedIn;
    await loadSettings();
    notifyListeners();
  }

  Future<void> reloadProfile() async {
    user = AppUser.fromJson(Map<String, dynamic>.from(await api.get('/auth/me') as Map));
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      final token = await api.readRefreshToken();
      await api.post('/auth/logout', body: {'refreshToken': token});
    } catch (_) {
      // Signing out locally must work even when the server is unreachable.
    }
    _clear();
  }

  /// The password change revokes every session, so the user signs in again.
  void endSession() => _clear();

  void _sessionLost() => _clear();

  void _clear() {
    api.clearSession();
    user = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }
}
