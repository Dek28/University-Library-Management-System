const reference = require('./reference');
const readingGroup = require('./readingGroup');

module.exports = {
  Role: require('./Role'),
  User: require('./User'),
  RefreshToken: require('./RefreshToken'),

  ...reference,

  Resource: require('./Resource'),
  ResourceCopy: require('./ResourceCopy'),

  Loan: require('./Loan'),
  Renewal: require('./Renewal'),
  Reservation: require('./Reservation'),

  Fine: require('./Fine'),
  FinePayment: require('./FinePayment'),

  DigitalResource: require('./DigitalResource'),
  InventoryAudit: require('./InventoryAudit'),
  PurchaseOrder: require('./PurchaseOrder'),
  Clearance: require('./Clearance'),

  ...readingGroup,

  Notification: require('./Notification'),
  AuditLog: require('./AuditLog'),
  SystemSetting: require('./SystemSetting'),
  Counter: require('./Counter'),
};
