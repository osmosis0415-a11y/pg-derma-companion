import 'package:flutter/material.dart';

import 'screens/home_screen.dart';
import 'screens/logbook_screen.dart';
import 'screens/patients_screen.dart';
import 'screens/quick_capture_screen.dart';
import 'screens/thesis_screen.dart';

/// Adaptive navigation: bottom bar + FAB on phones (<600 dp), navigation rail on iPad/tablets.
class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _i = 0;
  static const _dest = [
    (Icons.home_outlined, Icons.home, 'Home'),
    (Icons.people_outline, Icons.people, 'Patients'),
    (Icons.menu_book_outlined, Icons.menu_book, 'Logbook'),
    (Icons.school_outlined, Icons.school, 'Thesis'),
  ];
  Widget get _page => switch (_i) { 0 => const HomeScreen(), 1 => const PatientsScreen(), 2 => const LogbookScreen(), _ => const ThesisScreen() };

  void _quickAdd() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const QuickCaptureScreen()));

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 600;
    if (wide) {
      return Scaffold(
        body: Row(children: [
          NavigationRail(
            selectedIndex: _i,
            onDestinationSelected: (i) => setState(() => _i = i),
            labelType: NavigationRailLabelType.all,
            leading: Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: FloatingActionButton(onPressed: _quickAdd, child: const Icon(Icons.add))),
            destinations: [for (final d in _dest) NavigationRailDestination(icon: Icon(d.$1), selectedIcon: Icon(d.$2), label: Text(d.$3))],
          ),
          const VerticalDivider(width: 1),
          Expanded(child: _page),
        ]),
      );
    }
    return Scaffold(
      body: _page,
      floatingActionButton: FloatingActionButton.large(onPressed: _quickAdd, child: const Icon(Icons.add)),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _i,
        onDestinationSelected: (i) => setState(() => _i = i),
        destinations: [for (final d in _dest) NavigationDestination(icon: Icon(d.$1), selectedIcon: Icon(d.$2), label: d.$3)],
      ),
    );
  }
}
