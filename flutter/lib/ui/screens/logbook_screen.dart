import 'package:drift/drift.dart' hide Column, Table;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import 'package:uuid/uuid.dart';

import '../../data/database.dart';
import '../../main.dart';
import '../../services/export_service.dart';

const kProcedures = ['Punch biopsy', 'Incisional biopsy', 'Excisional biopsy', 'Slit skin smear', 'KOH mount', 'Tzanck smear', 'Patch test', 'Dermoscopy', 'Electrocautery / RF', 'Cryotherapy', 'Chemical peel', 'Intralesional steroid', 'PRP', 'Microneedling', 'Q-switched Nd:YAG laser', 'Fractional CO2 laser', 'NB-UVB phototherapy session', 'Suction blister grafting', 'Punch grafting', 'Excision & suturing'];

String residencyYear(DateTime start, DateTime d) { final y = d.difference(start).inDays / 365.25; return y < 1 ? 'JR1' : y < 2 ? 'JR2' : 'JR3'; }

class LogbookScreen extends StatefulWidget {
  const LogbookScreen({super.key});
  @override
  State<LogbookScreen> createState() => _LogbookScreenState();
}

class _LogbookScreenState extends State<LogbookScreen> {
  String? _year;

  Future<void> _add() async {
    final db = AppScope.of(context).db;
    String proc = kProcedures.first, role = 'Performed';
    final ind = TextEditingController(), sup = TextEditingController();
    final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (c) => StatefulBuilder(builder: (c, set) => Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.viewInsetsOf(c).bottom + 16),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        DropdownButtonFormField(value: proc, items: [for (final p in kProcedures) DropdownMenuItem(value: p, child: Text(p))], onChanged: (v) => set(() => proc = v!), decoration: const InputDecoration(labelText: 'Procedure')),
        SegmentedButton(segments: const [ButtonSegment(value: 'Performed', label: Text('P')), ButtonSegment(value: 'Assisted', label: Text('A')), ButtonSegment(value: 'Observed', label: Text('O'))], selected: {role}, onSelectionChanged: (s) => set(() => role = s.first)),
        TextField(controller: ind, decoration: const InputDecoration(labelText: 'Indication')),
        TextField(controller: sup, decoration: const InputDecoration(labelText: 'Supervisor')),
        const SizedBox(height: 12),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save')),
      ]),
    )));
    if (ok != true) return;
    final now = DateTime.now();
    await db.into(db.nmcLogbook).insert(NmcLogbookCompanion.insert(
      id: const Uuid().v4(), procedureDate: now, procedureName: proc, category: 'Procedure', role: role,
      residencyYear: residencyYear(DateTime(now.year - (now.month < 11 ? 1 : 0), 11, 1), now), // TODO: read residency start from settings
      indication: Value(ind.text), supervisor: Value(sup.text),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final db = AppScope.of(context).db;
    final ex = ExportService(db);
    return Scaffold(
      appBar: AppBar(title: const Text('NMC E-Logbook'), actions: [
        IconButton(tooltip: 'Excel', icon: const Icon(Icons.table_view), onPressed: () async => ex.share(await ex.logbookExcel())),
        IconButton(tooltip: 'PDF', icon: const Icon(Icons.picture_as_pdf), onPressed: () async { final bytes = await ex.logbookPdf(resident: '', institution: ''); await Printing.layoutPdf(onLayout: (_) async => bytes); }),
      ]),
      floatingActionButton: FloatingActionButton(onPressed: _add, child: const Icon(Icons.add)),
      body: Column(children: [
        Padding(padding: const EdgeInsets.all(8), child: SegmentedButton<String?>(
          segments: const [ButtonSegment(value: null, label: Text('All')), ButtonSegment(value: 'JR1', label: Text('JR1')), ButtonSegment(value: 'JR2', label: Text('JR2')), ButtonSegment(value: 'JR3', label: Text('JR3'))],
          selected: {_year}, onSelectionChanged: (s) => setState(() => _year = s.first),
        )),
        Expanded(child: StreamBuilder<List<NmcLogbookData>>(
          stream: db.watchLogbook(year: _year),
          builder: (c, s) => ListView(children: [
            for (final l in s.data ?? [])
              ListTile(title: Text(l.procedureName), subtitle: Text('${DateFormat('d MMM yyyy').format(l.procedureDate)} · ${l.role} · ${l.residencyYear}'), trailing: CircleAvatar(radius: 14, child: Text(l.role[0]))),
          ]),
        )),
      ]),
    );
  }
}
