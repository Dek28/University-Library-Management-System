import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'config.dart';

/// A failure normalised into something a screen can show directly.
class ApiException implements Exception {
  ApiException(this.message, {this.status = 0, this.errors = const []});

  final String message;
  final int status;
  final List<dynamic> errors;

  @override
  String toString() => message;
}

/// One page of a list endpoint plus its pagination meta.
class Paged {
  Paged(this.items, {this.page = 1, this.totalPages = 1, this.total = 0});

  final List<dynamic> items;
  final int page;
  final int totalPages;
  final int total;

  bool get hasMore => page < totalPages;
}

/// Talks to the ULMS REST API.
///
/// The access token lives in memory only. The refresh token is kept in the
/// platform keystore (Keychain / EncryptedSharedPreferences) because a phone,
/// unlike a browser, has no HTTP-only cookie to carry the session. The API
/// accepts the refresh token in the request body for exactly this case.
class ApiClient {
  ApiClient(this.config) {
    _build();
  }

  final ServerConfig config;
  final _storage = const FlutterSecureStorage();
  static const _refreshKey = 'ulms_refresh_token';

  late Dio _dio;
  String? _accessToken;
  Future<bool>? _refreshing;

  /// Called once when the refresh token is rejected, so the app can sign out.
  void Function()? onSessionLost;

  void _build() {
    _dio = Dio(BaseOptions(
      baseUrl: config.apiUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Accept': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = _accessToken;
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (error, handler) async {
        final request = error.requestOptions;
        final isAuthCall = request.path.contains('/auth/');
        if (error.response?.statusCode == 401 && !isAuthCall && request.extra['retried'] != true) {
          request.extra['retried'] = true;
          if (await _refreshOnce()) {
            request.headers['Authorization'] = 'Bearer $_accessToken';
            try {
              return handler.resolve(await _dio.fetch(request));
            } on DioException catch (e) {
              return handler.next(e);
            }
          }
          clearSession();
          onSessionLost?.call();
        }
        handler.next(error);
      },
    ));
  }

  /// Rebuilds the HTTP client after the server address changes.
  void reconfigure() => _build();

  bool get hasAccessToken => _accessToken != null;

  void setAccessToken(String? token) => _accessToken = token;

  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  Future<void> storeRefreshToken(String? token) async {
    if (token == null) {
      await _storage.delete(key: _refreshKey);
    } else {
      await _storage.write(key: _refreshKey, value: token);
    }
  }

  void clearSession() {
    _accessToken = null;
    _storage.delete(key: _refreshKey);
  }

  /// Concurrent 401s trigger exactly one refresh; the rest wait for it.
  Future<bool> _refreshOnce() => _refreshing ??= _refresh().whenComplete(() => _refreshing = null);

  Future<bool> _refresh() async {
    final token = await readRefreshToken();
    if (token == null) return false;
    try {
      // A bare client: the main one would loop through its own interceptor.
      final response = await Dio(BaseOptions(
        baseUrl: config.apiUrl,
        connectTimeout: const Duration(seconds: 15),
      )).post('/auth/refresh', data: {'refreshToken': token});
      final data = response.data['data'] as Map<String, dynamic>;
      _accessToken = data['accessToken'] as String?;
      await storeRefreshToken(data['refreshToken'] as String?);
      return _accessToken != null;
    } catch (_) {
      return false;
    }
  }

  /// Restores a session on cold start. Returns the signed-in user JSON, or null.
  Future<Map<String, dynamic>?> restoreSession() async {
    if (!await _refreshOnce()) return null;
    return Map<String, dynamic>.from(await get('/auth/me') as Map);
  }

  // ------------------------------------------------------------------ verbs

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send(() => _dio.get(path, queryParameters: _clean(query)));

  Future<dynamic> post(String path, {Object? body}) => _send(() => _dio.post(path, data: body ?? {}));

  Future<dynamic> patch(String path, {Object? body}) => _send(() => _dio.patch(path, data: body ?? {}));

  Future<dynamic> delete(String path) => _send(() => _dio.delete(path));

  /// For list endpoints that answer with `{ data: [...], meta: {...} }`.
  Future<Paged> list(String path, {Map<String, dynamic>? query}) async {
    try {
      final response = await _dio.get(path, queryParameters: _clean(query));
      final body = response.data as Map<String, dynamic>;
      final meta = (body['meta'] as Map?) ?? const {};
      return Paged(
        List<dynamic>.from(body['data'] as List? ?? const []),
        page: (meta['page'] as num?)?.toInt() ?? 1,
        totalPages: (meta['totalPages'] as num?)?.toInt() ?? 1,
        total: (meta['total'] as num?)?.toInt() ?? 0,
      );
    } on DioException catch (e) {
      throw _toException(e);
    }
  }

  /// Downloads a protected file to [savePath], sending the auth header.
  Future<void> download(String path, String savePath, {Map<String, dynamic>? query}) async {
    try {
      await _dio.download(path, savePath, queryParameters: _clean(query));
    } on DioException catch (e) {
      throw _toException(e);
    }
  }

  // ---------------------------------------------------------------- helpers

  Map<String, dynamic>? _clean(Map<String, dynamic>? query) {
    if (query == null) return null;
    return Map.fromEntries(query.entries.where((e) => e.value != null && e.value.toString().isNotEmpty));
  }

  Future<dynamic> _send(Future<Response> Function() call) async {
    try {
      final response = await call();
      final body = response.data;
      return body is Map<String, dynamic> ? body['data'] : body;
    } on DioException catch (e) {
      throw _toException(e);
    }
  }

  ApiException _toException(DioException e) {
    final status = e.response?.statusCode ?? 0;
    final data = e.response?.data;
    if (data is Map && data['message'] is String) {
      return ApiException(data['message'] as String,
          status: status, errors: List<dynamic>.from(data['errors'] as List? ?? const []));
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return ApiException('The request timed out. Check your connection.');
      case DioExceptionType.connectionError:
        return ApiException('Cannot reach the server at ${config.baseUrl}. Check the address and your connection.');
      default:
        return ApiException(status == 0 ? 'Something went wrong' : 'Request failed ($status)', status: status);
    }
  }
}
