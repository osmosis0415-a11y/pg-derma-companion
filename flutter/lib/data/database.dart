// Offline-first encrypted database (Drift + SQLCipher, AES-256).
// Generate the companion code with:  dart run build_runner build
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlcipher_flutter_libs/sqlcipher_flutter_libs.dart';
import 'package:sqlite3/open.dart';

part 'database.g.dart';

// 1. Patient master (OPD + thesis cohort)
class Patients extends Table {
  TextColumn get id => text()(); // UUID
  TextColumn get uhid => text().withLength(min: 1, max: 50)();
  TextColumn get fullName => text().withDefault(const Constant(''))();
  IntColumn get age => integer().nullable()();
  TextColumn get sex => text().nullable()(); // M, F, O
  TextColumn get phone => text().nullable()();
  TextColumn get fitzpatrickType => text().nullable()(); // I–VI
  TextColumn get safetyFlags => text().withDefault(const Constant('[]'))(); // JSON: Pregnant, Lactating, G6PD…
  TextColumn get allergies => text().withDefault(const Constant('[]'))(); // JSON
  TextColumn get academicBuckets => text().withDefault(const Constant('["Routine"]'))(); // JSON
  TextColumn get thesisArm => text().nullable()(); // Case | Control
  TextColumn get studyId => text().nullable()(); // T001…
  DateTimeColumn get enrolledOn => dateTime().nullable()();
  BoolColumn get dropout => boolean().withDefault(const Constant(false))();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  @override
  Set<Column> get primaryKey => {id};
}

