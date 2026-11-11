/// Plain data classes for the API payloads the app shows.
///
/// Parsing is deliberately forgiving: the API populates some references and
/// leaves others as bare ids, so every accessor tolerates either shape.

Map<String, dynamic> _map(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

String _id(dynamic v) {
  if (v is Map) return (v['id'] ?? v['_id'] ?? '').toString();
  return v?.toString() ?? '';
}

String _str(dynamic v, [String fallback = '']) => v == null ? fallback : v.toString();

DateTime? _date(dynamic v) => v == null ? null : DateTime.tryParse(v.toString());

num _num(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '') ?? 0;

/// A populated reference such as `{ id, name }` or `{ fullName }`, as text.
String _label(dynamic v) {
  if (v is Map) return _str(v['fullName'] ?? v['name'] ?? v['title']);
  return '';
}

class AppUser {
  AppUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.registrationNumber,
    required this.employeeId,
    required this.phone,
    required this.roleKey,
    required this.roleName,
    required this.permissions,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) {
    final role = _map(j['role']);
    return AppUser(
      id: _id(j),
      firstName: _str(j['firstName']),
      lastName: _str(j['lastName']),
      email: _str(j['email']),
      registrationNumber: _str(j['registrationNumber']),
      employeeId: _str(j['employeeId']),
      phone: _str(j['phone']),
      roleKey: _str(role['key']),
      roleName: _str(role['name']),
      permissions: List<String>.from((j['permissions'] as List? ?? const []).map((e) => e.toString())),
    );
  }

  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String registrationNumber;
  final String employeeId;
  final String phone;
  final String roleKey;
  final String roleName;
  final List<String> permissions;

  String get fullName => '$firstName $lastName'.trim();

  /// The number a member is known by at the desk.
  String get memberNumber => registrationNumber.isNotEmpty ? registrationNumber : employeeId;
}

class Copy {
  Copy({required this.id, required this.accessionNumber, required this.barcode, required this.status, required this.condition});

  factory Copy.fromJson(Map<String, dynamic> j) => Copy(
        id: _id(j),
        accessionNumber: _str(j['accessionNumber']),
        barcode: _str(j['barcode']),
        status: _str(j['status']),
        condition: _str(j['condition']),
      );

  final String id;
  final String accessionNumber;
  final String barcode;
  final String status;
  final String condition;
}

class Resource {
  Resource({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.type,
    required this.authors,
    required this.publisher,
    required this.year,
    required this.category,
    required this.status,
    required this.totalCopies,
    required this.availableCopies,
    required this.coverImage,
    required this.isbn,
    required this.description,
    required this.edition,
    required this.language,
    required this.shelf,
    required this.isBorrowable,
    required this.copies,
  });

  factory Resource.fromJson(Map<String, dynamic> j) {
    final shelf = _map(j['shelf']);
    final shelfText = [shelf['name'], shelf['section'], shelf['rack']]
        .where((e) => e != null && e.toString().isNotEmpty)
        .join(' · ');
    return Resource(
      id: _id(j),
      title: _str(j['title']),
      subtitle: _str(j['subtitle']),
      type: _str(j['resourceType']),
      authors: (j['authors'] as List? ?? const []).map(_label).where((e) => e.isNotEmpty).toList(),
      publisher: _label(j['publisher']),
      year: j['publicationYear'] == null ? null : _num(j['publicationYear']).toInt(),
      category: _label(j['category']),
      status: _str(j['status']),
      totalCopies: _num(j['totalCopies']).toInt(),
      availableCopies: _num(j['availableCopies']).toInt(),
      coverImage: j['coverImage']?.toString(),
      isbn: _str(j['isbn']),
      description: _str(j['description']),
      edition: _str(j['edition']),
      language: _label(j['language']),
      shelf: shelfText,
      isBorrowable: j['isBorrowable'] != false,
      copies: (j['copiesList'] as List? ?? const []).map((e) => Copy.fromJson(_map(e))).toList(),
    );
  }

  final String id;
  final String title;
  final String subtitle;
  final String type;
  final List<String> authors;
  final String publisher;
  final int? year;
  final String category;
  final String status;
  final int totalCopies;
  final int availableCopies;
  final String? coverImage;
  final String isbn;
  final String description;
  final String edition;
  final String language;
  final String shelf;
  final bool isBorrowable;
  final List<Copy> copies;

  String get authorLine => authors.join(', ');
}

class Loan {
  Loan({
    required this.id,
    required this.code,
    required this.resourceId,
    required this.title,
    required this.coverImage,
    required this.accession,
    required this.borrowDate,
    required this.dueDate,
    required this.returnDate,
    required this.status,
    required this.renewalCount,
    required this.maxRenewals,
    required this.daysOverdue,
    required this.fineAmount,
    required this.memberName,
  });

  factory Loan.fromJson(Map<String, dynamic> j) {
    final resource = _map(j['resource']);
    final user = _map(j['user']);
    return Loan(
      id: _id(j),
      code: _str(j['transactionId']),
      resourceId: _id(resource),
      title: _str(resource['title']),
      coverImage: resource['coverImage']?.toString(),
      accession: _str(_map(j['copy'])['accessionNumber']),
      borrowDate: _date(j['borrowDate']),
      dueDate: _date(j['dueDate']),
      returnDate: _date(j['returnDate']),
      status: _str(j['status']),
      renewalCount: _num(j['renewalCount']).toInt(),
      maxRenewals: _num(j['maxRenewals']).toInt(),
      daysOverdue: _num(j['daysOverdue']).toInt(),
      fineAmount: _num(j['fineAmount']),
      memberName: '${_str(user['firstName'])} ${_str(user['lastName'])}'.trim(),
    );
  }

