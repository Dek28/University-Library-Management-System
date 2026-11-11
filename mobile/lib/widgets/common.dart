import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../state/auth_provider.dart';

void showMessage(BuildContext context, String message, {bool error = false}) {
  final scheme = Theme.of(context).colorScheme;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? scheme.error : null,
    ));
}

String errorText(Object e) => e is ApiException ? e.message : 'Something went wrong';

/// Colours a status string the same way the web app's badges do.
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final String status;

  static Color colorFor(String status) {
    switch (status) {
      case 'active':
      case 'available':
      case 'cleared':
      case 'paid':
      case 'ready':
      case 'completed':
      case 'present':
        return Colors.green;
      case 'overdue':
      case 'outstanding':
      case 'lost':
      case 'blocked':
      case 'rejected':
      case 'damaged':
        return Colors.red;
      case 'pending':
      case 'partially_paid':
      case 'borrowed':
      case 'reserved':
        return Colors.orange;
      default:
        return Colors.blueGrey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = colorFor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(humanize(status),
          style: TextStyle(color: color.shade700ish, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

extension on Color {
  /// A readable foreground for the tinted chip background.
  Color get shade700ish => Color.alphaBlend(Colors.black.withOpacity(0.25), this);
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.cloud_off, size: 40, color: Theme.of(context).colorScheme.error),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ]),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.message, this.icon = Icons.inbox_outlined});

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 44, color: Colors.grey),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.grey)),
        ]),
      ),
    );
  }
}

/// A book cover, or a placeholder when the record has none.
class Cover extends StatelessWidget {
  const Cover(this.path, {super.key, this.width = 48, this.height = 64});

  final String? path;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    final url = context.read<AuthProvider>().config.absolute(path);
    final placeholder = Container(
      width: width,
      height: height,
      color: Colors.grey.shade200,
      child: Icon(Icons.menu_book, color: Colors.grey.shade400, size: width * 0.5),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: url == null
          ? placeholder
          : Image.network(url, width: width, height: height, fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => placeholder),
    );
  }
}

typedef PageFetcher = Future<Paged> Function(int page);

/// An infinite-scrolling, pull-to-refresh list over a paginated endpoint.
/// Change [reloadKey] (for example when a filter changes) to start over.
class PagedList extends StatefulWidget {
  const PagedList({
    super.key,
    required this.fetch,
    required this.itemBuilder,
    this.reloadKey,
    this.emptyMessage = 'Nothing here yet',
    this.emptyIcon = Icons.inbox_outlined,
    this.padding = const EdgeInsets.fromLTRB(12, 8, 12, 24),
  });

  final PageFetcher fetch;
  final Widget Function(BuildContext context, dynamic item) itemBuilder;
  final Object? reloadKey;
  final String emptyMessage;
  final IconData emptyIcon;
  final EdgeInsets padding;

  @override
  State<PagedList> createState() => PagedListState();
}

class PagedListState extends State<PagedList> {
  final _scroll = ScrollController();
  final List<dynamic> _items = [];
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
    reload();
  }

  @override
  void didUpdateWidget(PagedList old) {
    super.didUpdateWidget(old);
    if (old.reloadKey != widget.reloadKey) reload();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Drops items locally, for example after a swipe-to-delete.
  void removeWhere(bool Function(dynamic item) test) => setState(() => _items.removeWhere(test));

  Future<void> reload() async {
    _items.clear();
    _page = 0;
    _hasMore = true;
    _error = null;
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    setState(() => _loading = true);
    try {
      final next = await widget.fetch(_page + 1);
      _items.addAll(next.items);
      _page = next.page;
      _hasMore = next.hasMore;
      _error = null;
    } catch (e) {
      _error = errorText(e);
      _hasMore = false;
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_items.isEmpty) {
      if (_loading) return const Center(child: CircularProgressIndicator());
      if (_error != null) return ErrorView(message: _error!, onRetry: reload);
      return RefreshIndicator(
        onRefresh: reload,
        child: ListView(children: [
          SizedBox(
            height: 320,
            child: EmptyView(message: widget.emptyMessage, icon: widget.emptyIcon),
          ),
        ]),
      );
    }
    return RefreshIndicator(
      onRefresh: reload,
      child: ListView.builder(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: widget.padding,
        itemCount: _items.length + (_loading || _error != null ? 1 : 0),
        itemBuilder: (context, index) {
          if (index >= _items.length) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: _error != null
                    ? TextButton(onPressed: () { _hasMore = true; _loadMore(); }, child: Text('$_error — tap to retry'))
                    : const CircularProgressIndicator(),
              ),
            );
          }
          return widget.itemBuilder(context, _items[index]);
        },
      ),
    );
  }
}

/// Loads one value and rebuilds with loading / error / data states.
class AsyncBody<T> extends StatefulWidget {
  const AsyncBody({super.key, required this.load, required this.builder});

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() refresh) builder;

  @override
  State<AsyncBody<T>> createState() => _AsyncBodyState<T>();
}

class _AsyncBodyState<T> extends State<AsyncBody<T>> {
  T? _data;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = _data == null;
      _error = null;
    });
    try {
      final data = await widget.load();
      if (mounted) setState(() => _data = data);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null && _data == null) return ErrorView(message: _error!, onRetry: _refresh);
    return widget.builder(context, _data as T, _refresh);
  }
}
