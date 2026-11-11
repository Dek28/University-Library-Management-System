import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';

/// The institutional repository: theses, papers, e-books and notes.
/// Files are fetched with the auth header, saved to the app's temp folder and
/// handed to whichever installed app can open them.
class DigitalScreen extends StatefulWidget {
  const DigitalScreen({super.key});

  @override
  State<DigitalScreen> createState() => _DigitalScreenState();
}

class _DigitalScreenState extends State<DigitalScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _query = '';
  String? _openingId;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  IconData _iconFor(String mime) {
    if (mime.contains('pdf')) return Icons.picture_as_pdf_outlined;
    if (mime.contains('word') || mime.contains('document')) return Icons.description_outlined;
    if (mime.contains('presentation') || mime.contains('powerpoint')) return Icons.slideshow_outlined;
    if (mime.contains('epub')) return Icons.menu_book_outlined;
    return Icons.insert_drive_file_outlined;
  }

  Future<void> _open(DigitalItem item) async {
    setState(() => _openingId = item.id);
    try {
      final dir = await getTemporaryDirectory();
      // The id keeps two uploads with the same filename from overwriting each other.
      final safeName = item.originalName.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
      final path = '${dir.path}${Platform.pathSeparator}${item.id}_$safeName';
      await context.read<AuthProvider>().api.download('/digital-resources/${item.id}/read', path);
      final result = await OpenFilex.open(path);
      if (result.type != ResultType.done && mounted) {
        showMessage(context, 'No app on this phone can open ${item.originalName}.', error: true);
      }
    } catch (e) {
      if (mounted) showMessage(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _openingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Digital library'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              controller: _search,
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 400), () => setState(() => _query = v.trim()));
              },
              decoration: const InputDecoration(
                hintText: 'Title, author or keyword',
                prefixIcon: Icon(Icons.search),
                isDense: true,
                filled: true,
              ),
            ),
          ),
        ),
      ),
      body: PagedList(
        reloadKey: _query,
        emptyMessage: 'No documents found',
        fetch: (page) => api.list('/digital-resources', query: {'search': _query, 'page': page, 'limit': 20}),
        itemBuilder: (context, raw) {
          final item = DigitalItem.fromJson(Map<String, dynamic>.from(raw as Map));
          final opening = _openingId == item.id;
          return Card(
            child: ListTile(
              leading: Icon(_iconFor(item.mimeType), size: 32),
              title: Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: Text([
                if (item.authors.isNotEmpty) item.authors.join(', '),
                [humanize(item.type), if (item.year != null) '${item.year}', formatBytes(item.fileSize)].join(' · '),
              ].join('\n')),
              isThreeLine: item.authors.isNotEmpty,
              trailing: opening
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.open_in_new),
              onTap: opening ? null : () => _open(item),
            ),
          );
        },
      ),
    );
  }
}
