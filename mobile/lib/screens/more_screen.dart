import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/permissions.dart';
import '../state/auth_provider.dart';
import 'clearance_screen.dart';
import 'desk_screen.dart';
import 'groups_screen.dart';
import 'notifications_screen.dart';
import 'profile_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  void _open(BuildContext context, Widget page) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => page));

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user!;
    final isStaff = auth.canAny([Perm.loanIssue, Perm.loanReturn]);

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(children: [
        ListTile(
          leading: CircleAvatar(child: Text(user.firstName.isEmpty ? '?' : user.firstName[0].toUpperCase())),
          title: Text(user.fullName),
          subtitle: Text('${user.roleName} · ${user.memberNumber.isNotEmpty ? user.memberNumber : user.email}'),
          onTap: () => _open(context, const ProfileScreen()),
        ),
        const Divider(),
        if (isStaff)
          ListTile(
            leading: const Icon(Icons.swap_horiz),
            title: const Text('Circulation desk'),
            subtitle: const Text('Issue and return items'),
            onTap: () => _open(context, const DeskScreen()),
          ),
        ListTile(
          leading: const Icon(Icons.notifications_outlined),
          title: const Text('Notifications'),
          onTap: () => _open(context, const NotificationsScreen()),
        ),
        if (auth.can(Perm.clearanceViewOwn))
          ListTile(
            leading: const Icon(Icons.verified_outlined),
            title: const Text('Library clearance'),
            onTap: () => _open(context, const ClearanceScreen()),
          ),
        if (auth.canAny([Perm.groupView, Perm.groupViewOwn]))
          ListTile(
            leading: const Icon(Icons.groups_outlined),
            title: const Text('Reading groups'),
            onTap: () => _open(context, const GroupsScreen()),
          ),
        ListTile(
          leading: const Icon(Icons.person_outline),
          title: const Text('My profile'),
          onTap: () => _open(context, const ProfileScreen()),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.dns_outlined),
          title: const Text('Server'),
          subtitle: Text(auth.config.baseUrl),
        ),
        ListTile(
          leading: const Icon(Icons.logout, color: Colors.red),
          title: const Text('Sign out', style: TextStyle(color: Colors.red)),
          onTap: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                title: const Text('Sign out?'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                  FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
                ],
              ),
            );
            if (ok == true) await auth.logout();
          },
        ),
      ]),
    );
  }
}
