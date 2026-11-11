import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/permissions.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';
import 'dashboard_screen.dart' show DueChip;
import 'resource_detail_screen.dart';

/// Everything the signed-in member owes or holds: loans, reservations, fines.
class MyLibraryScreen extends StatelessWidget {
  const MyLibraryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final showFines = auth.finesEnabled && auth.can(Perm.finesViewOwn);
    final tabs = <Tab>[
      const Tab(text: 'Loans'),
      const Tab(text: 'Reservations'),
      if (showFines) const Tab(text: 'Fines'),
    ];
    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        appBar: AppBar(title: const Text('My library'), bottom: TabBar(tabs: tabs)),
        body: TabBarView(children: [
          const _LoansTab(),
          const _ReservationsTab(),
          if (showFines) const _FinesTab(),
        ]),
      ),
    );
  }
}

// ------------------------------------------------------------------- loans

class _LoansTab extends StatefulWidget {
  const _LoansTab();

  @override
  State<_LoansTab> createState() => _LoansTabState();
}

class _LoansTabState extends State<_LoansTab> {
  final _list = GlobalKey<PagedListState>();
  String _status = '';

  static const _filters = <String, String>{
    '': 'All',
    'active': 'Active',
    'overdue': 'Overdue',
    'returned': 'Returned',
  };

  Future<void> _renew(Loan loan) async {
    try {
      await context.read<AuthProvider>().api.post('/loans/${loan.id}/renew', body: {'channel': 'self_service'});
      if (mounted) showMessage(context, 'Loan renewed');
      _list.currentState?.reload();
    } catch (e) {
      if (mounted) showMessage(context, errorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthProvider>();
    return Column(children: [
      SizedBox(
        height: 52,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          children: _filters.entries
              .map((e) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(e.value),
                      selected: _status == e.key,
                      onSelected: (_) => setState(() => _status = e.key),
                    ),
                  ))
              .toList(),
        ),
      ),
      Expanded(
        child: PagedList(
          key: _list,
          reloadKey: _status,
          emptyMessage: 'No loans to show',
          fetch: (page) => auth.api.list('/loans', query: {'status': _status, 'page': page, 'limit': 20}),
          itemBuilder: (context, raw) {
            final loan = Loan.fromJson(Map<String, dynamic>.from(raw as Map));
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  InkWell(
                    onTap: loan.resourceId.isEmpty
                        ? null
                        : () => Navigator.push(context,
                            MaterialPageRoute(builder: (_) => ResourceDetailScreen(id: loan.resourceId))),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Cover(loan.coverImage, width: 40, height: 54),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(loan.title, maxLines: 2, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          Text('${loan.accession} · borrowed ${formatDate(loan.borrowDate)}',
                              style: const TextStyle(color: Colors.grey, fontSize: 12)),
                        ]),
                      ),
                      StatusChip(loan.status),
                    ]),
                  ),
                  const SizedBox(height: 8),
                  Row(children: [
                    if (loan.isOpen) ...[
                      Text('Due ${formatDate(loan.dueDate)}  '),
                      DueChip(loan.dueDate),
                    ] else
                      Text('Returned ${formatDate(loan.returnDate)}',
                          style: const TextStyle(color: Colors.grey)),
                    const Spacer(),
                    if (loan.canRenew && auth.can(Perm.loanRenewOwn))
                      TextButton(onPressed: () => _renew(loan), child: const Text('Renew')),
                  ]),
                  if (loan.isOpen)
                    Text('Renewals used: ${loan.renewalCount} of ${loan.maxRenewals}',
                        style: const TextStyle(color: Colors.grey, fontSize: 12)),
                ]),
              ),
            );
          },
        ),
      ),
    ]);
  }
}

// ------------------------------------------------------------ reservations

class _ReservationsTab extends StatefulWidget {
  const _ReservationsTab();

  @override
  State<_ReservationsTab> createState() => _ReservationsTabState();
}

class _ReservationsTabState extends State<_ReservationsTab> {
  final _list = GlobalKey<PagedListState>();

  Future<void> _cancel(Reservation r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel reservation?'),
        content: Text(r.title),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel it')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await context.read<AuthProvider>().api.post('/reservations/${r.id}/cancel', body: {});
      if (mounted) showMessage(context, 'Reservation cancelled');
      _list.currentState?.reload();
    } catch (e) {
      if (mounted) showMessage(context, errorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return PagedList(
      key: _list,
      emptyMessage: 'You have no reservations',
      fetch: (page) => api.list('/reservations', query: {'page': page, 'limit': 20}),
      itemBuilder: (context, raw) {
        final r = Reservation.fromJson(Map<String, dynamic>.from(raw as Map));
        String? note;
        if (r.status == 'pending' && r.queuePosition != null) note = 'Queue position #${r.queuePosition}';
        if (r.status == 'ready' && r.expiresAt != null) {
          final days = daysUntil(r.expiresAt);
          note = 'Collect by ${formatDate(r.expiresAt)}'
              '${days >= 0 ? ' ($days day(s) left)' : ' (expired)'}';
        }
        return Card(
          child: ListTile(
            title: Text(r.title, maxLines: 2, overflow: TextOverflow.ellipsis),
            subtitle: Text([r.code, if (note != null) note].join('\n')),
            isThreeLine: note != null,
            trailing: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              StatusChip(r.status),
              if (r.isCancellable)
                InkWell(
                  onTap: () => _cancel(r),
                  child: const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text('Cancel', style: TextStyle(color: Colors.red, fontSize: 12)),
                  ),
                ),
            ]),
          ),
        );
      },
    );
  }
}

// -------------------------------------------------------------------- fines

class _FinesTab extends StatelessWidget {
  const _FinesTab();

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthProvider>();
    return Column(children: [
      FutureBuilder<dynamic>(
        future: auth.api.get('/fines/my-outstanding'),
        builder: (context, snapshot) {
          final data = snapshot.data;
          final total = data is Map ? (data['total'] as num? ?? 0) : 0;
          return Card(
            margin: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            color: total > 0 ? Colors.red.shade50 : Colors.green.shade50,
            child: ListTile(
              title: const Text('Outstanding balance'),
              subtitle: const Text('Fines are paid at the library desk.'),
              trailing: Text(formatMoney(total, auth.currency),
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold,
                      color: total > 0 ? Colors.red.shade700 : Colors.green.shade700)),
            ),
          );
        },
      ),
      Expanded(
        child: PagedList(
          emptyMessage: 'You have no fines',
          emptyIcon: Icons.check_circle_outline,
          fetch: (page) => auth.api.list('/fines', query: {'page': page, 'limit': 20}),
          itemBuilder: (context, raw) {
            final f = Fine.fromJson(Map<String, dynamic>.from(raw as Map));
            return Card(
              child: ListTile(
                title: Text(f.title.isNotEmpty ? f.title : humanize(f.type)),
                subtitle: Text([
                  '${f.code} · ${humanize(f.type)}',
                  if (f.reason.isNotEmpty) f.reason,
                  formatDate(f.createdAt),
                ].join('\n')),
                isThreeLine: true,
                trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(formatMoney(f.balance > 0 ? f.balance : f.amount, auth.currency),
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  StatusChip(f.status),
                ]),
              ),
            );
          },
        ),
      ),
    ]);
  }
}
