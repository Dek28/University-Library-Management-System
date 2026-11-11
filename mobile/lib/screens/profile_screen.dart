import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/auth_provider.dart';
import '../widgets/common.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user!;
    Widget row(String label, String value) => value.isEmpty
        ? const SizedBox.shrink()
        : ListTile(dense: true, title: Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)), subtitle: Text(value, style: const TextStyle(fontSize: 15)));

    return Scaffold(
      appBar: AppBar(title: const Text('My profile')),
      body: ListView(children: [
        const SizedBox(height: 24),
        Center(
          child: CircleAvatar(
            radius: 36,
            child: Text(
              '${user.firstName.isEmpty ? '' : user.firstName[0]}${user.lastName.isEmpty ? '' : user.lastName[0]}'.toUpperCase(),
              style: const TextStyle(fontSize: 24),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Center(child: Text(user.fullName, style: Theme.of(context).textTheme.titleLarge)),
        Center(child: Text(user.roleName, style: const TextStyle(color: Colors.grey))),
        const SizedBox(height: 16),
        row('Email', user.email),
        row('Registration number', user.registrationNumber),
        row('Staff number', user.employeeId),
        row('Phone', user.phone),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.lock_outline),
          title: const Text('Change password'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChangePasswordScreen())),
        ),
      ]),
    );
  }
}

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_next.text != _confirm.text) {
      showMessage(context, 'The new passwords do not match', error: true);
      return;
    }
    setState(() => _busy = true);
    final auth = context.read<AuthProvider>();
    try {
      await auth.api.post('/auth/change-password', body: {
        'currentPassword': _current.text,
        'newPassword': _next.text,
      });
      // The server revokes every session on a password change.
      if (mounted) Navigator.popUntil(context, (route) => route.isFirst);
      auth.endSession();
    } catch (e) {
      if (mounted) {
        showMessage(context, errorText(e), error: true);
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Change password')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        TextField(controller: _current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
        const SizedBox(height: 14),
        TextField(
          controller: _next,
          obscureText: true,
          decoration: const InputDecoration(
            labelText: 'New password',
            helperText: 'At least 8 characters with an uppercase letter, a lowercase letter and a number',
            helperMaxLines: 2,
          ),
        ),
        const SizedBox(height: 14),
        TextField(controller: _confirm, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm new password')),
        const SizedBox(height: 20),
        FilledButton(onPressed: _busy ? null : _submit, child: const Text('Update password')),
        const SizedBox(height: 8),
        const Text('You will be signed out on every device and asked to sign in again.',
            style: TextStyle(color: Colors.grey, fontSize: 12)),
      ]),
    );
  }
}
