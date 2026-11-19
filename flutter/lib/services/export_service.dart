// NMC logbook (Excel + PDF) and SPSS-ready thesis export — fully offline.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:drift/drift.dart';
import 'package:excel/excel.dart';
import 'package:intl/intl.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';

import '../data/database.dart';
import '../scoring/scores.dart';

class ExportService {
  ExportService(this.db);
  final AppDatabase db;
  final _d = DateFormat('yyyy-MM-dd');
  static int? _fst(String? f) { final i = const ['I', 'II', 'III', 'IV', 'V', 'VI'].indexOf(f ?? ''); return i < 0 ? null : i + 1; }

  CellValue _cell(Object? v) => switch (v) {
        null => TextCellValue(''),
        int i => IntCellValue(i),
        double x => DoubleCellValue(x),
        _ => TextCellValue('$v'),
      };

  Future<File> _write(String name, List<int> bytes) async {
    final f = File(p.join((await getTemporaryDirectory()).path, name));
    return f.writeAsBytes(bytes, flush: true);
  }

  Future<void> share(File f) => Share.shareXFiles([XFile(f.path)]);

  // ---------------- NMC logbook ----------------
  Future<File> logbookExcel() async {
    final rows = await (db.select(db.nmcLogbook)..orderBy([(t) => OrderingTerm.asc(t.procedureDate)])).get();
    final uhids = {for (final p in await db.select(db.patients).get()) p.id: p.uhid};
    final x = Excel.createExcel();
    final s = x['Logbook'];
    s.appendRow(['S.No', 'Date', 'Year', 'Procedure', 'Category', 'Role', 'UHID', 'Indication', 'Supervisor', 'Faculty signature'].map(_cell).toList());
    var i = 0;
    for (final r in rows) {
      s.appendRow([++i, _d.format(r.procedureDate), r.residencyYear, r.procedureName, r.category, r.role, uhids[r.patientId] ?? '', r.indication, r.supervisor, ''].map(_cell).toList());
    }
    final sum = x['Summary'];
    sum.appendRow(['Procedure', 'JR1 P', 'JR1 A', 'JR1 O', 'JR2 P', 'JR2 A', 'JR2 O', 'JR3 P', 'JR3 A', 'JR3 O'].map(_cell).toList());
    for (final name in {for (final r in rows) r.procedureName}) {
      sum.appendRow([name, for (final y in ['JR1', 'JR2', 'JR3']) for (final role in ['Performed', 'Assisted', 'Observed']) rows.where((r) => r.procedureName == name && r.residencyYear == y && r.role == role).length].map(_cell).toList());
    }
    x.delete('Sheet1');
    return _write('NMC-logbook-${_d.format(DateTime.now())}.xlsx', x.save()!);
  }

