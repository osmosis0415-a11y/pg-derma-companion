import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:drift/drift.dart' hide Column, Table;
import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:uuid/uuid.dart';

import '../../data/database.dart';
import '../../main.dart';
import '../../services/ml_services.dart';
import 'camera_screen.dart';

const kBuckets = ['Thesis Case', 'Thesis Control', 'Rare / Case Report', 'Clinical Meet', 'Exam Spotter', 'Logbook', 'Routine'];
const kFlags = ['Pregnant', 'Lactating', 'G6PD deficient', 'Diabetic', 'HIV+', 'On anticoagulants'];
const kQuickDx = ['Psoriasis', 'Dermatophytosis (Tinea)', 'Acne vulgaris', 'Vitiligo', 'Melasma', 'Scabies', 'Urticaria', 'Atopic dermatitis', 'Alopecia areata', 'Leprosy – BT', 'Lichen planus', 'Pemphigus vulgaris'];

/// 30-second OPD capture: OCR slip → chips → save (→ camera).
class QuickCaptureScreen extends StatefulWidget {
  const QuickCaptureScreen({super.key});
  @override
  State<QuickCaptureScreen> createState() => _QuickCaptureScreenState();
}

class _QuickCaptureScreenState extends State<QuickCaptureScreen> {
  final _uhid = TextEditingController(), _name = TextEditingController(), _age = TextEditingController(), _phone = TextEditingController(), _notes = TextEditingController();
  String? _sex, _fst;
  final _flags = <String>{}, _dx = <String>{}, _buckets = <String>{'Routine'};
  int? _fuDays;
  final _speech = SpeechToText();

