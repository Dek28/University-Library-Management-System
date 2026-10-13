const {
  z, objectId, optionalObjectId, paginationQuery, dateRangeQuery, timeString, booleanish,
} = require('./common.validator');
const { GROUP_STATUS, ATTENDANCE_STATUS } = require('../constants/enums');

const groupBody = z.object({
  name: z.string().trim().min(2).max(120),
  groupCode: z.string().trim().max(40).optional(),
  description: z.string().trim().max(1000).optional().default(''),
  readingTopic: z.string().trim().max(200).optional().default(''),
  leader: optionalObjectId,
  members: z.array(objectId).max(100).optional().default([]),
  department: optionalObjectId,
  faculty: optionalObjectId,
  program: optionalObjectId,
  academicYear: z.string().trim().max(20).optional().default(''),
  status: z.enum(GROUP_STATUS).optional(),
  maxMembers: z.coerce.number().int().min(2).max(100).optional(),
  notes: z.string().trim().max(1000).optional().default(''),
});

const groupUpdateBody = groupBody.partial();

const membersBody = z.object({
  add: z.array(objectId).max(100).optional().default([]),
  remove: z.array(objectId).max(100).optional().default([]),
}).refine((d) => d.add.length || d.remove.length, {
  message: 'Provide at least one member to add or remove',
  path: ['add'],
});

const groupListQuery = paginationQuery.extend({
  status: z.enum(GROUP_STATUS).optional(),
  department: objectId.optional(),
  faculty: objectId.optional(),
  academicYear: z.string().optional(),
  member: objectId.optional(),
  leader: objectId.optional(),
});

const sessionBody = z.object({
  group: objectId,
  title: z.string().trim().max(160).optional().default(''),
  topic: z.string().trim().max(200).optional().default(''),
  sessionDate: z.coerce.date(),
  startTime: timeString,
  endTime: timeString,
  space: objectId,
  expectedAttendees: z.coerce.number().int().min(0).max(200).optional(),
  notes: z.string().trim().max(1000).optional().default(''),
});

const sessionUpdateBody = sessionBody.partial().omit({ group: true }).extend({
  status: z.enum(GROUP_STATUS).optional(),
});

const sessionListQuery = paginationQuery.merge(dateRangeQuery).extend({
  group: objectId.optional(),
  space: objectId.optional(),
  status: z.enum(GROUP_STATUS).optional(),
  date: z.string().optional(),
  upcoming: booleanish.optional(),
});

const attendanceBody = z.object({
  entries: z.array(z.object({
    user: objectId,
    status: z.enum(ATTENDANCE_STATUS),
    remark: z.string().trim().max(200).optional().default(''),
  })).min(1).max(100),
});

const scheduleQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

module.exports = {
  groupBody, groupUpdateBody, membersBody, groupListQuery,
  sessionBody, sessionUpdateBody, sessionListQuery, attendanceBody, scheduleQuery,
};
