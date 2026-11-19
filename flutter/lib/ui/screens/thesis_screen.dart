import 'dart:convert';

import 'package:drift/drift.dart' hide Column, Table;
import 'package:flutter/material.dart';

import '../../data/database.dart';
import '../../main.dart';
import '../../services/export_service.dart';

/// Thesis recruitment gauge, CRF setup and SPSS-ready export.
class ThesisScreen extends StatelessWidget {
  const ThesisScreen({super.key});

  Future<void> _setup(BuildContext context, AppDatabase db, ThesisConfigData? cur) async {
    final title = TextEditingController(text: cur?.title ?? ''), weeks = TextEditingController(text: cur == null ? '0, 4, 8, 12' : (jsonDecode(cur.weeksJson) as List).join(', '));
    final ta = TextEditingController(text: '${cur?.targetA ?? 30}'), tb = TextEditingController(text: '${cur?.targetB ?? 30}');
    String? scale = cur?.primaryScale;
    final ok = await showDialog<bool>(context: context, builder: (c) => StatefulBuilder(builder: (c, set) => AlertDialog(
      title: const Text('Thesis setup'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
        DropdownButtonFormField<String?>(value: scale, decoration: const InputDecoration(labelText: 'Primary scale'), items: [const DropdownMenuItem(value: null, child: Text('—')), for (final s in ['PASI', 'EASI', 'SCORAD', 'SALT', 'MASI', 'mMASI', 'VASI', 'GAGS', 'DLQI']) DropdownMenuItem(value: s, child: Text(s))], onChanged: (v) => set(() => scale = v)),
        TextField(controller: weeks, decoration: const InputDecoration(labelText: 'Visit weeks (0 = baseline)')),
        TextField(controller: ta, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Target Group A')),
        TextField(controller: tb, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Target Group B')),
      ])),
      actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save'))],
    )));
    if (ok != true) return;
    final w = {0, ...weeks.text.split(',').map((s) => int.tryParse(s.trim())).whereType<int>().where((x) => x >= 0)}.toList()..sort();
    await db.into(db.thesisConfig).insertOnConflictUpdate(ThesisConfigCompanion.insert(
      title: title.text, primaryScale: Value(scale), weeksJson: jsonEncode(w), variablesJson: cur?.variablesJson ?? '[]',
      targetA: Value(int.tryParse(ta.text) ?? 30), targetB: Value(int.tryParse(tb.text) ?? 30),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final db = AppScope.of(context).db;
    return StreamBuilder<ThesisConfigData?>(
      stream: db.select(db.thesisConfig).watchSingleOrNull(),
      builder: (c, s) {
        final cfg = s.data;
        return Scaffold(
          appBar: AppBar(title: const Text('Thesis'), actions: [IconButton(icon: const Icon(Icons.settings), onPressed: () => _setup(context, db, cfg))]),
          body: cfg == null
              ? Center(child: FilledButton(onPressed: () => _setup(context, db, null), child: const Text('Set up thesis CRF')))
              : FutureBuilder(
                  future: Future.wait([db.countArm('Case'), db.countArm('Control')]),
                  builder: (c, n) => ListView(padding: const EdgeInsets.all(16), children: [
                    Text(cfg.title, style: Theme.of(context).textTheme.titleLarge),
                    Text('${cfg.primaryScale ?? 'No primary scale'} · weeks ${(jsonDecode(cfg.weeksJson) as List).join(', ')}'),
                    const SizedBox(height: 16),
                    for (final (label, got, target) in [(cfg.groupA, n.data?[0] ?? 0, cfg.targetA), (cfg.groupB, n.data?[1] ?? 0, cfg.targetB)]) ...[
                      Text('$label: $got / $target'),
                      LinearProgressIndicator(value: target == 0 ? 0 : (got / target).clamp(0, 1).toDouble(), minHeight: 10, borderRadius: BorderRadius.circular(5)),
                      const SizedBox(height: 12),
                    ],
                    FilledButton.icon(
                      icon: const Icon(Icons.download), label: const Text('Export SPSS-ready Excel'),
                      onPressed: () async { final ex = ExportService(db); await ex.share(await ex.thesisExcel()); },
                    ),
                  ]),
                ),
        );
      },
    );
  }
}
