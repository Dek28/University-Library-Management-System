import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/permissions.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';

class ResourceDetailScreen extends StatefulWidget {
  const ResourceDetailScreen({super.key, required this.id});

  final String id;

  @override
  State<ResourceDetailScreen> createState() => _ResourceDetailScreenState();
}

class _ResourceDetailScreenState extends State<ResourceDetailScreen> {
  bool _busy = false;

  Future<void> _reserve() async {
    setState(() => _busy = true);
    try {
      await context.read<AuthProvider>().api.post('/reservations', body: {'resource': widget.id});
      if (mounted) showMessage(context, 'Reservation placed. You will be notified when a copy is ready.');
    } catch (e) {
      if (mounted) showMessage(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Book details')),
      body: AsyncBody<Resource>(
        load: () async => Resource.fromJson(Map<String, dynamic>.from(await auth.api.get('/resources/${widget.id}') as Map)),
        builder: (context, r, refresh) {
          final canReserve =
              auth.can(Perm.reservationCreateOwn) && r.availableCopies == 0 && r.isBorrowable;
          return RefreshIndicator(
            onRefresh: refresh,
            child: ListView(padding: const EdgeInsets.all(16), children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Cover(r.coverImage, width: 110, height: 150),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(r.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                    if (r.subtitle.isNotEmpty) Text(r.subtitle, style: const TextStyle(color: Colors.grey)),
                    const SizedBox(height: 6),
                    if (r.authors.isNotEmpty) Text(r.authorLine),
                    const SizedBox(height: 8),
                    StatusChip(r.availableCopies > 0 ? 'available' : 'borrowed'),
                    const SizedBox(height: 4),
                    Text('${r.availableCopies} of ${r.totalCopies} copies available',
                        style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  ]),
                ),
              ]),
              const SizedBox(height: 16),
              if (canReserve)
                FilledButton.icon(
                  onPressed: _busy ? null : _reserve,
                  icon: const Icon(Icons.bookmark_add_outlined),
                  label: const Text('Reserve this item'),
                ),
              if (r.description.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(r.description),
              ],
              const SizedBox(height: 16),
              Card(
                child: Column(children: [
                  _row('Type', humanize(r.type)),
                  _row('Category', r.category),
                  _row('Publisher', r.publisher),
                  _row('Year', r.year?.toString() ?? ''),
                  _row('Edition', r.edition),
                  _row('Language', r.language),
                  _row('ISBN', r.isbn),
                  _row('Shelf', r.shelf),
                ]),
              ),
              if (r.copies.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('Copies', style: Theme.of(context).textTheme.titleMedium),
                ...r.copies.map((c) => Card(
                      child: ListTile(
                        dense: true,
                        title: Text(c.accessionNumber),
                        subtitle: Text(humanize(c.condition)),
                        trailing: StatusChip(c.status),
                      ),
                    )),
              ],
            ]),
          );
        },
      ),
    );
  }

  Widget _row(String label, String value) {
    if (value.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 90, child: Text(label, style: const TextStyle(color: Colors.grey))),
        Expanded(child: Text(value)),
      ]),
    );
  }
}
