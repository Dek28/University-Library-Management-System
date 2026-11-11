import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/permissions.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';
import 'notifications_screen.dart';
import 'resource_detail_screen.dart';

/// Members see their own loans, holds and fines. Staff see the same headline
/// figures the web dashboards show, picked by the role's dashboard permission.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final staff = auth.can(Perm.dashboardAdmin) || auth.can(Perm.dashboardLibrarian);
    return Scaffold(
      appBar: AppBar(
        title: Text('Hello, ${auth.user?.firstName ?? ''}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const NotificationsScreen())),
          ),
        ],
      ),
      body: staff ? const _StaffDashboard() : const _MemberDashboard(),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile(this.label, this.value, {this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(value,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold, color: color)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
        ]),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title, {required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 6),
        child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
      ),
      ...children,
    ]);
  }
}

class _MemberDashboard extends StatelessWidget {
  const _MemberDashboard();

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthProvider>();
    return AsyncBody<Map<String, dynamic>>(
      load: () async => Map<String, dynamic>.from(await auth.api.get('/dashboard/me') as Map),
      builder: (context, data, refresh) {
        final cards = Map<String, dynamic>.from(data['cards'] as Map? ?? {});
        final lists = Map<String, dynamic>.from(data['lists'] as Map? ?? {});
        final loans = (lists['loans'] as List? ?? []).map((e) => Loan.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        final reservations = (lists['reservations'] as List? ?? [])
            .map((e) => Reservation.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
        final recommended = (lists['recommended'] as List? ?? [])
            .map((e) => Resource.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
        final fine = (cards['fineBalance'] as num?) ?? 0;
        final overdue = (cards['overdue'] as num?) ?? 0;

        return RefreshIndicator(
          onRefresh: refresh,
          child: ListView(padding: const EdgeInsets.all(12), children: [
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 2.1,
              mainAxisSpacing: 4,
              crossAxisSpacing: 8,
              children: [
                _StatTile('Active loans', '${cards['activeLoans'] ?? 0}'),
                _StatTile('Due soon', '${cards['dueSoon'] ?? 0}', color: Colors.orange.shade800),
                _StatTile('Overdue', '$overdue', color: overdue > 0 ? Colors.red : null),
                if (auth.finesEnabled)
                  _StatTile('Fine balance', formatMoney(fine, auth.currency), color: fine > 0 ? Colors.red : Colors.green),
              ],
            ),
            _Section('Borrowed items', children: [
              if (loans.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('You have nothing on loan right now.')),
              ...loans.map((loan) => _LoanTile(loan)),
            ]),
            if (reservations.isNotEmpty)
              _Section('Reservations', children: reservations.map((r) => Card(
                    child: ListTile(
                      title: Text(r.title, maxLines: 2, overflow: TextOverflow.ellipsis),
                      subtitle: r.expiresAt != null && r.status == 'ready'
                          ? Text('Collect by ${formatDate(r.expiresAt)}')
                          : null,
                      trailing: StatusChip(r.status),
                    ),
                  )).toList()),
            if (recommended.isNotEmpty)
              _Section('Recommended for you', children: [
                SizedBox(
                  height: 190,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: recommended
                        .map((r) => GestureDetector(
                              onTap: () => Navigator.push(context,
                                  MaterialPageRoute(builder: (_) => ResourceDetailScreen(id: r.id))),
                              child: SizedBox(
                                width: 110,
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Cover(r.coverImage, width: 100, height: 130),
                                  const SizedBox(height: 6),
                                  Text(r.title, maxLines: 2, overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                                ]),
                              ),
                            ))
                        .toList(),
                  ),
                ),
              ]),
          ]),
        );
      },
    );
  }
}

/// How close a loan is to its due date, in words and colour.
class DueChip extends StatelessWidget {
  const DueChip(this.dueDate, {super.key});

  final DateTime? dueDate;

  @override
  Widget build(BuildContext context) {
    final days = daysUntil(dueDate);
    final String text;
    final Color color;
    if (days < 0) {
      text = '${-days}d overdue';
      color = Colors.red;
    } else if (days == 0) {
      text = 'Due today';
      color = Colors.orange.shade800;
    } else if (days <= 3) {
      text = 'Due in ${days}d';
      color = Colors.orange.shade800;
    } else {
      text = 'Due in ${days}d';
      color = Colors.blueGrey;
    }
    return Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12));
  }
}

class _LoanTile extends StatelessWidget {
  const _LoanTile(this.loan);

  final Loan loan;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Cover(loan.coverImage, width: 36, height: 48),
        title: Text(loan.title, maxLines: 2, overflow: TextOverflow.ellipsis),
        subtitle: Text('${loan.accession} · due ${formatDate(loan.dueDate)}'),
        trailing: DueChip(loan.dueDate),
        onTap: loan.resourceId.isEmpty
            ? null
            : () => Navigator.push(context, MaterialPageRoute(builder: (_) => ResourceDetailScreen(id: loan.resourceId))),
      ),
    );
  }
}

class _StaffDashboard extends StatelessWidget {
  const _StaffDashboard();

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthProvider>();
    final path = auth.can(Perm.dashboardAdmin) ? '/dashboard/admin' : '/dashboard/librarian';
    return AsyncBody<Map<String, dynamic>>(
      load: () async => Map<String, dynamic>.from(await auth.api.get(path) as Map),
      builder: (context, data, refresh) {
        final cards = Map<String, dynamic>.from(data['cards'] as Map? ?? {});
        // Only numeric figures: nested objects have no single value to show.
        final entries = cards.entries.where((e) => e.value is num).toList();
        return RefreshIndicator(
          onRefresh: refresh,
          child: ListView(padding: const EdgeInsets.all(12), children: [
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 2.1,
              mainAxisSpacing: 4,
              crossAxisSpacing: 8,
              children: entries.map((e) {
                final isMoney = e.key.toLowerCase().contains('fine') || e.key.toLowerCase().contains('revenue');
                final value = isMoney ? formatMoney(e.value as num, auth.currency) : '${e.value}';
                return _StatTile(_spaced(e.key), value);
              }).toList(),
            ),
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Charts and detailed reports are available in the web console.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey),
              ),
            ),
          ]),
        );
      },
    );
  }

  /// "overdueLoans" -> "Overdue loans".
  String _spaced(String camel) {
    final text = camel.replaceAllMapped(RegExp(r'([A-Z])'), (m) => ' ${m[1]!.toLowerCase()}');
    return text[0].toUpperCase() + text.substring(1);
  }
}
