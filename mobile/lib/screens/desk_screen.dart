import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/permissions.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';

/// Staff-only: issue an item to a member and take one back. The accession
/// number, barcode and the member's registration/staff number or email are all
/// accepted, exactly as at the web desk.
class DeskScreen extends StatelessWidget {
  const DeskScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final tabs = <Tab>[
      if (auth.can(Perm.loanIssue)) const Tab(text: 'Issue'),
      if (auth.can(Perm.loanReturn)) const Tab(text: 'Return'),
    ];
    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        appBar: AppBar(title: const Text('Circulation desk'), bottom: TabBar(tabs: tabs)),
        body: TabBarView(children: [
          if (auth.can(Perm.loanIssue)) const _IssueForm(),
          if (auth.can(Perm.loanReturn)) const _ReturnForm(),
        ]),
      ),
    );
  }
}

class _IssueForm extends StatefulWidget {
  const _IssueForm();

  @override
  State<_IssueForm> createState() => _IssueFormState();
}

class _IssueFormState extends State<_IssueForm> {
  final _member = TextEditingController();
  final _copy = TextEditingController();
  bool _busy = false;
  String? _result;

  @override
  void dispose() {
    _member.dispose();
    _copy.dispose();
    super.dispose();
  }

  Future<void> _issue() async {
    if (_member.text.trim().length < 2 || _copy.text.trim().isEmpty) {
      showMessage(context, 'Enter the member and the item', error: true);
      return;
    }
    setState(() {
      _busy = true;
      _result = null;
    });
    try {
      final data = await context.read<AuthProvider>().api.post('/loans/issue', body: {
        'userIdentifier': _member.text.trim(),
        'copyIdentifier': _copy.text.trim(),
      });
      final loan = Loan.fromJson(Map<String, dynamic>.from(data as Map));
      _copy.clear();
      setState(() => _result = 'Issued${loan.title.isNotEmpty ? ' "${loan.title}"' : ''}. Due ${formatDate(loan.dueDate)}.');
    } catch (e) {
      if (mounted) showMessage(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      TextField(
        controller: _member,
        autocorrect: false,
        decoration: const InputDecoration(
          labelText: 'Member',
          helperText: 'Registration number, staff number or email',
          prefixIcon: Icon(Icons.person_outline),
        ),
      ),
      const SizedBox(height: 14),
      TextField(
        controller: _copy,
        autocorrect: false,
        decoration: const InputDecoration(
          labelText: 'Item',
          helperText: 'Accession number or barcode',
          prefixIcon: Icon(Icons.qr_code_2),
        ),
      ),
      const SizedBox(height: 18),
      FilledButton(onPressed: _busy ? null : _issue, child: const Text('Issue item')),
      if (_result != null)
        Padding(
          padding: const EdgeInsets.only(top: 16),
          child: Card(
            color: Colors.green.shade50,
            child: ListTile(leading: const Icon(Icons.check_circle, color: Colors.green), title: Text(_result!)),
          ),
        ),
    ]);
  }
}

class _ReturnForm extends StatefulWidget {
  const _ReturnForm();

  @override
  State<_ReturnForm> createState() => _ReturnFormState();
}

class _ReturnFormState extends State<_ReturnForm> {
  final _copy = TextEditingController();
  bool _busy = false;
  String? _result;

  @override
  void dispose() {
    _copy.dispose();
    super.dispose();
  }

  Future<void> _return() async {
    if (_copy.text.trim().isEmpty) {
      showMessage(context, 'Enter the item being returned', error: true);
      return;
    }
    setState(() {
      _busy = true;
      _result = null;
    });
    try {
      final data = await context.read<AuthProvider>().api.post('/loans/return', body: {'copyIdentifier': _copy.text.trim()});
      final fines = data is Map && data['fines'] is List ? (data['fines'] as List).length : 0;
      _copy.clear();
      setState(() => _result = fines > 0 ? 'Item returned. $fines fine(s) raised.' : 'Item returned. No fines due.');
    } catch (e) {
      if (mounted) showMessage(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      TextField(
        controller: _copy,
        autocorrect: false,
        onSubmitted: (_) => _return(),
        decoration: const InputDecoration(
          labelText: 'Item',
          helperText: 'Accession number or barcode',
          prefixIcon: Icon(Icons.qr_code_2),
        ),
      ),
      const SizedBox(height: 18),
      FilledButton(onPressed: _busy ? null : _return, child: const Text('Return item')),
      if (_result != null)
        Padding(
          padding: const EdgeInsets.only(top: 16),
          child: Card(
            color: Colors.green.shade50,
            child: ListTile(leading: const Icon(Icons.check_circle, color: Colors.green), title: Text(_result!)),
          ),
        ),
    ]);
  }
}
