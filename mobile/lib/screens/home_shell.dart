import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/permissions.dart';
import '../state/auth_provider.dart';
import 'catalog_screen.dart';
import 'dashboard_screen.dart';
import 'digital_screen.dart';
import 'more_screen.dart';
import 'my_library_screen.dart';

/// The signed-in frame: five bottom tabs, each keeping its own state.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final showDigital = auth.can(Perm.digitalView);

    final tabs = <_Tab>[
      _Tab('Home', Icons.home_outlined, Icons.home, const DashboardScreen()),
      _Tab('Catalogue', Icons.search, Icons.search, const CatalogScreen()),
      _Tab('My library', Icons.collections_bookmark_outlined, Icons.collections_bookmark, const MyLibraryScreen()),
      if (showDigital) _Tab('Digital', Icons.cloud_download_outlined, Icons.cloud_download, const DigitalScreen()),
      _Tab('More', Icons.menu, Icons.menu, const MoreScreen()),
    ];
    final index = _index.clamp(0, tabs.length - 1);

    return Scaffold(
      body: IndexedStack(index: index, children: tabs.map((t) => t.page).toList()),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: tabs
            .map((t) => NavigationDestination(icon: Icon(t.icon), selectedIcon: Icon(t.selectedIcon), label: t.label))
            .toList(),
      ),
    );
  }
}

class _Tab {
  _Tab(this.label, this.icon, this.selectedIcon, this.page);

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget page;
}
