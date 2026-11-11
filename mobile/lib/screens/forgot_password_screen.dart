import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/auth_provider.dart';
import '../widgets/common.dart';

/// Two steps, matching the web app: request an emailed 6-digit code, then
/// choose a new password with it.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) showMessage(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendCode() => _run(() async {
        final api = context.read<AuthProvider>().api;
        await api.post('/auth/forgot-password', body: {'email': _email.text.trim()});
        if (!mounted) return;
        setState(() => _codeSent = true);
        showMessage(context, 'If that email is registered, a 6-digit code has been sent.');
      });

  Future<void> _reset() => _run(() async {
        final api = context.read<AuthProvider>().api;
        await api.post('/auth/reset-password', body: {
          'email': _email.text.trim(),
          'code': _code.text.trim(),
          'newPassword': _password.text,
        });
        if (!mounted) return;
        showMessage(context, 'Password updated. You can sign in now.');
        Navigator.pop(context);
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        TextField(
          controller: _email,
          enabled: !_codeSent,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Email address'),
        ),
        const SizedBox(height: 16),
        if (!_codeSent)
          FilledButton(onPressed: _busy ? null : _sendCode, child: const Text('Send code'))
        else ...[
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: const InputDecoration(labelText: '6-digit code'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'New password',
              helperText: 'Use the same rules as when you registered',
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _reset, child: const Text('Update password')),
          TextButton(
            onPressed: _busy ? null : _sendCode,
            child: const Text('Send a new code'),
          ),
        ],
      ]),
    );
  }
}
