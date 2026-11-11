import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/permissions.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';

/// Graduating members request library clearance here; it is granted once they
/// hold no loans and (when fines are on) owe nothing.
class ClearanceScreen extends StatefulWidget {
  const ClearanceScreen({super.key});

  @override
  State<ClearanceScreen> createState() => _ClearanceScreenState();
}

class _ClearanceScreenState extends State<ClearanceScreen> {
  int _version = 0;
  bool _busy = false;

  Future<void> _request() async {
    setState(() => _busy = true);
    try {
      await context.read<AuthProvider>().api.post('/clearance/request');
      if (mounted) showMessage(context, 'Clearance request submitted');
      setState(() => _version++);
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
      appBar: AppBar(title: const Text('Library clearance')),
      body: AsyncBody<Map<String, dynamic>>(
        key: ValueKey(_version),
        load: () async => Map<String, dynamic>.from(await auth.api.get('/clearance/my-status') as Map),
        builder: (context, data, refresh) {
          final clearance = data['clearance'] is Map ? Map<String, dynamic>.from(data['clearance'] as Map) : null;
          final status = (clearance?['status'] ?? 'not_requested').toString();
          final eligible = data['isClear'] == true;
          // Already written as sentences, e.g. "2 item(s) still on loan".
          final reasons = (data['blockingReasons'] as List? ?? const []).map((e) => e.toString()).toList();
          final canRequest = auth.can(Perm.clearanceRequestOwn) &&
              (status == 'not_requested' || status == 'rejected' || status == 'blocked');

          return RefreshIndicator(
            onRefresh: refresh,
            child: ListView(padding: const EdgeInsets.all(16), children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      const Text('Status  ', style: TextStyle(color: Colors.grey)),
                      StatusChip(status),
                    ]),
                    if (clearance?['clearanceCode'] != null) ...[
                      const SizedBox(height: 8),
                      Text('Reference: ${clearance!['clearanceCode']}'),
                    ],
                    if (clearance?['certificateNumber'] != null) Text('Certificate: ${clearance!['certificateNumber']}'),
                    const SizedBox(height: 8),
                    Text(status == 'cleared'
                        ? 'You have no outstanding library obligations.'
                        : eligible
                            ? 'You meet the requirements for clearance.'
                            : 'Return all loans${auth.finesEnabled ? ' and settle any fines' : ''} before requesting clearance.'),
                  ]),
                ),
              ),
              if (reasons.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Outstanding items', style: Theme.of(context).textTheme.titleMedium),
                ...reasons.map((r) => ListTile(
                      dense: true,
                      leading: const Icon(Icons.warning_amber_outlined, color: Colors.orange),
                      title: Text(r),
                    )),
              ],
              if (canRequest) ...[
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : _request,
                  child: const Text('Request clearance'),
                ),
              ],
            ]),
          );
        },
      ),
    );
  }
}