  Future<Uint8List> logbookPdf({required String resident, required String institution}) async {
    final rows = await (db.select(db.nmcLogbook)..orderBy([(t) => OrderingTerm.asc(t.procedureDate)])).get();
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4.landscape,
      build: (_) => [
        pw.Header(level: 0, text: 'PG Procedure Logbook — MD Dermatology, Venereology & Leprosy'),
        pw.Text('Resident: Dr. $resident    Institution: $institution'),
        for (final y in ['JR1', 'JR2', 'JR3']) ...[
          pw.Header(level: 1, text: y),
          pw.TableHelper.fromTextArray(
            headers: ['#', 'Date', 'Procedure', 'Role', 'Indication', 'Supervisor', 'Sign'],
            data: [
              for (final (i, r) in rows.where((r) => r.residencyYear == y).indexed)
                ['${i + 1}', _d.format(r.procedureDate), r.procedureName, r.role, r.indication, r.supervisor, ''],
            ],
            cellStyle: const pw.TextStyle(fontSize: 8), headerStyle: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 30),
          pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceAround, children: [for (final s in ['Unit Head', 'PG Guide', 'HOD, DVL']) pw.Text('_______________\n$s')]),
        ],
      ],
    ));
    return doc.save();
  }

  // ---------------- Thesis: wide format, numeric coding, data dictionary ----------------
  Future<File> thesisExcel({bool includeUhid = false}) async {
    final cfg = await db.select(db.thesisConfig).getSingle();
    final weeks = (jsonDecode(cfg.weeksJson) as List).cast<int>();
    final labels = [for (final w in weeks) w == 0 ? 'Baseline' : 'W$w'];
    final vars = (jsonDecode(cfg.variablesJson) as List).cast<Map<String, dynamic>>();
    final baseVars = vars.where((v) => v['scope'] == 'baseline').toList(), visVars = vars.where((v) => v['scope'] != 'baseline').toList();
    final scale = cfg.primaryScale;
    Object? code(Map<String, dynamic> v, String? raw) {
      if (raw == null || raw.isEmpty) return null;
      switch (v['type']) {
        case 'number': return num.tryParse(raw) ?? raw;
        case 'yesno': return int.tryParse(raw);
        case 'select':
          final opts = '${v['options']}'.split(',').map((s) => s.trim()).toList();
          return opts.every((o) => num.tryParse(o) != null) ? num.tryParse(raw) : opts.indexOf(raw) + 1;
        default: return raw;
      }
    }

    final x = Excel.createExcel();
    final data = x['Data'];
    data.appendRow([
      'Study_ID', if (includeUhid) 'UHID', 'Group', 'Age', 'Sex', 'FST', ...baseVars.map((v) => v['name']),
      for (final l in labels) ...[if (scale != null) '${scale}_$l', for (final v in visVars) '${v['name']}_$l'],
      if (scale != null) for (final l in labels.skip(1)) 'Pct_Improve_$l',
      'AE_any', 'AE_count', 'Dropout',
    ].map(_cell).toList());

    final pts = await (db.select(db.patients)..where((t) => t.thesisArm.isNotNull())..orderBy([(t) => OrderingTerm.asc(t.studyId)])).get();
    for (final pt in pts) {
      final vs = await (db.select(db.visits)..where((t) => t.patientId.equals(pt.id))).get();
      Visit? at(String l) => vs.where((v) => v.visitLabel == l).firstOrNull;
      Future<Map<String, String>> crf(Visit? v) async => v == null ? {} : {for (final c in await (db.select(db.crfValues)..where((t) => t.visitId.equals(v.id))).get()) c.varName: c.value};
      Future<double?> score(Visit? v) async => v == null || scale == null ? null : (await (db.select(db.clinicalScores)..where((t) => t.visitId.equals(v.id) & t.scaleName.equals(scale))).get()).lastOrNull?.totalScore;
      final base = await crf(at('Baseline'));
      final row = <Object?>[pt.studyId, if (includeUhid) pt.uhid, pt.thesisArm == 'Case' ? 1 : 2, pt.age, {'M': 1, 'F': 2, 'O': 3}[pt.sex], _fst(pt.fitzpatrickType), ...baseVars.map((v) => code(v, base[v['name']]))];
      final sc = <String, double?>{};
      for (final l in labels) {
        final v = at(l), c = await crf(v);
        sc[l] = await score(v);
        if (scale != null) row.add(sc[l]);
        row.addAll(visVars.map((vv) => code(vv, c[vv['name']])));
      }
      if (scale != null) for (final l in labels.skip(1)) row.add(sc['Baseline'] != null && sc[l] != null ? pctImprovement(sc['Baseline']!, sc[l]!) : null);
      final ae = vs.isEmpty ? 0 : (await (db.select(db.adverseEvents)..where((t) => t.visitId.isIn(vs.map((v) => v.id)))).get()).length;
      row.addAll([ae > 0 ? 1 : 0, ae, pt.dropout ? 1 : 0]);
      data.appendRow(row.map(_cell).toList());
    }

    final dict = x['Data dictionary'];
    dict.appendRow(['Variable', 'Label', 'Coding'].map(_cell).toList());
    for (final r in [
      ['Group', 'Study arm', '1 = ${cfg.groupA}; 2 = ${cfg.groupB}'], ['Sex', 'Sex', '1 = Male; 2 = Female; 3 = Other'],
      ['FST', 'Fitzpatrick skin type', '1–6 = I–VI'], ['Dropout', 'Lost to follow-up', '1 = Yes; 0 = No'], ['AE_any', 'Any adverse event', '1 = Yes; 0 = No'],
      for (final v in vars) [v['name'], v['label'], v['type'] == 'yesno' ? '1 = Yes; 0 = No' : v['type'] == 'select' ? '${v['options']}'.split(',').indexed.map((e) => '${e.$1 + 1} = ${e.$2.trim()}').join('; ') : ''],
    ]) {
      dict.appendRow(r.map(_cell).toList());
    }
    x.delete('Sheet1');
    return _write('thesis-data-${_d.format(DateTime.now())}.xlsx', x.save()!);
  }
}
