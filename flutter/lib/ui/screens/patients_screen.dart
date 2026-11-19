import 'dart:convert';

import 'package:drift/drift.dart' hide Column, Table;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/database.dart';
import '../../main.dart';
import 'camera_screen.dart';
import 'score_screen.dart';

/// Patient roster. On tablets (≥900 dp) shows a master–detail split view.
class PatientsScreen extends StatefulWidget {
  const PatientsScreen({super.key});
  @override
  State<PatientsScreen> createState() => _PatientsScreenState();
}

class _PatientsScreenState extends State<PatientsScreen> {
  String _q = '';
  String? _sel;

  @override
  Widget build(BuildContext context) {
    final db = AppScope.of(context).db;
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final list = StreamBuilder<List<Patient>>(
      stream: (db.select(db.patients)..orderBy([(t) => OrderingTerm.desc(t.createdAt)])).watch(),
      builder: (c, s) {
        final q = _q.toLowerCase();
        final pts = (s.data ?? []).where((p) => q.isEmpty || '${p.uhid} ${p.fullName}'.toLowerCase().contains(q)).toList();
        return Column(children: [
          Padding(padding: const EdgeInsets.all(8), child: SearchBar(hintText: 'Search UHID or name', onChanged: (v) => setState(() => _q = v))),
          Expanded(child: ListView.builder(itemCount: pts.length, itemBuilder: (c, i) {
            final p = pts[i];
            return ListTile(
              selected: p.id == _sel,
              title: Text(p.uhid), subtitle: Text([p.fullName, if (p.age != null) '${p.age} y', p.sex, if (p.fitzpatrickType != null) 'FST ${p.fitzpatrickType}', if (p.thesisArm != null) '${p.studyId} · ${p.thesisArm}'].whereType<String>().where((e) => e.isNotEmpty).join(' · ')),
              onTap: () => wide ? setState(() => _sel = p.id) : Navigator.push(context, MaterialPageRoute(builder: (_) => AppScope(db: db, vault: AppScope.of(context).vault, child: PatientDetail(patientId: p.id)))),
            );
          })),
        ]);
      },
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Patients')),
      body: wide
          ? Row(children: [SizedBox(width: 340, child: list), const VerticalDivider(width: 1), Expanded(child: _sel == null ? const Center(child: Text('Select a patient')) : PatientDetail(key: ValueKey(_sel), patientId: _sel!, embedded: true))])
          : list,
    );
  }
}

class PatientDetail extends StatelessWidget {
  const PatientDetail({super.key, required this.patientId, this.embedded = false});
  final String patientId;
  final bool embedded;

  Future<void> _whatsApp(BuildContext context, Patient p) async {
    var ph = (p.phone ?? '').replaceAll(RegExp(r'\D'), '');
    if (ph.length == 11 && ph.startsWith('0')) ph = ph.substring(1);
    if (ph.length == 10) ph = '91$ph';
    final text = 'Dear ${p.fullName.isEmpty ? 'Patient' : p.fullName}, this is a reminder of your follow-up at the Dermatology OPD. Please bring your OPD card and previous reports. — Dept. of Dermatology';
    await launchUrl(Uri.parse('https://wa.me/$ph?text=${Uri.encodeComponent(text)}'), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), db = scope.db;
    final df = DateFormat('d MMM yyyy');
    final body = StreamBuilder<Patient>(
      stream: (db.select(db.patients)..where((t) => t.id.equals(patientId))).watchSingle(),
      builder: (c, ps) {
        final p = ps.data;
        if (p == null) return const Center(child: CircularProgressIndicator());
        final flags = (jsonDecode(p.safetyFlags) as List).cast<String>();
        return StreamBuilder<List<Visit>>(
          stream: db.watchVisits(p.id),
          builder: (c, vs) => ListView(padding: const EdgeInsets.all(12), children: [
            ListTile(title: Text(p.uhid, style: Theme.of(context).textTheme.headlineSmall), subtitle: Text([p.fullName, if (p.age != null) '${p.age} y', p.sex ?? ''].where((e) => e.isNotEmpty).join(' · '))),
            if (flags.isNotEmpty) Wrap(spacing: 6, children: [for (final f in flags) Chip(label: Text(f), backgroundColor: Theme.of(context).colorScheme.errorContainer)]),
            Wrap(spacing: 8, children: [
              FilledButton.tonalIcon(onPressed: () => _whatsApp(context, p), icon: const Icon(Icons.chat), label: const Text('WhatsApp')),
            ]),
            const Divider(),
            for (final v in (vs.data ?? []).reversed)
              Card(child: ExpansionTile(
                title: Text('${v.visitLabel} · ${df.format(v.visitDate)}'),
                subtitle: Text((jsonDecode(v.diagnosisTags) as List).join(', ')),
                children: [
                  if ((v.clinicalNotes ?? '').isNotEmpty) ListTile(title: Text(v.clinicalNotes!)),
                  OverflowBar(children: [
                    TextButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AppScope(db: db, vault: scope.vault, child: CameraScreen(patientId: p.id, visitId: v.id)))), icon: const Icon(Icons.photo_camera), label: const Text('Photo')),
                    for (final k in ['PASI', 'EASI', 'SALT', 'MASI', 'VASI', 'GAGS', 'DLQI'])
                      TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AppScope(db: db, vault: scope.vault, child: ScoreScreen(visitId: v.id, scale: k)))), child: Text('+$k')),
                  ]),
                ],
              )),
          ]),
        );
      },
    );
    return embedded ? body : Scaffold(appBar: AppBar(), body: body);
  }
}