// 2. Longitudinal visits (Baseline, W4, W8… or routine)
class Visits extends Table {
  TextColumn get id => text()();
  TextColumn get patientId => text().references(Patients, #id, onDelete: KeyAction.cascade)();
  DateTimeColumn get visitDate => dateTime()();
  TextColumn get visitLabel => text()();
  TextColumn get diagnosisTags => text().withDefault(const Constant('[]'))(); // JSON list
  TextColumn get clinicalNotes => text().nullable()();
  TextColumn get finalDiagnosis => text().nullable()(); // after HPE correlation
  IntColumn get vida => integer().nullable()();
  @override
  Set<Column> get primaryKey => {id};
}

// 3. Validated clinical scores (PASI, EASI, SCORAD, SALT, MASI, mMASI, VASI, GAGS, DLQI)
class ClinicalScores extends Table {
  TextColumn get id => text()();
  TextColumn get visitId => text().references(Visits, #id, onDelete: KeyAction.cascade)();
  TextColumn get scaleName => text()();
  TextColumn get subScoresJson => text()(); // raw slider/region inputs
  RealColumn get totalScore => real()();
  @override
  Set<Column> get primaryKey => {id};
}

// 4. Encrypted photo vault (files are AES-GCM encrypted in the app sandbox)
class MediaVault extends Table {
  TextColumn get id => text()();
  TextColumn get patientId => text().references(Patients, #id, onDelete: KeyAction.cascade)();
  TextColumn get visitId => text().nullable().references(Visits, #id, onDelete: KeyAction.setNull)();
  TextColumn get encryptedFilePath => text()();
  TextColumn get thumbFilePath => text()();
  TextColumn get mediaCategory => text()(); // Clinical, Dermoscopy, Trichoscopy, WoodsLamp, KOH, SSS, Histopath
  TextColumn get bodySite => text().withDefault(const Constant(''))();
  BoolColumn get isBaseline => boolean().withDefault(const Constant(false))();
  BoolColumn get isDeidentified => boolean().withDefault(const Constant(false))();
  TextColumn get sourceMediaId => text().nullable()();
  DateTimeColumn get capturedAt => dateTime().withDefault(currentDateAndTime)();
  @override
  Set<Column> get primaryKey => {id};
}

// 5. Anatomical pins (body, face, scalp, oral, genital, palms/soles, nerves)
class BodyPins extends Table {
  TextColumn get id => text()();
  TextColumn get visitId => text().references(Visits, #id, onDelete: KeyAction.cascade)();
  TextColumn get chartType => text()();
  RealColumn get x => real()(); // 0–300 viewBox units
  RealColumn get y => real()(); // 0–400
  TextColumn get pinType => text()(); // lesion, biopsy, sensory, inject, nerve, note
  TextColumn get notes => text().withDefault(const Constant(''))();
  @override
  Set<Column> get primaryKey => {id};
}

// 6. Bedside investigations & biopsy correlation board
class Investigations extends Table {
  TextColumn get id => text()();
  TextColumn get patientId => text().references(Patients, #id, onDelete: KeyAction.cascade)();
  TextColumn get visitId => text().nullable()();
  TextColumn get testType => text()(); // Skin biopsy (HPE), Slit skin smear, KOH…
  DateTimeColumn get sentOn => dateTime()();
  TextColumn get status => text().withDefault(const Constant('sent'))(); // sent | traced | done
  TextColumn get result => text().nullable()();
  RealColumn get bacteriologicalIndex => real().nullable()();
  RealColumn get morphologicalIndex => real().nullable()();
  @override
  Set<Column> get primaryKey => {id};
}

// 7. Follow-up & procedure reminders
class Reminders extends Table {
  TextColumn get id => text()();
  TextColumn get patientId => text().nullable()();
  TextColumn get type => text()(); // Thesis follow-up, Phototherapy, Suture removal, HPE collection…
  DateTimeColumn get dueAt => dateTime()();
  TextColumn get note => text().withDefault(const Constant(''))();
  BoolColumn get done => boolean().withDefault(const Constant(false))();
  @override
  Set<Column> get primaryKey => {id};
}

// 8. NMC PG e-logbook
class NmcLogbook extends Table {
  TextColumn get id => text()();
  TextColumn get patientId => text().nullable()();
  TextColumn get visitId => text().nullable()();
  DateTimeColumn get procedureDate => dateTime()();
  TextColumn get procedureName => text()();
  TextColumn get category => text()();
  TextColumn get role => text()(); // Performed | Assisted | Observed
  TextColumn get residencyYear => text()(); // JR1 | JR2 | JR3
  TextColumn get indication => text().withDefault(const Constant(''))();
  TextColumn get supervisor => text().withDefault(const Constant(''))();
  BoolColumn get facultyVerified => boolean().withDefault(const Constant(false))();
  @override
  Set<Column> get primaryKey => {id};
}

// 9. Thesis configuration (single row) + CRF values + adverse events
class ThesisConfig extends Table {
  IntColumn get id => integer().withDefault(const Constant(1))();
  TextColumn get title => text()();
  TextColumn get primaryScale => text().nullable()();
  TextColumn get weeksJson => text()(); // [0,4,8,12]
  TextColumn get groupA => text().withDefault(const Constant('Case'))();
  TextColumn get groupB => text().withDefault(const Constant('Control'))();
  IntColumn get targetA => integer().withDefault(const Constant(30))();
  IntColumn get targetB => integer().withDefault(const Constant(30))();
  TextColumn get variablesJson => text()(); // [{name,label,type,options,scope}]
  @override
  Set<Column> get primaryKey => {id};
}

class CrfValues extends Table {
  TextColumn get visitId => text().references(Visits, #id, onDelete: KeyAction.cascade)();
  TextColumn get varName => text()();
  TextColumn get value => text()();
  @override
  Set<Column> get primaryKey => {visitId, varName};
}

class AdverseEvents extends Table {
  TextColumn get id => text()();
  TextColumn get visitId => text().references(Visits, #id, onDelete: KeyAction.cascade)();
  TextColumn get event => text()();
  TextColumn get severity => text()(); // Mild | Moderate | Severe
  TextColumn get causality => text()(); // WHO-UMC
  TextColumn get action => text().withDefault(const Constant(''))();
  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(tables: [
  Patients, Visits, ClinicalScores, MediaVault, BodyPins, Investigations,
  Reminders, NmcLogbook, ThesisConfig, CrfValues, AdverseEvents,
])
class AppDatabase extends _$AppDatabase {
  AppDatabase(String hexKey) : super(_openEncrypted(hexKey));

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        beforeOpen: (d) async => customStatement('PRAGMA foreign_keys = ON'),
      );

  // ---- Common queries ----
  Future<Patient?> patientByUhid(String uhid) =>
      (select(patients)..where((t) => t.uhid.lower().equals(uhid.toLowerCase()))).getSingleOrNull();

  Stream<List<Visit>> watchVisits(String patientId) => (select(visits)
        ..where((t) => t.patientId.equals(patientId))
        ..orderBy([(t) => OrderingTerm.asc(t.visitDate)]))
      .watch();

  Stream<List<Reminder>> watchDue(DateTime until) => (select(reminders)
        ..where((t) => t.done.equals(false) & t.dueAt.isSmallerOrEqualValue(until))
        ..orderBy([(t) => OrderingTerm.asc(t.dueAt)]))
      .watch();

  Future<int> countArm(String arm) async {
    final c = patients.id.count();
    final q = selectOnly(patients)
      ..addColumns([c])
      ..where(patients.thesisArm.equals(arm) & patients.dropout.equals(false));
    return (await q.getSingle()).read(c) ?? 0;
  }

  Future<String> nextStudyId() async {
    final all = await (select(patients)..where((t) => t.studyId.isNotNull())).get();
    final maxN = all.map((p) => int.tryParse(p.studyId!.replaceAll(RegExp(r'\D'), '')) ?? 0).fold(0, (a, b) => a > b ? a : b);
    return 'T${(maxN + 1).toString().padLeft(3, '0')}';
  }

  Stream<List<NmcLogbookData>> watchLogbook({String? year}) {
    final q = select(nmcLogbook)..orderBy([(t) => OrderingTerm.desc(t.procedureDate)]);
    if (year != null) q.where((t) => t.residencyYear.equals(year));
    return q.watch();
  }
}

/// Opens the SQLite file encrypted with SQLCipher using a raw 256-bit key
/// (kept in iOS Keychain / Android Keystore by KeyService).
LazyDatabase _openEncrypted(String hexKey) {
  return LazyDatabase(() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'pgderma.sqlite'));
    if (Platform.isAndroid) await applyWorkaroundToOpenSqlCipherOnOldAndroidVersions();
    return NativeDatabase.createInBackground(
      file,
      isolateSetup: () {
        open.overrideFor(OperatingSystem.android, openCipherOnAndroid);
      },
      setup: (raw) {
        final v = raw.select('PRAGMA cipher_version');
        if (v.isEmpty) throw UnsupportedError('SQLCipher is not available — database would be unencrypted.');
        raw.execute("PRAGMA key = \"x'$hexKey'\";");
        raw.execute('SELECT count(*) FROM sqlite_master'); // fails fast on wrong key
      },
    );
  });
}