  Future<void> _scanSlip() async {
    final cams = await availableCameras();
    if (!mounted || cams.isEmpty) return;
    final path = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => SlipCameraScreen(camera: cams.first)));
    if (path == null) return;
    final ocr = OcrService();
    final s = await ocr.readSlip(path);
    ocr.dispose();
    setState(() {
      if (s.uhid != null) _uhid.text = s.uhid!;
      if (s.name != null) _name.text = s.name!;
      if (s.age != null) _age.text = '${s.age}';
      _sex = s.sex ?? _sex;
    });
  }

  Future<void> _dictate() async {
    if (!await _speech.initialize()) return;
    _speech.listen(localeId: 'en_IN', onResult: (r) { if (r.finalResult) setState(() => _notes.text = '${_notes.text} ${r.recognizedWords}'.trim()); });
  }

  Future<void> _save({bool photo = false}) async {
    final scope = AppScope.of(context), db = scope.db;
    final uhid = _uhid.text.trim();
    if (uhid.isEmpty) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('UHID is required'))); return; }
    var pt = await db.patientByUhid(uhid);
    final id = pt?.id ?? const Uuid().v4();
    final cfg = await db.select(db.thesisConfig).getSingleOrNull();
    final arm = _buckets.contains('Thesis Case') ? 'Case' : _buckets.contains('Thesis Control') ? 'Control' : null;
    await db.into(db.patients).insertOnConflictUpdate(PatientsCompanion.insert(
      id: id, uhid: uhid,
      fullName: Value(_name.text.trim().isEmpty ? (pt?.fullName ?? '') : _name.text.trim()),
      age: Value(int.tryParse(_age.text) ?? pt?.age), sex: Value(_sex ?? pt?.sex), phone: Value(_phone.text.trim().isEmpty ? pt?.phone : _phone.text.trim()),
      fitzpatrickType: Value(_fst ?? pt?.fitzpatrickType), safetyFlags: Value(jsonEncode(_flags.toList())),
      academicBuckets: Value(jsonEncode(_buckets.toList())),
      thesisArm: Value(pt?.thesisArm ?? (cfg != null ? arm : null)),
      enrolledOn: Value(pt?.enrolledOn ?? (cfg != null && arm != null ? DateTime.now() : null)),
      studyId: Value(pt?.studyId ?? (cfg != null && arm != null ? await db.nextStudyId() : null)),
    ));
    final vid = const Uuid().v4();
    final n = (await (db.select(db.visits)..where((t) => t.patientId.equals(id))).get()).length;
    await db.into(db.visits).insert(VisitsCompanion.insert(
      id: vid, patientId: id, visitDate: DateTime.now(), visitLabel: n == 0 ? (arm != null ? 'Baseline' : 'First visit') : 'Visit ${n + 1}',
      diagnosisTags: Value(jsonEncode(_dx.toList())), clinicalNotes: Value(_notes.text),
    ));
    if (_fuDays != null) {
      await db.into(db.reminders).insert(RemindersCompanion.insert(id: const Uuid().v4(), patientId: Value(id), type: arm != null ? 'Thesis follow-up' : 'Review visit', dueAt: DateTime.now().add(Duration(days: _fuDays!)), note: Value(_dx.join(', '))));
    }
    if (!mounted) return;
    if (photo) {
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => AppScope(db: db, vault: scope.vault, child: CameraScreen(patientId: id, visitId: vid))));
    } else {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(pt == null ? 'Patient saved' : 'Visit added')));
    }
  }

  Widget _chips(List<String> opts, bool Function(String) on, void Function(String) tap) =>
      Wrap(spacing: 6, runSpacing: 6, children: [for (final o in opts) FilterChip(label: Text(o), selected: on(o), onSelected: (_) => setState(() => tap(o)))]);

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(height: 12);
    return Scaffold(
      appBar: AppBar(title: const Text('Quick add'), actions: [IconButton(onPressed: _scanSlip, icon: const Icon(Icons.document_scanner_outlined), tooltip: 'Scan OPD slip')]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: _uhid, autofocus: true, decoration: const InputDecoration(labelText: 'UHID / OPD no. *', border: OutlineInputBorder())),
        gap,
        Row(children: [
          Expanded(child: TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name (optional)'))),
          const SizedBox(width: 12),
          SizedBox(width: 80, child: TextField(controller: _age, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Age'))),
        ]),
        TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone (WhatsApp)')),
        gap, const Text('Sex'), _chips(const ['M', 'F', 'O'], (o) => _sex == o, (o) => _sex = _sex == o ? null : o),
        gap, const Text('Fitzpatrick'), _chips(const ['I', 'II', 'III', 'IV', 'V', 'VI'], (o) => _fst == o, (o) => _fst = _fst == o ? null : o),
        gap, const Text('Safety flags'), _chips(kFlags, _flags.contains, (o) => _flags.contains(o) ? _flags.remove(o) : _flags.add(o)),
        gap, const Text('Diagnosis'), _chips(kQuickDx, _dx.contains, (o) => _dx.contains(o) ? _dx.remove(o) : _dx.add(o)),
        gap, const Text('Academic buckets'), _chips(kBuckets, _buckets.contains, (o) => _buckets.contains(o) ? _buckets.remove(o) : _buckets.add(o)),
        gap,
        TextField(controller: _notes, maxLines: 3, decoration: InputDecoration(labelText: 'Notes', suffixIcon: IconButton(icon: const Icon(Icons.mic), onPressed: _dictate))),
        gap, const Text('Follow-up'),
        _chips(const ['1 wk', '2 wk', '4 wk', '6 wk', '3 mo'], (o) => _fuDays == {'1 wk': 7, '2 wk': 14, '4 wk': 28, '6 wk': 42, '3 mo': 90}[o], (o) { final d = {'1 wk': 7, '2 wk': 14, '4 wk': 28, '6 wk': 42, '3 mo': 90}[o]; _fuDays = _fuDays == d ? null : d; }),
        const SizedBox(height: 24),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => _save(photo: true), icon: const Icon(Icons.photo_camera), label: const Text('Save + photo'))),
          const SizedBox(width: 12),
          Expanded(child: FilledButton(onPressed: _save, child: const Text('Save'))),
        ]),
      ]),
    );
  }
}
