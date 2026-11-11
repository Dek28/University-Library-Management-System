import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';

/// Reading groups and their upcoming sessions (read-only on mobile).
class GroupsScreen extends StatelessWidget {
  const GroupsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Reading groups'),
          bottom: const TabBar(tabs: [Tab(text: 'Sessions'), Tab(text: 'Groups')]),
        ),
        body: TabBarView(children: [
          PagedList(
            emptyMessage: 'No sessions scheduled',
            emptyIcon: Icons.event_busy,
            fetch: (page) => api.list('/reading-groups/sessions', query: {'page': page, 'limit': 20}),
            itemBuilder: (context, raw) {
              final s = ReadingSession.fromJson(Map<String, dynamic>.from(raw as Map));
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.event),
                  title: Text(s.title.isNotEmpty ? s.title : s.groupName),
                  subtitle: Text([
                    if (s.title.isNotEmpty && s.groupName.isNotEmpty) s.groupName,
                    '${formatDate(s.startsAt)} · ${s.startTime}–${s.endTime}',
                    if (s.space.isNotEmpty) s.space,
                  ].join('\n')),
                  isThreeLine: true,
                  trailing: StatusChip(s.status),
                ),
              );
            },
          ),
          PagedList(
            emptyMessage: 'No reading groups',
            emptyIcon: Icons.groups_outlined,
            fetch: (page) => api.list('/reading-groups', query: {'page': page, 'limit': 20}),
            itemBuilder: (context, raw) {
              final g = ReadingGroup.fromJson(Map<String, dynamic>.from(raw as Map));
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.groups_outlined),
                  title: Text(g.name),
                  subtitle: Text([
                    if (g.topic.isNotEmpty) g.topic,
                    '${g.memberCount}/${g.maxMembers} members${g.leader.isNotEmpty ? ' · led by ${g.leader}' : ''}',
                  ].join('\n')),
                  isThreeLine: g.topic.isNotEmpty,
                  trailing: StatusChip(g.status),
                ),
              );
            },
          ),
        ]),
      ),
    );
  }
}
