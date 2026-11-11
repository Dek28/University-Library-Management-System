/**
 * OpenAPI path definitions.
 *
 * Helper builders keep the repetition down: every endpoint still declares its
 * tag, required permission, parameters, body and responses explicitly.
 */
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const param = (name) => ({ $ref: `#/components/parameters/${name}` });
const response = (name) => ({ $ref: `#/components/responses/${name}` });

const jsonBody = (schema, required = true) => ({
  required,
  content: { 'application/json': { schema } },
});

/** Standard success response wrapping `schema` in the success envelope. */
const okResponse = (description, schema) => ({
  description,
  content: {
    'application/json': {
      schema: schema
        ? { allOf: [ref('SuccessResponse'), { type: 'object', properties: { data: schema } }] }
        : ref('SuccessResponse'),
    },
  },
});

const listResponse = (description) => ({
  description,
  content: { 'application/json': { schema: ref('PaginatedResponse') } },
});

const fileResponse = (description) => ({
  description,
  content: {
    'application/pdf': { schema: { type: 'string', format: 'binary' } },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } },
    'text/csv': { schema: { type: 'string' } },
  },
});

/**
 * Builds one operation. `permission` is rendered into the description so the
 * documentation always states what a caller needs.
 */
const op = ({ tag, summary, description, permission, parameters, requestBody, responses, security, deprecated }) => ({
  tags: [tag],
  summary,
  description: [description, permission ? `\n\n**Required permission:** \`${permission}\`` : null]
    .filter(Boolean).join(''),
  ...(parameters ? { parameters } : {}),
  ...(requestBody ? { requestBody } : {}),
  ...(security !== undefined ? { security } : {}),
  ...(deprecated ? { deprecated } : {}),
  responses: {
    ...responses,
    401: response('Unauthorized'),
    403: response('Forbidden'),
    422: response('ValidationError'),
  },
});

const PUBLIC = [];

