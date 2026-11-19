// Biometric unlock + key management.
// A random 256-bit master key is generated once and kept in the platform
// keystore (iOS Keychain / Android Keystore, hardware-backed where available).
// It encrypts both the SQLCipher database and the photo files.
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

class KeyService {
  static const _k = 'pgderma_master_key_v1';
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
  );
  final _auth = LocalAuthentication();

  /// FaceID / TouchID / fingerprint, falling back to the device PIN.
  Future<bool> authenticate() async {
    final supported = await _auth.isDeviceSupported();
    if (!supported) return true; // no lock screen configured on device
    return _auth.authenticate(
      localizedReason: 'Unlock PG Derma vault',
      options: const AuthenticationOptions(biometricOnly: false, stickyAuth: true),
    );
  }

  Future<Uint8List> masterKey() async {
    final hex = await _storage.read(key: _k);
    if (hex != null) return _fromHex(hex);
    final r = Random.secure();
    final key = Uint8List.fromList(List.generate(32, (_) => r.nextInt(256)));
    await _storage.write(key: _k, value: _toHex(key));
    return key;
  }

  Future<String> masterKeyHex() async => _toHex(await masterKey());

  static String _toHex(Uint8List b) => b.map((e) => e.toRadixString(16).padLeft(2, '0')).join();
  static Uint8List _fromHex(String s) =>
      Uint8List.fromList(List.generate(s.length ~/ 2, (i) => int.parse(s.substring(i * 2, i * 2 + 2), radix: 16)));
}
