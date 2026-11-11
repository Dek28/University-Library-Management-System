import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';
import 'resource_detail_screen.dart';

const _types = <String, String>{
  '': 'All',
  'book': 'Books',
  'journal': 'Journals',
  'thesis': 'Theses',
  'ebook': 'E-books',
  'magazine': 'Magazines',
  'reference': 'Reference',
  'report': 'Reports',
};

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key});

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _query = '';
  String _type = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => setState(() => _query = value.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<AuthProvider>().api;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Catalogue'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(108),
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: TextField(
                controller: _search,
                onChanged: _onChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Title, author, ISBN or keyword',
                  prefixIcon: const Icon(Icons.search),
                  isDense: true,
                  filled: true,
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _search.clear();
                            setState(() => _query = '');
                          },
                        ),
                ),
              ),
            ),
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: _types.entries
                    .map((e) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(e.value),
                            selected: _type == e.key,
                            onSelected: (_) => setState(() => _type = e.key),
                          ),
                        ))
                    .toList(),
              ),
            ),
          ]),
        ),
      ),
      body: PagedList(
        reloadKey: '$_query|$_type',
        emptyMessage: 'No matching items',
        emptyIcon: Icons.search_off,
        fetch: (page) => api.list('/resources', query: {
          'q': _query,
          'resourceType': _type,
          'page': page,
          'limit': 20,
        }),
        itemBuilder: (context, raw) {
          final r = Resource.fromJson(Map<String, dynamic>.from(raw as Map));
          return _ResourceTile(r);
        },
      ),
    );
  }
}

class _ResourceTile extends StatelessWidget {
  const _ResourceTile(this.resource);

  final Resource resource;

  @override
  Widget build(BuildContext context) {
    final available = resource.availableCopies > 0;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.push(
            context, MaterialPageRoute(builder: (_) => ResourceDetailScreen(id: resource.id))),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Cover(resource.coverImage, width: 56, height: 76),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(resource.title,
                    maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                if (resource.authors.isNotEmpty)
                  Text(resource.authorLine, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.grey, fontSize: 13)),
                const SizedBox(height: 4),
                Text(
                  [humanize(resource.type), if (resource.year != null) '${resource.year}'].join(' · '),
                  style: const TextStyle(color: Colors.grey, fontSize: 12),
                ),
                const SizedBox(height: 6),
                Text(
                  available ? '${resource.availableCopies} of ${resource.totalCopies} available' : 'All copies on loan',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: available ? Colors.green.shade700 : Colors.orange.shade800,
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