module.exports = {
  // Authentication
  '/auth/login': {
    post: op({
      tag: 'Authentication',
      summary: 'Sign in',
      description: 'Exchanges credentials for an access token and sets an HTTP-only refresh cookie. '
        + 'The identifier may be an email address, registration number or staff ID. '
        + 'Repeated failures lock the account temporarily.',
      security: PUBLIC,
      requestBody: jsonBody({
        type: 'object',
        required: ['identifier', 'password'],
        properties: {
          identifier: { type: 'string', example: 'admin@example.edu' },
          password: { type: 'string', format: 'password', example: 'ChangeMe123!' },
        },
      }),
      responses: {
        200: okResponse('Signed in', {
          type: 'object',
          properties: { user: ref('User'), accessToken: { type: 'string' }, refreshToken: { type: 'string' } },
        }),
        429: { description: 'Too many authentication attempts' },
      },
    }),
  },
  '/auth/refresh': {
    post: op({
      tag: 'Authentication',
      summary: 'Rotate the session',
      description: 'Issues a new access token and rotates the refresh token. Presenting an already-rotated '
        + 'token is treated as theft and revokes every session for that account.',
      security: [{ refreshCookie: [] }],
      responses: { 200: okResponse('Session refreshed') },
    }),
  },
  '/auth/logout': {
    post: op({
      tag: 'Authentication',
      summary: 'Sign out',
      description: 'Revokes the presented refresh token and clears the cookie.',
      security: PUBLIC,
      responses: { 200: okResponse('Signed out') },
    }),
  },
  '/auth/me': {
    get: op({
      tag: 'Authentication',
      summary: 'Current session',
      description: 'Returns the signed-in account together with its effective permission list.',
      responses: { 200: okResponse('Session loaded', ref('User')) },
    }),
  },
  '/auth/change-password': {
    post: op({
      tag: 'Authentication',
      summary: 'Change your password',
      description: 'Requires the current password. All existing sessions are revoked on success.',
      requestBody: jsonBody({
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } },
      }),
      responses: { 200: okResponse('Password changed') },
    }),
  },
  '/auth/forgot-password': {
    post: op({
      tag: 'Authentication',
      summary: 'Request a password reset',
      description: 'Always responds identically whether or not the address is registered, so accounts '
        + 'cannot be enumerated. Outside production the reset link is returned in the response.',
      security: PUBLIC,
      requestBody: jsonBody({ type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } }),
      responses: { 200: okResponse('Reset requested') },
    }),
  },
  '/auth/reset-password': {
    post: op({
      tag: 'Authentication',
      summary: 'Complete a password reset',
      security: PUBLIC,
      requestBody: jsonBody({
        type: 'object',
        required: ['email', 'token', 'newPassword'],
        properties: { email: { type: 'string' }, token: { type: 'string' }, newPassword: { type: 'string' } },
      }),
      responses: { 200: okResponse('Password reset'), 400: response('ValidationError') },
    }),
  },
  '/auth/revoke-sessions': {
    post: op({
      tag: 'Authentication',
      summary: 'Revoke all of your sessions',
      responses: { 200: okResponse('Sessions revoked') },
    }),
  },

  // Users
  '/users': {
    get: op({
      tag: 'Users',
      summary: 'List members',
      description: 'Server-side paginated. Set `format` to export the same filtered result set.',
      permission: 'user:view',
      parameters: [
        param('page'), param('limit'), param('sort'), param('search'), param('format'),
        { name: 'status', in: 'query', schema: { type: 'string' } },
        { name: 'roleKey', in: 'query', schema: { type: 'string' }, description: 'Filter by role key, e.g. `student`' },
        { name: 'department', in: 'query', schema: { type: 'string' } },
        { name: 'hasOutstandingFines', in: 'query', schema: { type: 'boolean' } },
        { name: 'hasActiveLoans', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: { 200: listResponse('Members') },
    }),
    post: op({
      tag: 'Users',
      summary: 'Create a member',
      description: 'The role may be given as an id or a key. An actor can never assign a role at or above '
        + 'their own authority level.',
      permission: 'user:create',
      requestBody: jsonBody(ref('User')),
      responses: { 201: okResponse('Created', ref('User')), 409: response('Conflict') },
    }),
  },
  '/users/lookup': {
    get: op({
      tag: 'Users',
      summary: 'Find a member by card barcode or number',
      description: 'Used at the circulation desk; accepts a scanned card barcode, registration number, staff ID or email.',
      permission: 'user:view',
      parameters: [{ name: 'identifier', in: 'query', required: true, schema: { type: 'string' } }],
      responses: { 200: okResponse('Member found', ref('User')), 404: response('NotFound') },
    }),
  },
  '/users/import/template': {
    get: op({
      tag: 'Users',
      summary: 'Download the bulk import template',
      permission: 'user:import',
      responses: { 200: fileResponse('An .xlsx template with an instructions sheet') },
    }),
  },
  '/users/import': {
    post: op({
      tag: 'Users',
      summary: 'Bulk import students from a spreadsheet',
      description: 'Rows are validated individually: a bad row is reported and skipped without aborting the file. '
        + 'Set `dryRun=true` to validate without writing. Options are read from the form body; the default '
        + 'password should not be sent in the URL, where it would appear in access logs.',
      permission: 'user:import',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file', 'defaultPassword'],
              properties: {
                file: { type: 'string', format: 'binary' },
                defaultPassword: { type: 'string', description: 'At least 8 characters, with upper case, lower case and a digit; at most 72 bytes.' },
                roleKey: { type: 'string', default: 'student' },
                dryRun: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: okResponse('Import result', {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            imported: { type: 'integer' },
            skipped: { type: 'integer' },
            errors: { type: 'array', items: { type: 'object' } },
          },
        }),
      },
    }),
  },
  '/users/{id}': {
    get: op({
      tag: 'Users', summary: 'Get a member', permission: 'user:view',
      parameters: [param('id')],
      responses: { 200: okResponse('Member', ref('User')), 404: response('NotFound') },
    }),
    patch: op({
      tag: 'Users', summary: 'Update a member', permission: 'user:update',
      parameters: [param('id')],
      requestBody: jsonBody(ref('User')),
      responses: { 200: okResponse('Updated', ref('User')), 404: response('NotFound') },
    }),
    delete: op({
      tag: 'Users',
      summary: 'Soft-delete a member',
      description: 'Refused while the member has open loans or unpaid fines; archive the account instead. '
        + 'A caller cannot manage an account whose role is at or above their own, so an Admin cannot delete a Super Admin.',
      permission: 'user:status',
      parameters: [param('id')],
      responses: { 200: okResponse('Deleted'), 409: response('Conflict') },
    }),
  },
  '/users/{id}/status': {
    patch: op({
      tag: 'Users',
      summary: 'Change account status',
      description: 'Suspending an account immediately revokes its sessions. Archiving is refused while items are on loan.',
      permission: 'user:status',
      parameters: [param('id')],
      requestBody: jsonBody({
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string' }, reason: { type: 'string' } },
      }),
      responses: { 200: okResponse('Status changed', ref('User')), 409: response('Conflict') },
    }),
  },
  '/users/{id}/activity': {
    get: op({
      tag: 'Users',
      summary: 'Loans, fines and reservations for a member',
      permission: 'user:view',
      parameters: [param('id')],
      responses: { 200: okResponse('Activity') },
    }),
  },
  '/users/me/profile': {
    patch: op({
      tag: 'Users',
      summary: 'Update your own profile',
      description: 'Members may change only their phone (30 characters), address (200), gender and date of birth. '
        + 'Other fields are ignored, and a request with nothing to change is refused.',
      requestBody: jsonBody({
        type: 'object',
        properties: {
          phone: { type: 'string', maxLength: 30 },
          address: { type: 'string', maxLength: 200 },
          gender: { type: 'string' },
          dateOfBirth: { type: 'string', format: 'date' },
        },
      }),
      responses: { 200: okResponse('Profile updated', ref('User')), 422: response('ValidationError') },
    }),
  },

  // Reference data
  '/reference/{collection}': {
    get: op({
      tag: 'Reference data',
      summary: 'List records in a lookup collection',
      description: 'Collections: `faculties`, `departments`, `programs`, `categories`, `subjects`, '
        + '`publishers`, `languages`, `shelves`, `study-spaces`.',
      permission: 'reference:view',
      parameters: [
        { name: 'collection', in: 'path', required: true, schema: { type: 'string' } },
        param('page'), param('limit'), param('search'),
      ],
      responses: { 200: listResponse('Records') },
    }),
    post: op({
      tag: 'Reference data',
      summary: 'Create a record',
      description: 'Most collections take a `name`. Only `faculties`, `departments` and `programs` also take a '
        + '`code`. A shelf takes `section` and `rack` instead (its name is derived from them), and the same '
        + 'section + rack cannot be registered twice.',
      permission: 'reference:manage',
      parameters: [{ name: 'collection', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          name: { type: 'string' },
          code: { type: 'string', description: 'Faculties, departments and programs only' },
          section: { type: 'string', description: 'Shelves only' },
          rack: { type: 'string', description: 'Shelves only' },
        },
      }),
      responses: { 201: okResponse('Created'), 400: response('ValidationError'), 409: response('Conflict') },
    }),
  },
  '/reference/{collection}/{id}': {
    patch: op({
      tag: 'Reference data', summary: 'Update a record', permission: 'reference:manage',
      parameters: [{ name: 'collection', in: 'path', required: true, schema: { type: 'string' } }, param('id')],
      requestBody: jsonBody({ type: 'object' }),
      responses: { 200: okResponse('Updated'), 404: response('NotFound') },
    }),
    delete: op({
      tag: 'Reference data',
      summary: 'Delete a record',
      description: 'Refused while catalogue records or members still reference it. Deactivate it instead.',
      permission: 'reference:manage',
      parameters: [{ name: 'collection', in: 'path', required: true, schema: { type: 'string' } }, param('id')],
      responses: { 200: okResponse('Deleted'), 409: response('Conflict') },
    }),
  },

  // Authors
  '/authors': {
    get: op({
      tag: 'Authors',
      summary: 'List authors',
      description: 'Authors are registered only while cataloguing a title: send `authorNames` when creating or '
        + 'updating a resource and unknown names are added automatically.',
      permission: 'resource:view',
      parameters: [param('page'), param('limit'), param('search')],
      responses: { 200: listResponse('Authors') },
    }),
  },
  '/authors/{id}': {
    get: op({
      tag: 'Authors', summary: 'Get an author and their titles', permission: 'resource:view',
      parameters: [param('id')],
      responses: { 200: okResponse('Author') },
    }),
  },

  // Catalogue
  '/resources': {
    get: op({
      tag: 'Catalogue',
      summary: 'Search the catalogue',
      description: 'Free-text search across title, subtitle, description and keywords, with exact indexed '
        + 'lookups for ISBN, accession number and barcode.',
      permission: 'resource:view',
      parameters: [
        param('page'), param('limit'), param('sort'), param('format'),
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search term' },
        { name: 'resourceType', in: 'query', schema: { type: 'string' } },
        { name: 'category', in: 'query', schema: { type: 'string' } },
        { name: 'author', in: 'query', schema: { type: 'string' } },
        { name: 'availability', in: 'query', schema: { type: 'string', enum: ['available', 'unavailable'] } },
        { name: 'yearFrom', in: 'query', schema: { type: 'integer' } },
        { name: 'yearTo', in: 'query', schema: { type: 'integer' } },
        { name: 'isbn', in: 'query', schema: { type: 'string' } },
        { name: 'barcode', in: 'query', schema: { type: 'string' } },
      ],
      responses: { 200: listResponse('Catalogue records') },
    }),
    post: op({
      tag: 'Catalogue', summary: 'Create a catalogue record', permission: 'resource:create',
      requestBody: jsonBody(ref('Resource')),
      responses: { 201: okResponse('Created', ref('Resource')), 409: response('Conflict') },
    }),
  },
  '/resources/suggest': {
    get: op({
      tag: 'Catalogue', summary: 'Search suggestions', permission: 'resource:view',
      parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2 } }],
      responses: { 200: okResponse('Suggestions') },
    }),
  },
  '/resources/discovery': {
    get: op({
      tag: 'Catalogue', summary: 'Recently added and most borrowed', permission: 'resource:view',
      responses: { 200: okResponse('Discovery lists') },
    }),
  },
  '/resources/{id}': {
    get: op({
      tag: 'Catalogue', summary: 'Get a catalogue record with its copies', permission: 'resource:view',
      parameters: [param('id')],
      responses: { 200: okResponse('Catalogue record', ref('Resource')), 404: response('NotFound') },
    }),
    patch: op({
      tag: 'Catalogue', summary: 'Update a catalogue record', permission: 'resource:update',
      parameters: [param('id')], requestBody: jsonBody(ref('Resource')),
      responses: { 200: okResponse('Updated', ref('Resource')) },
    }),
    delete: op({
      tag: 'Catalogue',
      summary: 'Soft-delete a catalogue record and its copies',
      description: 'Refused while any copy is on loan.',
      permission: 'resource:delete',
      parameters: [param('id')],
      responses: { 200: okResponse('Deleted'), 409: response('Conflict') },
    }),
  },
  '/resources/{id}/related': {
    get: op({
      tag: 'Catalogue', summary: 'Related titles', permission: 'resource:view',
      parameters: [param('id')],
      responses: { 200: okResponse('Related titles') },
    }),
  },
  '/resources/{id}/cover': {
    post: op({
      tag: 'Catalogue', summary: 'Upload a cover image', permission: 'resource:update',
      parameters: [param('id')],
      requestBody: {
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object', properties: { cover: { type: 'string', format: 'binary' } } } } },
      },
      responses: { 200: okResponse('Cover updated') },
    }),
  },

  // Copies
  '/resource-copies': {
    get: op({
      tag: 'Copies', summary: 'List physical copies', permission: 'resource:view',
      parameters: [param('page'), param('limit'), param('search'), param('format'),
        { name: 'resource', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string' } }],
      responses: { 200: listResponse('Copies') },
    }),
    post: op({
      tag: 'Copies',
      summary: 'Add a copy',
      description: 'Accession number and barcode are generated when omitted.',
      permission: 'copy:manage',
      requestBody: jsonBody(ref('ResourceCopy')),
      responses: { 201: okResponse('Created', ref('ResourceCopy')), 409: response('Conflict') },
    }),
  },
  '/resource-copies/batch': {
    post: op({
      tag: 'Copies', summary: 'Add several copies of one title at once', permission: 'copy:manage',
      requestBody: jsonBody({
        type: 'object',
        required: ['resource', 'quantity'],
        properties: { resource: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 100 } },
      }),
      responses: { 201: okResponse('Copies created') },
    }),
  },
  '/resource-copies/lookup': {
    get: op({
      tag: 'Copies', summary: 'Resolve a scanned barcode or accession number', permission: 'resource:view',
      parameters: [{ name: 'identifier', in: 'query', required: true, schema: { type: 'string' } }],
      responses: { 200: okResponse('Copy', ref('ResourceCopy')), 404: response('NotFound') },
    }),
  },
  '/resource-copies/{id}': {
    patch: op({
      tag: 'Copies',
      summary: 'Update a copy',
      description: '`borrowed` and `reserved` are owned by circulation and cannot be set by hand.',
      permission: 'copy:manage',
      parameters: [param('id')], requestBody: jsonBody(ref('ResourceCopy')),
      responses: { 200: okResponse('Updated'), 409: response('Conflict') },
    }),
    delete: op({
      tag: 'Copies',
      summary: 'Remove a copy from circulation',
      description: 'A copy with loan history is withdrawn rather than deleted, preserving that history.',
      permission: 'copy:manage',
      parameters: [param('id')],
      responses: { 200: okResponse('Removed'), 409: response('Conflict') },
    }),
  },

  // Circulation
  '/loans': {
    get: op({
      tag: 'Circulation',
      summary: 'List loans',
      description: 'Callers holding only `loan:view_own` receive their own loans regardless of the filter sent.',
      permission: 'loan:view or loan:view_own',
      parameters: [
        param('page'), param('limit'), param('sort'), param('from'), param('to'), param('format'),
        { name: 'status', in: 'query', schema: { type: 'string' } },
        { name: 'openOnly', in: 'query', schema: { type: 'boolean' } },
        { name: 'overdueOnly', in: 'query', schema: { type: 'boolean' } },
        { name: 'user', in: 'query', schema: { type: 'string' } },
      ],
      responses: { 200: listResponse('Loans') },
    }),
  },
  '/loans/eligibility': {
    get: op({
      tag: 'Circulation',
      summary: 'Check whether a member may borrow',
      description: 'Returns every blocker at once (limits, overdue items, fines, suspension), so the desk '
        + 'can resolve them before scanning an item.',
      permission: 'loan:issue',
      parameters: [
        { name: 'userIdentifier', in: 'query', schema: { type: 'string' } },
        { name: 'userId', in: 'query', schema: { type: 'string' } },
        { name: 'resourceId', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        200: okResponse('Eligibility', {
          type: 'object',
          properties: {
            eligible: { type: 'boolean' },
            blockers: { type: 'array', items: { type: 'string' } },
            limits: { type: 'object' },
          },
        }),
      },
    }),
  },
  '/loans/issue': {
    post: op({
      tag: 'Circulation',
      summary: 'Issue a copy to a member',
      description: 'Validates eligibility, claims the copy atomically, sets the due date from the role policy '
        + 'and completes any hold the member had on the title.',
      permission: 'loan:issue',
      requestBody: jsonBody({
        type: 'object',
        required: ['userIdentifier', 'copyIdentifier'],
        properties: {
          userIdentifier: { type: 'string', description: 'Card barcode, registration number, staff ID or email' },
          copyIdentifier: { type: 'string', description: 'Copy barcode or accession number' },
          dueDate: { type: 'string', format: 'date' },
          notes: { type: 'string' },
        },
      }),
      responses: { 201: okResponse('Issued', ref('Loan')), 409: response('Conflict'), 404: response('NotFound') },
    }),
  },
  '/loans/return': {
    post: op({
      tag: 'Circulation',
      summary: 'Receive a returned copy',
      description: 'Calculates overdue and condition fines, shelves or quarantines the copy, and promotes the '
        + 'next reservation when the copy returns to the shelf.',
      permission: 'loan:return',
      requestBody: jsonBody({
        type: 'object',
        properties: {
          copyIdentifier: { type: 'string' },
          loanId: { type: 'string' },
          condition: { type: 'string', enum: ['excellent', 'good', 'fair', 'damaged', 'severely_damaged', 'lost'] },
          notes: { type: 'string' },
        },
      }),
      responses: {
        200: okResponse('Return recorded', {
          type: 'object',
          properties: {
            loan: ref('Loan'),
            fines: { type: 'array', items: ref('Fine') },
            daysOverdue: { type: 'integer' },
            reservationPromoted: { type: 'boolean' },
          },
        }),
        409: response('Conflict'),
      },
    }),
  },
  '/loans/desk-summary': {
    get: op({
      tag: 'Circulation', summary: "Today's desk figures", permission: 'loan:view',
      responses: { 200: okResponse('Desk summary') },
    }),
  },
  '/loans/{id}': {
    get: op({
      tag: 'Circulation', summary: 'Get a loan with its renewals and fines',
      permission: 'loan:view or ownership',
      parameters: [param('id')],
      responses: { 200: okResponse('Loan', ref('Loan')), 404: response('NotFound') },
    }),
  },
  '/loans/{id}/renew': {
    post: op({
      tag: 'Circulation',
      summary: 'Renew a loan',
      description: 'Refused when the renewal limit is reached, another member is waiting, or blocking fines exist. '
        + 'Members may renew their own loans when self-service renewal is enabled.',
      permission: 'loan:renew or loan:renew_own',
      parameters: [param('id')],
      requestBody: jsonBody({ type: 'object', properties: { notes: { type: 'string' } } }, false),
      responses: { 200: okResponse('Renewed', ref('Loan')), 409: response('Conflict') },
    }),
  },
  '/loans/{id}/lost': {
    post: op({
      tag: 'Circulation',
      summary: 'Write a loan off as lost',
      description: 'Marks the copy lost and raises the replacement charge plus any accrued overdue fine.',
      permission: 'loan:mark_lost',
      parameters: [param('id')],
      requestBody: jsonBody({ type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } }),
      responses: { 200: okResponse('Marked lost') },
    }),
  },
  '/loans/{id}/receipt': {
    get: op({
      tag: 'Circulation', summary: 'Printable loan receipt (PDF)',
      permission: 'loan:view or ownership',
      parameters: [param('id')],
      responses: { 200: fileResponse('PDF receipt') },
    }),
  },

  // Reservations
  '/reservations': {
    get: op({
      tag: 'Reservations', summary: 'List reservations',
      permission: 'reservation:view or reservation:create_own',
      parameters: [param('page'), param('limit'),
        { name: 'status', in: 'query', schema: { type: 'string' } },
        { name: 'activeOnly', in: 'query', schema: { type: 'boolean' } }],
      responses: { 200: listResponse('Reservations') },
    }),
    post: op({
      tag: 'Reservations',
      summary: 'Place a hold',
      description: 'Only allowed when no copy is on the shelf. Staff with `reservation:manage` may reserve '
        + "on another member's behalf.",
      permission: 'reservation:create_own or reservation:manage',
      requestBody: jsonBody({
        type: 'object',
        required: ['resource'],
        properties: { resource: { type: 'string' }, user: { type: 'string' }, notes: { type: 'string' } },
      }),
      responses: { 201: okResponse('Hold placed', ref('Reservation')), 409: response('Conflict') },
    }),
  },
  '/reservations/{id}/cancel': {
    post: op({
      tag: 'Reservations',
      summary: 'Cancel a reservation',
      description: 'A copy already allocated to the hold is released to the next member in the queue.',
      permission: 'reservation:manage or ownership',
      parameters: [param('id')],
      requestBody: jsonBody({ type: 'object', properties: { reason: { type: 'string' } } }, false),
      responses: { 200: okResponse('Cancelled') },
    }),
  },
  '/reservations/expire-stale': {
    post: op({
      tag: 'Reservations',
      summary: 'Expire uncollected holds now',
      description: 'The same sweep the nightly job performs.',
      permission: 'reservation:manage',
      responses: { 200: okResponse('Sweep complete') },
    }),
  },

  // Fines
  '/fines': {
    get: op({
      tag: 'Fines', summary: 'List fines', permission: 'fine:view or fine:view_own',
      parameters: [param('page'), param('limit'), param('from'), param('to'), param('format'),
        { name: 'status', in: 'query', schema: { type: 'string' } },
        { name: 'outstandingOnly', in: 'query', schema: { type: 'boolean' } }],
      responses: { 200: listResponse('Fines') },
    }),
    post: op({
      tag: 'Fines', summary: 'Raise a manual fine', permission: 'fine:create',
      requestBody: jsonBody({
        type: 'object',
        required: ['user', 'fineType', 'amount', 'reason'],
        properties: {
          user: { type: 'string' }, fineType: { type: 'string' },
          amount: { type: 'number' }, reason: { type: 'string' },
        },
      }),
      responses: { 201: okResponse('Fine raised', ref('Fine')) },
    }),
  },
  '/fines/summary': {
    get: op({
      tag: 'Fines', summary: 'Charged, paid, waived and outstanding totals', permission: 'fine:view',
      parameters: [param('from'), param('to')],
      responses: { 200: okResponse('Summary') },
    }),
  },
  '/fines/my-outstanding': {
    get: op({
      tag: 'Fines', summary: 'Your outstanding balance', permission: 'fine:view_own',
      responses: { 200: okResponse('Outstanding balance') },
    }),
  },
  '/fines/{id}/payments': {
    post: op({
      tag: 'Fines',
      summary: 'Record a payment',
      description: 'Refused if the amount exceeds the balance. Produces a numbered receipt.',
      permission: 'fine:pay',
      parameters: [param('id')],
      requestBody: jsonBody({
        type: 'object',
        required: ['amount'],
        properties: {
          amount: { type: 'number' },
          method: { type: 'string', enum: ['cash', 'bank', 'mobile_money', 'card', 'internal'] },
          reference: { type: 'string' },
        },
      }),
      responses: { 200: okResponse('Payment recorded'), 400: response('ValidationError') },
    }),
  },
  '/fines/{id}/waive': {
    post: op({
      tag: 'Fines',
      summary: 'Waive a fine in whole or part',
      description: 'Requires a written reason and is always audited against the authorising officer.',
      permission: 'fine:waive',
      parameters: [param('id')],
      requestBody: jsonBody({
        type: 'object',
        required: ['reason'],
        properties: { amount: { type: 'number' }, reason: { type: 'string', minLength: 5 } },
      }),
      responses: { 200: okResponse('Waived', ref('Fine')) },
    }),
  },
  '/fines/{id}/receipt': {
    get: op({
      tag: 'Fines', summary: 'Printable fine statement (PDF)', permission: 'fine:view or ownership',
      parameters: [param('id')],
      responses: { 200: fileResponse('PDF statement') },
    }),
  },

  // Digital repository
  '/digital-resources': {
    get: op({
      tag: 'Digital repository',
      summary: 'Browse the repository',
      description: 'Results are filtered to what the caller is entitled to see under the item access level.',
      permission: 'digital:view',
      parameters: [param('page'), param('limit'), param('search'),
        { name: 'resourceType', in: 'query', schema: { type: 'string' } },
        { name: 'accessLevel', in: 'query', schema: { type: 'string' } },
        { name: 'department', in: 'query', schema: { type: 'string' } }],
      responses: { 200: listResponse('Repository items') },
    }),
    post: op({
      tag: 'Digital repository',
      summary: 'Upload a document',
      description: 'MIME type and extension must agree, and the file must be within the configured size limit.',
      permission: 'digital:upload',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file', 'title', 'resourceType'],
              properties: {
                file: { type: 'string', format: 'binary' },
                title: { type: 'string' },
                resourceType: { type: 'string' },
                accessLevel: { type: 'string' },
                abstract: { type: 'string' },
                keywords: { type: 'string', description: 'Comma-separated or a JSON array' },
              },
            },
          },
        },
      },
      responses: { 201: okResponse('Uploaded', ref('DigitalResource')) },
    }),
  },
  '/digital-resources/{id}/download': {
    get: op({
      tag: 'Digital repository',
      summary: 'Stream the stored file',
      description: 'Access is re-checked here, so requesting an id the caller may not read is indistinguishable '
        + 'from requesting one that does not exist. Every download is audited.',
      permission: 'digital:view plus the item access level',
      parameters: [param('id'), { name: 'inline', in: 'query', schema: { type: 'boolean' } }],
      responses: { 200: fileResponse('The stored document'), 404: response('NotFound') },
    }),
  },

  // Inventory
  '/inventory/summary': {
    get: op({
      tag: 'Inventory', summary: 'Copy counts by status', permission: 'inventory:view',
      responses: { 200: okResponse('Stock summary') },
    }),
  },
  '/inventory/audits': {
    get: op({
      tag: 'Inventory', summary: 'List stock verifications', permission: 'inventory:view',
      responses: { 200: listResponse('Audits') },
    }),
    post: op({
      tag: 'Inventory',
      summary: 'Start a stock verification',
      description: 'Only one audit may be open at a time.',
      permission: 'inventory:manage',
      requestBody: jsonBody({
        type: 'object',
        required: ['title'],
        properties: { title: { type: 'string' }, shelf: { type: 'string' } },
      }),
      responses: { 201: okResponse('Audit started'), 409: response('Conflict') },
    }),
  },
  '/inventory/audits/{id}/items': {
    post: op({
      tag: 'Inventory',
      summary: 'Record a scanned copy',
      description: 'Re-scanning a copy replaces the earlier entry rather than double-counting it. '
        + 'Entries and counts are updated in one atomic step, so several devices may scan at once.',
      permission: 'inventory:manage',
      parameters: [param('id')],
      requestBody: jsonBody({
        type: 'object',
        required: ['identifier', 'foundStatus'],
        properties: {
          identifier: { type: 'string' },
          foundStatus: { type: 'string', enum: ['found', 'missing', 'damaged', 'misplaced'] },
          condition: { type: 'string' },
        },
      }),
      responses: { 200: okResponse('Item recorded') },
    }),
  },
  '/inventory/audits/{id}/complete': {
    post: op({
      tag: 'Inventory',
      summary: 'Close an audit',
      description: 'Optionally applies missing/damaged statuses to the scanned copies. Copies on loan or held for a member are never changed.',
      permission: 'inventory:manage',
      parameters: [param('id')],
      requestBody: jsonBody({ type: 'object', properties: { applyAdjustments: { type: 'boolean', default: true } } }, false),
      responses: { 200: okResponse('Audit completed') },
    }),
  },

  // Clearance
  '/clearance/check': {
    get: op({
      tag: 'Clearance',
      summary: 'Check a member for outstanding obligations',
      description: 'Read-only evaluation of loans, overdue items, lost items and unpaid fines.',
      permission: 'clearance:view',
      parameters: [
        { name: 'identifier', in: 'query', schema: { type: 'string' } },
        { name: 'userId', in: 'query', schema: { type: 'string' } },
      ],
      responses: { 200: okResponse('Obligation check') },
    }),
  },
  '/clearance': {
    get: op({
      tag: 'Clearance', summary: 'List clearance records', permission: 'clearance:view',
      parameters: [param('page'), param('limit'), param('format'), { name: 'status', in: 'query', schema: { type: 'string' } }],
      responses: { 200: listResponse('Clearance records') },
    }),
    post: op({
      tag: 'Clearance', summary: 'Open a clearance case for a member', permission: 'clearance:process',
      requestBody: jsonBody({ type: 'object', required: ['user'], properties: { user: { type: 'string' } } }),
      responses: { 201: okResponse('Clearance recorded', ref('Clearance')) },
    }),
  },
  '/clearance/request': {
    post: op({
      tag: 'Clearance', summary: 'Request your own clearance', permission: 'clearance:request_own',
      responses: { 201: okResponse('Request submitted', ref('Clearance')) },
    }),
  },
  '/clearance/my-status': {
    get: op({
      tag: 'Clearance', summary: 'Your clearance status and live obligations', permission: 'clearance:view_own',
      responses: { 200: okResponse('Clearance status') },
    }),
  },
  '/clearance/{id}/approve': {
    post: op({
      tag: 'Clearance',
      summary: 'Grant clearance',
      description: 'Obligations are re-evaluated at this moment. Granting despite live obligations requires '
        + '`override: true`, a written reason of at least 10 characters, and the `clearance:override` permission.',
      permission: 'clearance:process (plus clearance:override to override)',
      parameters: [param('id')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          comments: { type: 'string' },
          override: { type: 'boolean', default: false },
          overrideReason: { type: 'string', minLength: 10 },
        },
      }, false),
      responses: { 200: okResponse('Clearance granted', ref('Clearance')), 409: response('Conflict') },
    }),
  },
  '/clearance/{id}/certificate': {
    get: op({
      tag: 'Clearance', summary: 'Clearance certificate (PDF)',
      description: 'Available only once clearance has been granted.',
      permission: 'clearance:view or ownership',
      parameters: [param('id')],
      responses: { 200: fileResponse('PDF certificate'), 400: response('ValidationError') },
    }),
  },

  // Reading groups
  '/reading-groups': {
    get: op({
      tag: 'Reading groups', summary: 'List groups', permission: 'group:view or group:view_own',
      parameters: [param('page'), param('limit'), param('search')],
      responses: { 200: listResponse('Reading groups') },
    }),
    post: op({
      tag: 'Reading groups', summary: 'Create a group', permission: 'group:manage',
      requestBody: jsonBody(ref('ReadingGroup')),
      responses: { 201: okResponse('Created', ref('ReadingGroup')) },
    }),
  },
  '/reading-groups/{id}/members': {
    post: op({
      tag: 'Reading groups',
      summary: 'Add or remove members',
      description: 'The group leader cannot be removed without first assigning a new leader.',
      permission: 'group:manage',
      parameters: [param('id')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          add: { type: 'array', items: { type: 'string' } },
          remove: { type: 'array', items: { type: 'string' } },
        },
      }),
      responses: { 200: okResponse('Membership updated') },
    }),
  },
  '/reading-groups/sessions': {
    get: op({
      tag: 'Reading groups', summary: 'List scheduled sessions', permission: 'group:view or group:view_own',
      parameters: [param('page'), param('limit'), param('from'), param('to'),
        { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } }],
      responses: { 200: listResponse('Sessions') },
    }),
    post: op({
      tag: 'Reading groups',
      summary: 'Schedule a session',
      description: 'Refused when the study space is already booked over an overlapping window, or when the '
        + 'expected attendance exceeds the space capacity.',
      permission: 'group:manage',
      requestBody: jsonBody(ref('ReadingGroupSession')),
      responses: { 201: okResponse('Session scheduled', ref('ReadingGroupSession')), 409: response('Conflict') },
    }),
  },
  '/reading-groups/sessions/{id}/attendance': {
    post: op({
      tag: 'Reading groups',
      summary: 'Record attendance',
      description: 'Only members of the group may be marked. Re-posting corrects the earlier record.',
      permission: 'group:attendance',
      parameters: [param('id')],
      requestBody: jsonBody({
        type: 'object',
        required: ['entries'],
        properties: {
          entries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                user: { type: 'string' },
                status: { type: 'string', enum: ['present', 'absent', 'excused'] },
                remark: { type: 'string' },
              },
            },
          },
        },
      }),
      responses: { 200: okResponse('Attendance recorded') },
    }),
  },
  '/reading-groups/schedule': {
    get: op({
      tag: 'Reading groups', summary: 'Reading room schedule for a day or range',
      permission: 'group:view or group:view_own',
      parameters: [param('from'), param('to')],
      responses: { 200: okResponse('Schedule') },
    }),
  },

  // Dashboards
  '/dashboard/admin': {
    get: op({
      tag: 'Dashboards', summary: 'Administrator dashboard', permission: 'dashboard:admin',
      description: 'Aggregated server-side; the client renders the numbers as returned.',
      responses: { 200: okResponse('Dashboard') },
    }),
  },
  '/dashboard/librarian': {
    get: op({ tag: 'Dashboards', summary: 'Librarian dashboard', permission: 'dashboard:librarian', responses: { 200: okResponse('Dashboard') } }),
  },
  '/dashboard/me': {
    get: op({ tag: 'Dashboards', summary: 'Member dashboard', permission: 'dashboard:self', responses: { 200: okResponse('Dashboard') } }),
  },

  // Reports
  '/reports': {
    get: op({ tag: 'Reports', summary: 'List available reports', permission: 'report:view', responses: { 200: okResponse('Report catalogue') } }),
  },
  '/reports/overview': {
    get: op({
      tag: 'Reports', summary: 'Headline figures for the reports landing page', permission: 'report:view',
      parameters: [param('from'), param('to')],
      responses: { 200: okResponse('Overview') },
    }),
  },
  '/reports/{key}': {
    get: op({
      tag: 'Reports',
      summary: 'Run a report',
      description: 'The same rows are rendered as JSON, XLSX, CSV or PDF according to `format`.',
      permission: 'report:view',
      parameters: [
        { name: 'key', in: 'path', required: true, schema: { type: 'string' }, description: 'Report key from `GET /reports`' },
        param('from'), param('to'), param('format'),
      ],
      responses: { 200: okResponse('Report'), 404: response('NotFound') },
    }),
  },

  // Notifications
  '/notifications': {
    get: op({
      tag: 'Notifications', summary: 'Your notifications',
      parameters: [param('page'), param('limit'), { name: 'isRead', in: 'query', schema: { type: 'boolean' } }],
      responses: { 200: listResponse('Notifications') },
    }),
  },
  '/notifications/unread-count': {
    get: op({ tag: 'Notifications', summary: 'Unread count', responses: { 200: okResponse('Unread count') } }),
  },
  '/notifications/read-all': {
    post: op({ tag: 'Notifications', summary: 'Mark everything as read', responses: { 200: okResponse('Marked as read') } }),
  },
  '/notifications/broadcast': {
    post: op({
      tag: 'Notifications', summary: 'Send an announcement', permission: 'notification:broadcast',
      requestBody: jsonBody({
        type: 'object',
        required: ['title', 'message'],
        properties: { roleKey: { type: 'string' }, title: { type: 'string' }, message: { type: 'string' } },
      }),
      responses: { 200: okResponse('Announcement sent') },
    }),
  },

  // Administration
  '/settings': {
    get: op({ tag: 'Administration', summary: 'Read system settings', permission: 'setting:view', responses: { 200: okResponse('Settings') } }),
    patch: op({
      tag: 'Administration',
      summary: 'Update system settings',
      description: 'Borrowing rules and fine policies live here; changing them takes effect on the next transaction.',
      permission: 'setting:manage',
      requestBody: jsonBody({ type: 'object' }),
      responses: { 200: okResponse('Settings updated') },
    }),
  },
  '/settings/public': {
    get: op({
      tag: 'Administration',
      summary: 'Public branding for the sign-in screen',
      security: PUBLIC,
      responses: { 200: okResponse('Public settings') },
    }),
  },
  '/roles': {
    get: op({ tag: 'Administration', summary: 'List roles', permission: 'role:view', responses: { 200: okResponse('Roles') } }),
    post: op({
      tag: 'Administration', summary: 'Create a role', permission: 'role:manage',
      requestBody: jsonBody({
        type: 'object',
        required: ['key', 'name', 'level'],
        properties: {
          key: { type: 'string' }, name: { type: 'string' }, level: { type: 'integer' },
          permissions: { type: 'array', items: ref('Permission') },
        },
      }),
      responses: { 201: okResponse('Role created') },
    }),
  },
  '/roles/permissions': {
    get: op({
      tag: 'Administration', summary: 'Permission catalogue grouped by domain', permission: 'role:view',
      responses: { 200: okResponse('Permissions') },
    }),
  },
  '/roles/{id}': {
    patch: op({
      tag: 'Administration',
      summary: 'Update a role',
      description: 'The super administrator role is immutable, and no actor may modify a role at or above '
        + 'their own authority level.',
      permission: 'role:manage',
      parameters: [param('id')],
      requestBody: jsonBody({ type: 'object' }),
      responses: { 200: okResponse('Role updated'), 403: response('Forbidden') },
    }),
  },
  '/audit-logs': {
    get: op({
      tag: 'Administration',
      summary: 'Search the audit trail',
      description: 'Audit entries are append-only: nothing in the application can update or delete them.',
      permission: 'audit:view',
      parameters: [param('page'), param('limit'), param('from'), param('to'),
        { name: 'action', in: 'query', schema: { type: 'string' } },
        { name: 'entityType', in: 'query', schema: { type: 'string' } },
        { name: 'user', in: 'query', schema: { type: 'string' } }],
      responses: { 200: listResponse('Audit entries') },
    }),
  },
};
