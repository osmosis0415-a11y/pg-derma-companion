import 'dart:io';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:drift/drift.dart' hide Column, Table;
import 'package:flutter/material.dart';

import '../../main.dart';

const kPhotoCats = ['Clinical', 'Dermoscopy', 'Trichoscopy', 'Onychoscopy', "Wood's Lamp", 'KOH', 'Tzanck', 'SSS', 'Histopath'];

/// In-app camera that writes straight into the encrypted vault, with a ghost overlay
/// of the patient's baseline photo for reproducible follow-up framing.
class CameraScreen extends StatefulWidget {
  const CameraScreen({super.key, required this.patientId, this.visitId});
  final String patientId;
  final String? visitId;
  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> {
  CameraController? _cam;
  List<CameraDescription> _cams = [];
  int _ci = 0;
  String _cat = 'Clinical';
  final _site = TextEditingController();
  Uint8List? _ghost;
  double _ghostOpacity = 0.35;
  int _count = 0;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    _cams = await availableCameras();
    await _open();
    final scope = AppScope.of(context);
    final db = scope.db;
    final prev = await (db.select(db.mediaVault)..where((t) => t.patientId.equals(widget.patientId))..orderBy([(t) => OrderingTerm.asc(t.capturedAt)])).get();
    final base = prev.where((m) => m.isBaseline).firstOrNull ?? prev.where((m) => m.mediaCategory == 'Clinical' && !m.isDeidentified).firstOrNull;
    if (base != null) { final g = await scope.vault.decryptFile(base.encryptedFilePath); if (mounted) setState(() => _ghost = g); }
  }

  Future<void> _open() async {
    if (_cams.isEmpty) return;
    await _cam?.dispose();
    final c = CameraController(_cams[_ci], ResolutionPreset.veryHigh, enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg);
    await c.initialize();
    if (mounted) setState(() => _cam = c);
  }

  Future<void> _snap() async {
    if (_cam == null || _busy) return;
    setState(() => _busy = true);
    try {
      final shot = await _cam!.takePicture();
      final bytes = await shot.readAsBytes();
      await AppScope.of(context).vault.save(bytes, patientId: widget.patientId, visitId: widget.visitId, category: _cat, bodySite: _site.text.trim());
      try { await File(shot.path).delete(); } catch (_) {} // remove the plain temp file
      setState(() => _count++);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _cam?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(title: Text('Capture · $_count saved'), actions: [
        if (_cams.length > 1) IconButton(icon: const Icon(Icons.cameraswitch), onPressed: () { _ci = (_ci + 1) % _cams.length; _open(); }),
      ]),
      body: Column(children: [
        SizedBox(height: 48, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.all(6), children: [
          for (final c in kPhotoCats) Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(c), selected: _cat == c, onSelected: (_) => setState(() => _cat = c))),
        ])),
        Expanded(child: _cam == null
            ? const Center(child: CircularProgressIndicator())
            : Stack(fit: StackFit.expand, children: [
                CameraPreview(_cam!),
                if (_ghost != null) IgnorePointer(child: Opacity(opacity: _ghostOpacity, child: Image.memory(_ghost!, fit: BoxFit.cover))),
                IgnorePointer(child: CustomPaint(painter: _GridPainter())),
              ])),
        Container(color: Colors.black, padding: const EdgeInsets.all(12), child: Column(children: [
          TextField(controller: _site, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: 'Body site', hintStyle: TextStyle(color: Colors.white54))),
          Row(children: [
            const Text('Ghost', style: TextStyle(color: Colors.white)),
            Expanded(child: Slider(value: _ghostOpacity, max: 0.8, onChanged: _ghost == null ? null : (v) => setState(() => _ghostOpacity = v))),
            GestureDetector(onTap: _snap, child: Container(width: 70, height: 70, decoration: BoxDecoration(shape: BoxShape.circle, color: _busy ? Colors.grey : Colors.white, border: Border.all(color: Theme.of(context).colorScheme.primary, width: 5)))),
            const SizedBox(width: 12),
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
          ]),
        ])),
      ]),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()..color = Colors.white24..strokeWidth = 1;
    for (var i = 1; i < 3; i++) {
      c.drawLine(Offset(s.width * i / 3, 0), Offset(s.width * i / 3, s.height), p);
      c.drawLine(Offset(0, s.height * i / 3), Offset(s.width, s.height * i / 3), p);
    }
  }
  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

/// Minimal camera that returns a file path for OPD-slip OCR.
class SlipCameraScreen extends StatefulWidget {
  const SlipCameraScreen({super.key, required this.camera});
  final CameraDescription camera;
  @override
  State<SlipCameraScreen> createState() => _SlipCameraScreenState();
}

class _SlipCameraScreenState extends State<SlipCameraScreen> {
  late final CameraController _c = CameraController(widget.camera, ResolutionPreset.high, enableAudio: false);
  late final Future<void> _ready = _c.initialize();
  @override
  void dispose() { _c.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Scan OPD slip')),
        body: FutureBuilder(future: _ready, builder: (c, s) => s.connectionState == ConnectionState.done ? CameraPreview(_c) : const Center(child: CircularProgressIndicator())),
        floatingActionButton: FloatingActionButton(onPressed: () async { final f = await _c.takePicture(); if (context.mounted) Navigator.pop(context, f.path); }, child: const Icon(Icons.document_scanner)),
      );
}
