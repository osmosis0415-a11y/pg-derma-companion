// Validated dermatology scoring engines — pure Dart, unit-tested in test/scores_test.dart.
// Same formulas as the web app (web/src/scores.js).
double _r1(num x) => (x * 10).round() / 10;
double _n(dynamic v) => v == null ? 0 : (v is num ? v.toDouble() : double.tryParse('$v') ?? 0);
Map<String, dynamic> _m(dynamic v) => (v as Map?)?.cast<String, dynamic>() ?? const {};

class Region {
  const Region(this.key, this.label, this.weight);
  final String key, label;
  final double weight;
}

abstract class Score {
  String get name;
  String get fullName;
  double get max;
  double calc(Map<String, dynamic> v);
  String band(double t);
}

/// PASI: Σ w × (E + I + S) × area(0–6); E/I/S 0–4. Max 72.
class Pasi implements Score {
  static const regions = [Region('head', 'Head & neck', .1), Region('ul', 'Upper limbs', .2), Region('trunk', 'Trunk', .3), Region('ll', 'Lower limbs', .4)];
  @override String get name => 'PASI';
  @override String get fullName => 'Psoriasis Area & Severity Index';
  @override double get max => 72;
  @override double calc(Map<String, dynamic> v) {
    var t = 0.0;
    for (final r in regions) { final x = _m(v[r.key]); t += r.weight * (_n(x['e']) + _n(x['i']) + _n(x['s'])) * _n(x['a']); }
    return _r1(t);
  }
  @override String band(double t) => t < 5 ? 'Mild' : t <= 10 ? 'Moderate' : 'Severe';
}

/// EASI: Σ w × (E + Oedema/papulation + Excoriation + Lichenification; 0–3) × area(0–6). Child ≤7 y weights differ.
class Easi implements Score {
  @override String get name => 'EASI';
  @override String get fullName => 'Eczema Area & Severity Index';
  @override double get max => 72;
  @override double calc(Map<String, dynamic> v) {
    final child = v['child'] == true;
    final w = child ? {'head': .2, 'ul': .2, 'trunk': .3, 'll': .3} : {'head': .1, 'ul': .2, 'trunk': .3, 'll': .4};
    var t = 0.0;
    w.forEach((k, wt) { final x = _m(v[k]); t += wt * (_n(x['e']) + _n(x['p']) + _n(x['x']) + _n(x['l'])) * _n(x['a']); });
    return _r1(t);
  }
  @override String band(double t) => t == 0 ? 'Clear' : t <= 1 ? 'Almost clear' : t <= 7 ? 'Mild' : t <= 21 ? 'Moderate' : t <= 50 ? 'Severe' : 'Very severe';
}

/// SCORAD = A/5 + 7B/2 + C. A = BSA (rule of nines), B = 6 intensity items (0–3), C = itch + sleep VAS (0–10 each).
class Scorad implements Score {
  static const adult = {'hn': 9.0, 'ula': 9.0, 'ulb': 9.0, 'tf': 18.0, 'tb': 18.0, 'lla': 18.0, 'llb': 18.0, 'gen': 1.0};
  static const child = {'hn': 17.0, 'ula': 9.0, 'ulb': 9.0, 'tf': 18.0, 'tb': 18.0, 'lla': 12.0, 'llb': 12.0, 'gen': 1.0};
  @override String get name => 'SCORAD';
  @override String get fullName => 'SCORing Atopic Dermatitis';
  @override double get max => 103;
  double bsa(Map<String, dynamic> v) {
    if (v['bsaOverride'] != null && '${v['bsaOverride']}'.isNotEmpty) return _n(v['bsaOverride']).clamp(0, 100).toDouble();
    final w = v['child'] == true ? child : adult, reg = _m(v['reg']);
    var a = 0.0;
    w.forEach((k, wt) => a += wt * _n(reg[k]).clamp(0, 100) / 100);
    return a.clamp(0, 100).toDouble();
  }
  double _b(Map<String, dynamic> v) => _m(v['int']).values.fold(0.0, (s, e) => s + _n(e));
  double objective(Map<String, dynamic> v) => _r1(bsa(v) / 5 + 3.5 * _b(v));
  @override double calc(Map<String, dynamic> v) => _r1(bsa(v) / 5 + 3.5 * _b(v) + _n(v['itch']) + _n(v['sleep']));
  @override String band(double t) => t < 25 ? 'Mild' : t <= 50 ? 'Moderate' : 'Severe';
}

