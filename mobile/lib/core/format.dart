const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "12 Mar 2026"; empty for a missing or unparseable value.
String formatDate(DateTime? date) {
  if (date == null) return '';
  final d = date.toLocal();
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}

String formatDateTime(DateTime? date) {
  if (date == null) return '';
  final d = date.toLocal();
  final h = d.hour.toString().padLeft(2, '0');
  final m = d.minute.toString().padLeft(2, '0');
  return '${formatDate(d)}, $h:$m';
}

/// Whole days from today until [date]; negative when it has passed.
int daysUntil(DateTime? date) {
  if (date == null) return 0;
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final d = date.toLocal();
  return DateTime(d.year, d.month, d.day).difference(today).inDays;
}

String formatMoney(num? value, [String symbol = r'$']) => '$symbol${(value ?? 0).toStringAsFixed(2)}';

/// "under_maintenance" -> "Under maintenance".
String humanize(String? value) {
  if (value == null || value.isEmpty) return '';
  final text = value.replaceAll('_', ' ');
  return text[0].toUpperCase() + text.substring(1);
}

String formatBytes(num? bytes) {
  final b = (bytes ?? 0).toDouble();
  if (b < 1024) return '${b.toInt()} B';
  if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(0)} KB';
  return '${(b / (1024 * 1024)).toStringAsFixed(1)} MB';
}
