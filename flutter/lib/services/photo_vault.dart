// Encrypted, gallery-isolated photo storage.
// Images are re-encoded (strips EXIF/GPS), AES-256-GCM encrypted and written to
// the app's private documents directory, which never appears in Photos/Gallery.
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../data/database.dart';

class PhotoVault {
  PhotoVault(this.db, Uint8List key) : _key = SecretKey(key);
  final AppDatabase db;
  final SecretKey _key;
  final _aes = AesGcm.with256bits();

  Future<Directory> _dir() async {
    final d = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'vault'));
    if (!await d.exists()) await d.create(recursive: true);
    return d;
  }

  Future<Uint8List> _encrypt(List<int> plain) async {
    final box = await _aes.encrypt(plain, secretKey: _key);
    return box.concatenation(); // nonce | ciphertext | mac
  }

  Future<Uint8List> decryptFile(String path) async {
    final bytes = await File(path).readAsBytes();
    final box = SecretBox.fromConcatenation(bytes, nonceLength: 12, macLength: 16);
    return Uint8List.fromList(await _aes.decrypt(box, secretKey: _key));
  }

  /// Saves raw camera bytes into the vault. Returns the new media id.
  Future<String> save(Uint8List raw, {required String patientId, String? visitId, required String category,
      String bodySite = '', bool deidentified = false, String? sourceId}) async {
    final decoded = img.decodeImage(raw);
    if (decoded == null) throw const FormatException('Unsupported image');
    final oriented = img.bakeOrientation(decoded);
    final full = oriented.width > 2400 || oriented.height > 2400
        ? img.copyResize(oriented, width: oriented.width >= oriented.height ? 2400 : null, height: oriented.height > oriented.width ? 2400 : null)
        : oriented;
    final thumb = img.copyResize(oriented, width: 360);
    final id = const Uuid().v4();
    final dir = await _dir();
    final fp = p.join(dir.path, '$id.bin'), tp = p.join(dir.path, '${id}_t.bin');
    await File(fp).writeAsBytes(await _encrypt(img.encodeJpg(full, quality: 88)), flush: true);
    await File(tp).writeAsBytes(await _encrypt(img.encodeJpg(thumb, quality: 80)), flush: true);
    await db.into(db.mediaVault).insert(MediaVaultCompanion.insert(
          id: id, patientId: patientId, visitId: Value(visitId), encryptedFilePath: fp, thumbFilePath: tp,
          mediaCategory: category, bodySite: Value(bodySite), isDeidentified: Value(deidentified), sourceMediaId: Value(sourceId),
        ));
    return id;
  }

  Future<void> delete(MediaVaultData m) async {
    for (final f in [m.encryptedFilePath, m.thumbFilePath]) {
      final file = File(f);
      if (await file.exists()) await file.delete();
    }
    await (db.delete(db.mediaVault)..where((t) => t.id.equals(m.id))).go();
  }

  /// Decrypts to a temporary plain file for sharing; caller should delete afterwards.
  Future<File> exportTemp(MediaVaultData m) async {
    final bytes = await decryptFile(m.encryptedFilePath);
    final f = File(p.join((await getTemporaryDirectory()).path, '${m.isDeidentified ? 'case' : 'photo'}-${m.id.substring(0, 6)}.jpg'));
    return f.writeAsBytes(bytes, flush: true);
  }
}
