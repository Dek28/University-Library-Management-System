import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _list = GlobalKey<PagedListState>();

  Future<void> _markAll() async {
    try {
      await context.read<AuthProvider>().api.post('/notifications/read-all');
      _list.currentState?.reload();
    } catch (e) {
      if (mounted) showMessage(context, errorText(e), error: true);
    }
  }

  /// Items are rebuilt from the raw JSON on every frame, so the read flag is
  /// written back to that map or it would flip back on the next rebuild.
  Future<void> _markRead(AppNotification n, Map raw) async {
    if (n.isRead) return;
    try {
      await context.read<AuthProvider>().api.post('/notifications/read', body: {'ids': [n.id]});
      setState(() => raw['isRead'] = true);
    } catch (_) {}
  }

  IconData _icon(String severity) {
    switch (severity) {
      case 'critical':
        return Icons.error_outline;
      case 'warning':
        return Icons.warning_amber_outlined;
      default:
        return Icons.info_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [TextButton(onPressed: _markAll, child: const Text('Mark all read'))],
      ),
      body: PagedList(
        key: _list,
        emptyMessage: 'No notifications',
        emptyIcon: Icons.notifications_none,
        fetch: (page) => api.list('/notifications', query: {'page': page, 'limit': 20}),
        itemBuilder: (context, raw) {
          final n = AppNotification.fromJson(Map<String, dynamic>.from(raw as Map));
          final color = n.severity == 'critical'
              ? Colors.red
              : n.severity == 'warning'
                  ? Colors.orange.shade800
                  : Theme.of(context).colorScheme.primary;
          return Dismissible(
            key: ValueKey(n.id),
            direction: DismissDirection.endToStart,
            background: Container(
              color: Colors.red,
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(right: 20),
              child: const Icon(Icons.delete, color: Colors.white),
            ),
            onDismissed: (_) {
              // The row must leave the list in the same frame or Dismissible asserts.
              _list.currentState?.removeWhere((e) => e is Map && (e['id'] ?? e['_id']) == n.id);
              api.delete('/notifications/${n.id}').catchError((_) => null);
            },
            child: Card(
              child: ListTile(
                leading: Icon(_icon(n.severity), color: color),
                title: Text(n.title,
                    style: TextStyle(fontWeight: n.isRead ? FontWeight.normal : FontWeight.bold)),
                subtitle: Text('${n.message}\n${formatDateTime(n.createdAt)}'),
                isThreeLine: true,
                trailing: n.isRead ? null : Icon(Icons.circle, size: 10, color: color),
                onTap: () => _markRead(n, raw as Map),
              ),
            ),
          );
        },
      ),
    );
  }
}
