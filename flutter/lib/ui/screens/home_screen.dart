import 'package:drift/drift.dart' hide Column, Table;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../data/database.dart';
import '../../main.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final db = AppScope.of(context).db;
    final df = DateFormat('d MMM');
    return Scaffold(
      appBar: AppBar(title: const Text('PG Derma')),
      body: ListView(padding: const EdgeInsets.all(12), children: [
        FutureBuilder(
          future: Future.wait([db.countArm('Case'), db.countArm('Control'), db.select(db.thesisConfig).getSingleOrNull()]),
          builder: (c, s) {
            if (!s.hasData) return const SizedBox(height: 120);
            final cfg = s.data![2] as ThesisConfigData?;
            if (cfg == null) return const Card(child: ListTile(title: Text('Thesis recruitment'), subtitle: Text('Set up your thesis CRF in the Thesis tab')));
            return Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
              _Ring(n: s.data![0] as int, t: cfg.targetA, label: cfg.groupA),
              _Ring(n: s.data![1] as int, t: cfg.targetB, label: cfg.groupB),
            ])));
          },
        ),
        Card(child: StreamBuilder<List<Reminder>>(
          stream: db.watchDue(DateTime.now().add(const Duration(days: 1))),
          builder: (c, s) {
            final r = s.data ?? [];
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const ListTile(title: Text("Today's actions")),
              if (r.isEmpty) const ListTile(dense: true, title: Text('Nothing due today 🎉')),
              for (final x in r) CheckboxListTile(
                value: false, title: Text(x.type), subtitle: Text('${df.format(x.dueAt)} · ${x.note}'),
                onChanged: (_) => (db.update(db.reminders)..where((t) => t.id.equals(x.id))).write(const RemindersCompanion(done: Value(true))),
              ),
            ]);
          },
        )),
        Card(child: StreamBuilder<List<NmcLogbookData>>(
          stream: (db.select(db.nmcLogbook)..orderBy([(t) => OrderingTerm.desc(t.procedureDate)])).watch(),
          builder: (c, s) {
            final l = s.data ?? [];
            final perf = l.where((e) => e.role == 'Performed').length;
            return ListTile(title: const Text('NMC logbook'), subtitle: Text('${l.length} entries · $perf performed'), trailing: const Icon(Icons.chevron_right));
          },
        )),
      ]),
    );
  }
}

class _Ring extends StatelessWidget {
  const _Ring({required this.n, required this.t, required this.label});
  final int n, t;
  final String label;
  @override
  Widget build(BuildContext context) => Column(children: [
        SizedBox(width: 84, height: 84, child: Stack(alignment: Alignment.center, children: [
          CircularProgressIndicator(value: t == 0 ? 0 : (n / t).clamp(0, 1).toDouble(), strokeWidth: 8, strokeCap: StrokeCap.round),
          Text('$n/$t', style: Theme.of(context).textTheme.titleMedium),
        ])),
        const SizedBox(height: 6),
        Text(label),
      ]);
}
