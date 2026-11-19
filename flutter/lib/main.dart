import 'package:flutter/material.dart';

import 'data/database.dart';
import 'services/key_service.dart';
import 'services/photo_vault.dart';
import 'ui/app_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PgDermaApp());
}

class PgDermaApp extends StatelessWidget {
  const PgDermaApp({super.key});
  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(seedColor: const Color(0xFF0F766E));
    return MaterialApp(
      title: 'PG Derma',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: scheme, useMaterial3: true),
      darkTheme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F766E), brightness: Brightness.dark), useMaterial3: true),
      home: const LockGate(),
    );
  }
}

/// Provides the unlocked database and vault to the widget tree.
class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.db, required this.vault, required super.child});
  final AppDatabase db;
  final PhotoVault vault;
  static AppScope of(BuildContext c) => c.dependOnInheritedWidgetOfExactType<AppScope>()!;
  @override
  bool updateShouldNotify(AppScope old) => db != old.db;
}

/// Biometric gate. Locks again when the app has been in the background longer than [lockAfter].
class LockGate extends StatefulWidget {
  const LockGate({super.key});
  @override
  State<LockGate> createState() => _LockGateState();
}

class _LockGateState extends State<LockGate> with WidgetsBindingObserver {
  static const lockAfter = Duration(minutes: 3);
  final _keys = KeyService();
  AppDatabase? _db;
  PhotoVault? _vault;
  DateTime? _pausedAt;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _unlock());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _db?.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.paused) _pausedAt = DateTime.now();
    if (s == AppLifecycleState.resumed && _pausedAt != null && DateTime.now().difference(_pausedAt!) > lockAfter && _db != null) {
      _db!.close();
      setState(() { _db = null; _vault = null; });
      _unlock();
    }
  }

  Future<void> _unlock() async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      if (!await _keys.authenticate()) throw Exception('Authentication cancelled');
      final key = await _keys.masterKey();
      final db = AppDatabase(await _keys.masterKeyHex());
      await db.customSelect('SELECT 1').get(); // opens & verifies key
      setState(() { _db = db; _vault = PhotoVault(db, key); });
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_db != null) return AppScope(db: _db!, vault: _vault!, child: const AppShell());
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('🩺', style: TextStyle(fontSize: 56)),
            Text('PG Derma Companion', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            const Text('Encrypted vault — unlock with FaceID / fingerprint', textAlign: TextAlign.center),
            const SizedBox(height: 24),
            FilledButton.icon(onPressed: _busy ? null : _unlock, icon: const Icon(Icons.fingerprint), label: Text(_busy ? 'Unlocking…' : 'Unlock')),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          ]),
        ),
      ),
    );
  }
}
