import 'package:flutter_test/flutter_test.dart';
import 'package:ulms_mobile/core/config.dart';
import 'package:ulms_mobile/core/format.dart';
import 'package:ulms_mobile/models/models.dart';

void main() {
  group('ServerConfig.normalize', () {
    test('adds a scheme and strips trailing slashes', () {
      expect(ServerConfig.normalize('192.168.1.10:5000/'), 'http://192.168.1.10:5000');
    });

    test('tolerates a pasted API prefix', () {
      expect(ServerConfig.normalize('https://lib.example.edu/api/v1'), 'https://lib.example.edu');
    });
  });

  group('format', () {
    test('humanize', () => expect(humanize('under_maintenance'), 'Under maintenance'));
    test('formatMoney', () => expect(formatMoney(2.5, r'$'), r'$2.50'));
  });

  group('models', () {
    test('Loan reads populated references and renewal limits', () {
      final loan = Loan.fromJson({
        'id': 'l1',
        'status': 'active',
        'dueDate': '2026-12-01T00:00:00.000Z',
        'renewalCount': 0,
        'maxRenewals': 1,
        'resource': {'id': 'r1', 'title': 'Dune'},
        'copy': {'accessionNumber': 'ACC-1'},
      });
      expect(loan.title, 'Dune');
      expect(loan.accession, 'ACC-1');
      expect(loan.canRenew, isTrue);
    });

    test('Fine balance subtracts payments and waivers', () {
      final fine = Fine.fromJson({'amount': 10, 'amountPaid': 4, 'amountWaived': 1});
      expect(fine.balance, 5);
    });

    test('Resource tolerates unpopulated references', () {
      final r = Resource.fromJson({'id': 'r1', 'title': 'T', 'authors': ['abc'], 'publisher': 'xyz'});
      expect(r.authors, isEmpty);
      expect(r.publisher, '');
    });
  });
}
