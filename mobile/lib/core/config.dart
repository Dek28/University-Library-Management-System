import 'dart:io' show Platform;

import 'package:shared_preferences/shared_preferences.dart';

/// Where the ULMS API lives. The user can change it from the sign-in screen,
/// so one build works against a laptop on the LAN, staging or production.
class ServerConfig {
  static const _key = 'ulms_server_url';

  /// The Android emulator reaches the host machine at 10.0.2.2; the iOS
  /// simulator and desktop use localhost.
  static String get defaultUrl {
    try {
      if (Platform.isAndroid) return 'http://10.0.2.2:5000';
    } catch (_) {}
    return 'http://localhost:5000';
  }

  String baseUrl = defaultUrl;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    baseUrl = prefs.getString(_key) ?? defaultUrl;
  }

  Future<void> save(String url) async {
    baseUrl = normalize(url);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, baseUrl);
  }

  /// Trims whitespace and trailing slashes, and tolerates a pasted `/api/v1`.
  static String normalize(String url) {
    var value = url.trim();
    value = value.replaceAll(RegExp(r'/+$'), '');
    value = value.replaceAll(RegExp(r'/api/v1$'), '');
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      value = 'http://$value';
    }
    return value;
  }

  String get apiUrl => '$baseUrl/api/v1';

  /// Cover images are stored as server-relative paths such as `/uploads/covers/x.jpg`.
  String? absolute(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return '$baseUrl${path.startsWith('/') ? '' : '/'}$path';
  }
}
