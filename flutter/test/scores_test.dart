import 'package:flutter_test/flutter_test.dart';
import 'package:pg_derma/scoring/scores.dart';

void main() {
  test('PASI max = 72', () {
    const f = {'e': 4, 'i': 4, 's': 4, 'a': 6};
    expect(Pasi().calc({'head': f, 'ul': f, 'trunk': f, 'll': f}), 72);
  });
  test('PASI example', () {
    expect(Pasi().calc({'head': {'e': 2, 'i': 2, 's': 2, 'a': 2}, 'trunk': {'e': 3, 'i': 3, 's': 3, 'a': 3}}), 9.3);
  });
  test('EASI adult & child max = 72', () {
    const f = {'e': 3, 'p': 3, 'x': 3, 'l': 3, 'a': 6};
    expect(Easi().calc({'head': f, 'ul': f, 'trunk': f, 'll': f}), 72);
    expect(Easi().calc({'child': true, 'head': f, 'ul': f, 'trunk': f, 'll': f}), 72);
  });
  test('SCORAD max = 103, objective = 83', () {
    final reg = {for (final k in ['hn', 'ula', 'ulb', 'tf', 'tb', 'lla', 'llb', 'gen']) k: 100};
    final inten = {for (final k in ['er', 'ed', 'oo', 'ex', 'li', 'dr']) k: 3};
    expect(Scorad().calc({'reg': reg, 'int': inten, 'itch': 10, 'sleep': 10}), 103);
    expect(Scorad().objective({'reg': reg, 'int': inten}), 83);
  });
  test('SALT weighting', () => expect(Salt().calc({'top': 50, 'back': 100}), 44));
  test('MASI 48 / mMASI 24', () {
    const m = {'a': 6, 'd': 4, 'h': 4};
    final v = {'f': m, 'rm': m, 'lm': m, 'c': m};
    expect(const Masi().calc(v), 48);
    expect(const Masi(modified: true).calc(v), 24);
  });
  test('VASI', () => expect(Vasi().calc({'hands': {'hu': 2, 'dp': 75}, 'trunk': {'hu': 1, 'dp': 100}}), 2.5));
  test('GAGS max = 44', () => expect(Gags().calc({'fh': 4, 'rc': 4, 'lc': 4, 'no': 4, 'ch': 4, 'cb': 4}), 44));
  test('DLQI', () => expect(Dlqi().calc({for (var i = 0; i < 9; i++) 'q$i': '3', 'q9': '0'}), 27));
  test('% improvement', () => expect(pctImprovement(20, 5), 75));
  test('Isotretinoin 60 kg @30 mg', () {
    final r = isotretinoin(weightKg: 60, dailyMg: 30, takenMg: 3600);
    expect(r.target, 7200); expect(r.remaining, 3600); expect(r.days, 120);
  });
  test('Lignocaine 60 kg', () {
    final r = lignocaineMax(60);
    expect(r.plain, 270); expect(r.withAdrenaline, 420);
  });
}
