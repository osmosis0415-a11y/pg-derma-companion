import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../data/database.dart';
import '../../main.dart';
import '../../scoring/scores.dart';

/// Generic score entry form driven by a field schema; totals update live.
class ScoreScreen extends StatefulWidget {
  const ScoreScreen({super.key, required this.visitId, required this.scale});
  final String visitId, scale;
  @override
  State<ScoreScreen> createState() => _ScoreScreenState();
}

typedef _F = ({String path, String label, List<(String, String)> opts});
const _area = [('0', '0%'), ('1', '<10%'), ('2', '10–29%'), ('3', '30–49%'), ('4', '50–69%'), ('5', '70–89%'), ('6', '90–100%')];
List<(String, String)> _n(int max) => [for (var i = 0; i <= max; i++) ('$i', '$i')];

List<_F> _schema(String s) {
  List<_F> region(List<(String, String)> regions, List<(String, String, int)> signs, {bool area = true}) => [
        for (final r in regions) ...[
          for (final sg in signs) (path: '${r.$1}.${sg.$1}', label: '${r.$2} – ${sg.$2}', opts: _n(sg.$3)),
          if (area) (path: '${r.$1}.a', label: '${r.$2} – Area', opts: _area),
        ],
      ];
  const limbs = [('head', 'Head & neck'), ('ul', 'Upper limbs'), ('trunk', 'Trunk'), ('ll', 'Lower limbs')];
  return switch (s) {
    'PASI' => region(limbs, [('e', 'Erythema', 4), ('i', 'Induration', 4), ('s', 'Desquamation', 4)]),
    'EASI' => region(limbs, [('e', 'Erythema', 3), ('p', 'Oedema/papulation', 3), ('x', 'Excoriation', 3), ('l', 'Lichenification', 3)]),
    'MASI' => region([('f', 'Forehead'), ('rm', 'R malar'), ('lm', 'L malar'), ('c', 'Chin')], [('d', 'Darkness', 4), ('h', 'Homogeneity', 4)]),
    'SALT' => [for (final r in [('top', 'Top 40%'), ('back', 'Back 24%'), ('right', 'Right 18%'), ('left', 'Left 18%')]) (path: r.$1, label: '${r.$2} – % hair loss', opts: [for (var i = 0; i <= 100; i += 10) ('$i', '$i%')])],
    'VASI' => [
        for (final r in [('hands', 'Hands'), ('ue', 'Upper extremities'), ('trunk', 'Trunk'), ('le', 'Lower extremities'), ('feet', 'Feet'), ('hn', 'Head & neck')]) ...[
          (path: '${r.$1}.hu', label: '${r.$2} – hand units', opts: [for (var i = 0; i <= 40; i++) ('${i / 2}', '${i / 2}')]),
          (path: '${r.$1}.dp', label: '${r.$2} – depigmentation', opts: const [('100', '100%'), ('90', '90%'), ('75', '75%'), ('50', '50%'), ('25', '25%'), ('10', '10%'), ('0', '0%')]),
        ],
      ],
    'GAGS' => [for (final r in [('fh', 'Forehead ×2'), ('rc', 'R cheek ×2'), ('lc', 'L cheek ×2'), ('no', 'Nose ×1'), ('ch', 'Chin ×1'), ('cb', 'Chest & back ×3')]) (path: r.$1, label: r.$2, opts: const [('0', 'None'), ('1', 'Comedones'), ('2', 'Papules'), ('3', 'Pustules'), ('4', 'Nodules')])],
    'DLQI' => [for (var i = 0; i < 10; i++) (path: 'q$i', label: 'Item ${i + 1}', opts: const [('0', 'Not at all / N.R.'), ('1', 'A little'), ('2', 'A lot'), ('3', 'Very much')])],
    _ => [],
  };
}

class _ScoreScreenState extends State<ScoreScreen> {
  final Map<String, dynamic> _v = {};
  late final List<_F> _fields = _schema(widget.scale);
  Score get _s => scores[widget.scale]!;

  void _set(String path, String value) {
    final parts = path.split('.');
    if (parts.length == 1) {
      _v[path] = value;
    } else {
      (_v[parts[0]] ??= <String, dynamic>{})[parts[1]] = value;
    }
    setState(() {});
  }

  String _get(String path) {
    final parts = path.split('.');
    final x = parts.length == 1 ? _v[path] : (_v[parts[0]] as Map?)?[parts[1]];
    return '${x ?? (path.endsWith('.dp') ? '100' : '0')}';
  }

  Future<void> _save() async {
    final db = AppScope.of(context).db;
    for (final f in _fields) { if (_get(f.path) != '' ) _set(f.path, _get(f.path)); }
    await db.into(db.clinicalScores).insert(ClinicalScoresCompanion.insert(id: const Uuid().v4(), visitId: widget.visitId, scaleName: widget.scale, subScoresJson: jsonEncode(_v), totalScore: _s.calc(_v)));
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final total = _s.calc(_v);
    return Scaffold(
      appBar: AppBar(title: Text(widget.scale)),
      body: Column(children: [
        Card(margin: const EdgeInsets.all(12), child: ListTile(title: Text(_s.fullName), subtitle: Text(_s.band(total)), trailing: Text('$total / ${_s.max.toInt()}', style: Theme.of(context).textTheme.headlineSmall))),
        Expanded(child: ListView(padding: const EdgeInsets.symmetric(horizontal: 12), children: [
          for (final f in _fields)
            Padding(padding: const EdgeInsets.only(bottom: 8), child: DropdownButtonFormField<String>(
              value: _get(f.path), decoration: InputDecoration(labelText: f.label, border: const OutlineInputBorder()),
              items: [for (final o in f.opts) DropdownMenuItem(value: o.$1, child: Text(o.$2))],
              onChanged: (v) => _set(f.path, v!),
            )),
        ])),
      ]),
      floatingActionButton: FloatingActionButton.extended(onPressed: _save, icon: const Icon(Icons.save), label: Text('Save ${widget.scale}')),
    );
  }
}
