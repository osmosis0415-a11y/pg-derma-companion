// On-device ML: OPD slip OCR and Conference-mode face de-identification.
// Both run fully offline via Google ML Kit.
import 'dart:io';
import 'dart:typed_data';

import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class SlipData {
  SlipData({this.uhid, this.name, this.age, this.sex});
  final String? uhid, name, sex;
  final int? age;
}

class OcrService {
  final _rec = TextRecognizer(script: TextRecognitionScript.latin);

  /// Extracts UHID / age / sex / name from a photographed OPD slip.
  /// Adjust the regexes to your hospital's slip format.
  Future<SlipData> readSlip(String imagePath) async {
    final text = (await _rec.processImage(InputImage.fromFilePath(imagePath))).text;
    String? m(RegExp r) => r.firstMatch(text)?.group(1)?.trim();
    final uhid = m(RegExp(r'(?:UHID|CR\s*No|OPD\s*No|Reg(?:istration)?\s*No)\.?\s*[:\-]?\s*([A-Z0-9\/\-]{4,})', caseSensitive: false));
    final age = int.tryParse(m(RegExp(r'Age\s*[:\-]?\s*(\d{1,3})', caseSensitive: false)) ?? '');
    final sexRaw = m(RegExp(r'(?:Sex|Gender)\s*[:\-]?\s*(Male|Female|M|F|Other)', caseSensitive: false));
    final sex = sexRaw == null ? null : sexRaw.toUpperCase().startsWith('M') ? 'M' : sexRaw.toUpperCase().startsWith('F') ? 'F' : 'O';
    final name = m(RegExp(r'(?:Name|Patient)\s*[:\-]\s*([A-Za-z .]{3,40})', caseSensitive: false));
    return SlipData(uhid: uhid, name: name, age: age, sex: sex);
  }

  void dispose() => _rec.close();
}

class DeidService {
  final _faces = FaceDetector(options: FaceDetectorOptions(enableLandmarks: true, performanceMode: FaceDetectorMode.accurate));

  /// Places black eye-bars over every detected face. Re-encoding drops all EXIF/GPS metadata.
  /// Returns JPEG bytes and the number of faces masked.
  Future<(Uint8List, int)> maskFaces(Uint8List jpeg) async {
    final tmp = File(p.join((await getTemporaryDirectory()).path, 'deid_${DateTime.now().microsecondsSinceEpoch}.jpg'));
    await tmp.writeAsBytes(jpeg, flush: true);
    try {
      final faces = await _faces.processImage(InputImage.fromFilePath(tmp.path));
      final im = img.bakeOrientation(img.decodeImage(jpeg)!);
      for (final f in faces) {
        final b = f.boundingBox;
        final le = f.landmarks[FaceLandmarkType.leftEye]?.position, re = f.landmarks[FaceLandmarkType.rightEye]?.position;
        final eyeY = (le != null && re != null) ? (le.y + re.y) / 2 : b.top + b.height * 0.38;
        final h = b.height * 0.24;
        img.fillRect(im,
            x1: (b.left - b.width * 0.05).round(), y1: (eyeY - h / 2).round(),
            x2: (b.right + b.width * 0.05).round(), y2: (eyeY + h / 2).round(),
            color: img.ColorRgb8(0, 0, 0));
      }
      return (Uint8List.fromList(img.encodeJpg(im, quality: 90)), faces.length);
    } finally {
      if (await tmp.exists()) await tmp.delete();
    }
  }

  /// Manual mask (from a drag rectangle): black box or pixelate.
  Uint8List maskRect(Uint8List jpeg, {required int x, required int y, required int w, required int h, bool pixelate = false}) {
    final im = img.bakeOrientation(img.decodeImage(jpeg)!);
    if (pixelate) {
      final crop = img.pixelate(img.copyCrop(im, x: x, y: y, width: w, height: h), size: (w < h ? w : h) ~/ 8 + 4);
      img.compositeImage(im, crop, dstX: x, dstY: y);
    } else {
      img.fillRect(im, x1: x, y1: y, x2: x + w, y2: y + h, color: img.ColorRgb8(0, 0, 0));
    }
    return Uint8List.fromList(img.encodeJpg(im, quality: 90));
  }

  void dispose() => _faces.close();
}