/// SALT = 0.40·top + 0.24·back + 0.18·right + 0.18·left (% loss per view).
class Salt implements Score {
  @override String get name => 'SALT';
  @override String get fullName => 'Severity of Alopecia Tool';
  @override double get max => 100;
  @override double calc(Map<String, dynamic> v) =>
      _r1(.40 * _n(v['top']).clamp(0, 100) + .24 * _n(v['back']).clamp(0, 100) + .18 * _n(v['right']).clamp(0, 100) + .18 * _n(v['left']).clamp(0, 100));
  @override String band(double t) => t <= 20 ? 'S1' : t <= 49 ? 'S2' : t <= 74 ? 'S3' : t <= 99 ? 'S4' : 'S5';
}

/// MASI = Σ w × A(0–6) × (D + H) (0–4 each); mMASI drops homogeneity.
class Masi implements Score {
  const Masi({this.modified = false});
  final bool modified;
  static const w = {'f': .3, 'rm': .3, 'lm': .3, 'c': .1};
  @override String get name => modified ? 'mMASI' : 'MASI';
  @override String get fullName => modified ? 'Modified MASI' : 'Melasma Area & Severity Index';
  @override double get max => modified ? 24 : 48;
  @override double calc(Map<String, dynamic> v) {
    var t = 0.0;
    w.forEach((k, wt) { final x = _m(v[k]); t += wt * _n(x['a']) * (_n(x['d']) + (modified ? 0 : _n(x['h']))); });
    return _r1(t);
  }
  @override String band(double t) => modified ? (t < 8 ? 'Mild' : t <= 16 ? 'Moderate' : 'Severe') : (t < 16 ? 'Mild' : t <= 32 ? 'Moderate' : 'Severe');
}

/// VASI = Σ hand units × residual depigmentation (100/90/75/50/25/10/0 %).
class Vasi implements Score {
  @override String get name => 'VASI';
  @override String get fullName => 'Vitiligo Area Scoring Index';
  @override double get max => 100;
  @override double calc(Map<String, dynamic> v) {
    var t = 0.0;
    for (final k in ['hands', 'ue', 'trunk', 'le', 'feet', 'hn']) { final x = _m(v[k]); t += _n(x['hu']) * _n(x['dp']) / 100; }
    return (t * 100).round() / 100;
  }
  @override String band(double t) => '';
}

/// GAGS = Σ location factor × grade (0 none … 4 nodule). Max 44.
class Gags implements Score {
  static const factors = {'fh': 2, 'rc': 2, 'lc': 2, 'no': 1, 'ch': 1, 'cb': 3};
  @override String get name => 'GAGS';
  @override String get fullName => 'Global Acne Grading System';
  @override double get max => 44;
  @override double calc(Map<String, dynamic> v) => factors.entries.fold(0.0, (s, e) => s + e.value * _n(v[e.key]));
  @override String band(double t) => t == 0 ? 'None' : t <= 18 ? 'Mild' : t <= 30 ? 'Moderate' : t <= 38 ? 'Severe' : 'Very severe';
}

/// DLQI: 10 items scored 0–3 (Not relevant = 0). Use the licensed official form for research.
class Dlqi implements Score {
  @override String get name => 'DLQI';
  @override String get fullName => 'Dermatology Life Quality Index';
  @override double get max => 30;
  @override double calc(Map<String, dynamic> v) => List.generate(10, (i) => int.tryParse('${v['q$i']}') ?? 0).fold(0, (a, b) => a + b).toDouble();
  @override String band(double t) => t <= 1 ? 'No effect' : t <= 5 ? 'Small' : t <= 10 ? 'Moderate' : t <= 20 ? 'Very large' : 'Extremely large';
}

final scores = <String, Score>{
  'PASI': Pasi(), 'EASI': Easi(), 'SCORAD': Scorad(), 'SALT': Salt(),
  'MASI': const Masi(), 'mMASI': const Masi(modified: true), 'VASI': Vasi(), 'GAGS': Gags(), 'DLQI': Dlqi(),
};

double? pctImprovement(double baseline, double current) => baseline > 0 ? _r1((baseline - current) / baseline * 100) : null;

/// Isotretinoin cumulative dosing.
({int target, int remaining, int? days}) isotretinoin({required double weightKg, required double dailyMg, required double takenMg, double targetMgPerKg = 120}) {
  final target = weightKg * targetMgPerKg, rem = (target - takenMg).clamp(0, double.infinity);
  return (target: target.round(), remaining: rem.round(), days: dailyMg > 0 ? (rem / dailyMg).ceil() : null);
}

/// Lignocaine maximum safe dose (mg): plain 4.5 mg/kg ≤300; with adrenaline 7 mg/kg ≤500.
({double plain, double withAdrenaline}) lignocaineMax(double kg) =>
    (plain: (4.5 * kg).clamp(0, 300).toDouble(), withAdrenaline: (7 * kg).clamp(0, 500).toDouble());