  final String id;
  final String code;
  final String resourceId;
  final String title;
  final String? coverImage;
  final String accession;
  final DateTime? borrowDate;
  final DateTime? dueDate;
  final DateTime? returnDate;
  final String status;
  final int renewalCount;
  final int maxRenewals;
  final int daysOverdue;
  final num fineAmount;
  final String memberName;

  bool get isOpen => status == 'active' || status == 'overdue';
  bool get canRenew => isOpen && renewalCount < maxRenewals;
}

class Reservation {
  Reservation({
    required this.id,
    required this.code,
    required this.resourceId,
    required this.title,
    required this.status,
    required this.queuePosition,
    required this.reservedAt,
    required this.expiresAt,
  });

  factory Reservation.fromJson(Map<String, dynamic> j) {
    final resource = _map(j['resource']);
    return Reservation(
      id: _id(j),
      code: _str(j['reservationCode']),
      resourceId: _id(resource),
      title: _str(resource['title']),
      status: _str(j['status']),
      queuePosition: j['queuePosition'] == null ? null : _num(j['queuePosition']).toInt(),
      reservedAt: _date(j['reservedAt']),
      expiresAt: _date(j['expiresAt']),
    );
  }

  final String id;
  final String code;
  final String resourceId;
  final String title;
  final String status;
  final int? queuePosition;
  final DateTime? reservedAt;
  final DateTime? expiresAt;

  bool get isCancellable => status == 'pending' || status == 'ready';
}

class Fine {
  Fine({
    required this.id,
    required this.code,
    required this.type,
    required this.amount,
    required this.amountPaid,
    required this.amountWaived,
    required this.status,
    required this.reason,
    required this.title,
    required this.createdAt,
  });

  factory Fine.fromJson(Map<String, dynamic> j) => Fine(
        id: _id(j),
        code: _str(j['fineCode']),
        type: _str(j['fineType']),
        amount: _num(j['amount']),
        amountPaid: _num(j['amountPaid']),
        amountWaived: _num(j['amountWaived']),
        status: _str(j['status']),
        reason: _str(j['reason']),
        title: _str(_map(j['resource'])['title']),
        createdAt: _date(j['createdAt']),
      );

  final String id;
  final String code;
  final String type;
  final num amount;
  final num amountPaid;
  final num amountWaived;
  final String status;
  final String reason;
  final String title;
  final DateTime? createdAt;

  num get balance => amount - amountPaid - amountWaived;
}

class AppNotification {
  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.severity,
    required this.isRead,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: _id(j),
        type: _str(j['type']),
        title: _str(j['title']),
        message: _str(j['message']),
        severity: _str(j['severity'], 'info'),
        isRead: j['isRead'] == true,
        createdAt: _date(j['createdAt']),
      );

  final String id;
  final String type;
  final String title;
  final String message;
  final String severity;
  bool isRead;
  final DateTime? createdAt;
}

class DigitalItem {
  DigitalItem({
    required this.id,
    required this.title,
    required this.authors,
    required this.type,
    required this.accessLevel,
    required this.mimeType,
    required this.fileSize,
    required this.originalName,
    required this.abstract,
    required this.year,
  });

  factory DigitalItem.fromJson(Map<String, dynamic> j) => DigitalItem(
        id: _id(j),
        title: _str(j['title']),
        authors: (j['authors'] as List? ?? const []).map(_label).where((e) => e.isNotEmpty).toList(),
        type: _str(j['resourceType']),
        accessLevel: _str(j['accessLevel']),
        mimeType: _str(j['mimeType']),
        fileSize: _num(j['fileSize']),
        originalName: _str(j['originalName'], 'document'),
        abstract: _str(j['abstract']),
        year: j['publicationYear'] == null ? null : _num(j['publicationYear']).toInt(),
      );

  final String id;
  final String title;
  final List<String> authors;
  final String type;
  final String accessLevel;
  final String mimeType;
  final num fileSize;
  final String originalName;
  final String abstract;
  final int? year;
}

class ReadingSession {
  ReadingSession({
    required this.id,
    required this.title,
    required this.groupName,
    required this.space,
    required this.startsAt,
    required this.startTime,
    required this.endTime,
    required this.status,
  });

  factory ReadingSession.fromJson(Map<String, dynamic> j) => ReadingSession(
        id: _id(j),
        title: _str(j['title'], _str(j['topic'])),
        groupName: _label(j['group']),
        space: _label(j['space']),
        startsAt: _date(j['startsAt'] ?? j['sessionDate']),
        startTime: _str(j['startTime']),
        endTime: _str(j['endTime']),
        status: _str(j['status']),
      );

  final String id;
  final String title;
  final String groupName;
  final String space;
  final DateTime? startsAt;
  final String startTime;
  final String endTime;
  final String status;
}

class ReadingGroup {
  ReadingGroup({
    required this.id,
    required this.name,
    required this.topic,
    required this.description,
    required this.status,
    required this.memberCount,
    required this.maxMembers,
    required this.leader,
  });

  factory ReadingGroup.fromJson(Map<String, dynamic> j) {
    final leader = _map(j['leader']);
    return ReadingGroup(
      id: _id(j),
      name: _str(j['name']),
      topic: _str(j['readingTopic']),
      description: _str(j['description']),
      status: _str(j['status']),
      memberCount: (j['members'] as List? ?? const []).length,
      maxMembers: _num(j['maxMembers']).toInt(),
      leader: '${_str(leader['firstName'])} ${_str(leader['lastName'])}'.trim(),
    );
  }

  final String id;
  final String name;
  final String topic;
  final String description;
  final String status;
  final int memberCount;
  final int maxMembers;
  final String leader;
}
