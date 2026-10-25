const { ReadingGroup, ReadingGroupSession, ReadingGroupAttendance } = require('../models/readingGroup');
const { StudySpace } = require('../models/reference');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const { buildPagination, paginate, compact, like, dateRange } = require('../utils/query');
const { groupCode } = require('../utils/identifiers');
const { timeToMinutes, startOfDay, endOfDay, dayjs } = require('../utils/datetime');

const GROUP_POPULATE = [
  { path: 'leader', select: 'firstName lastName registrationNumber email' },
  { path: 'members', select: 'firstName lastName registrationNumber email' },
  { path: 'department', select: 'code name' },
  { path: 'faculty', select: 'code name' },
  { path: 'program', select: 'code name' },
  { path: 'createdBy', select: 'firstName lastName' },
];

const SESSION_POPULATE = [
  { path: 'group', select: 'name groupCode leader members department' },
  { path: 'space', select: 'name spaceType capacity location' },
];

async function listGroups(query = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt' });
  const filter = compact({
    status: query.status,
    department: query.department,
    faculty: query.faculty,
    academicYear: query.academicYear,
  });
  if (query.member) filter.members = query.member;
  if (query.leader) filter.leader = query.leader;
  if (query.search) {
    filter.$or = [
      { name: like(query.search) },
      { groupCode: like(query.search) },
      { readingTopic: like(query.search) },
    ];
  }
  return paginate(ReadingGroup, filter, pagination, {
    populate: [
      { path: 'leader', select: 'firstName lastName' },
      { path: 'department', select: 'code name' },
    ],
  });
}

async function getGroup(id) {
  const group = await ReadingGroup.findById(id).populate(GROUP_POPULATE);
  if (!group) throw ApiError.notFound('Reading group not found');
  const sessions = await ReadingGroupSession.find({ group: id })
    .populate('space', 'name location')
    .sort('-startsAt')
    .limit(50)
    .lean();
  return { ...group.toJSON(), sessions };
}

async function createGroup(payload, actor, context = {}) {
  if (payload.leader && payload.members?.length && !payload.members.includes(payload.leader)) {
    // The leader is always a member of their own group.
    payload.members = [...payload.members, payload.leader];
  }

  const group = await ReadingGroup.create({
    ...payload,
    groupCode: payload.groupCode || groupCode(),
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await auditService.record({
    ...context, actor, action: 'group_created', entityType: 'ReadingGroup', entityId: group._id,
    entityLabel: group.name, newValue: { name: group.name, members: group.members.length },
  });
  return getGroup(group._id);
}

async function updateGroup(id, payload, actor, context = {}) {
  const group = await ReadingGroup.findById(id);
  if (!group) throw ApiError.notFound('Reading group not found');
  const before = group.toObject();

  group.set({ ...payload, updatedBy: actor._id });
  await group.save();

  await auditService.record({
    ...context, actor, action: 'group_updated', entityType: 'ReadingGroup', entityId: group._id,
    entityLabel: group.name, oldValue: before, newValue: group.toObject(),
  });
  return getGroup(id);
}

async function setMembers(id, { add = [], remove = [] }, actor, context = {}) {
  const group = await ReadingGroup.findById(id);
  if (!group) throw ApiError.notFound('Reading group not found');

  if (add.length) {
    const found = await User.countDocuments({ _id: { $in: add } });
    if (found !== add.length) throw ApiError.badRequest('One or more members do not exist');
  }

  const before = group.members.map(String);
  const next = new Set(before);
  add.forEach((m) => next.add(String(m)));
  remove.forEach((m) => next.delete(String(m)));

  if (next.size > group.maxMembers) {
    throw ApiError.badRequest(`This group is limited to ${group.maxMembers} members`);
  }
  if (group.leader && !next.has(String(group.leader))) {
    throw ApiError.badRequest('The group leader cannot be removed. Assign a new leader first.');
  }

  group.members = [...next];
  group.updatedBy = actor._id;
  await group.save();

  await auditService.record({
    ...context, actor, action: 'group_updated', entityType: 'ReadingGroup', entityId: group._id,
    entityLabel: group.name,
    oldValue: { memberCount: before.length }, newValue: { memberCount: group.members.length, added: add, removed: remove },
  });
  return getGroup(id);
}

async function removeGroup(id, actor, context = {}) {
  const group = await ReadingGroup.findById(id);
  if (!group) throw ApiError.notFound('Reading group not found');

  const upcoming = await ReadingGroupSession.countDocuments({
    group: id, status: { $in: ['planned', 'active'] }, endsAt: { $gte: new Date() },
  });
  if (upcoming > 0) {
    throw ApiError.conflict(`This group has ${upcoming} scheduled session(s). Cancel them first.`);
  }

  await group.softDelete(actor._id);
  await auditService.record({
    ...context, actor, action: 'group_updated', entityType: 'ReadingGroup', entityId: group._id,
    entityLabel: group.name, description: 'Group deleted',
  });
  return true;
}

/**
 * Combines a session date with HH:mm times into absolute instants.
 * Sessions are treated as local wall-clock times on the given date.
 */
function resolveWindow({ sessionDate, startTime, endTime }) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) throw ApiError.badRequest('Times must be in HH:mm format');
  if (end <= start) throw ApiError.badRequest('The end time must be after the start time');

  const base = dayjs(sessionDate).startOf('day');
  return {
    startsAt: base.add(start, 'minute').toDate(),
    endsAt: base.add(end, 'minute').toDate(),
  };
}

/**
 * Finds a session already booked into the same space over an overlapping
 * window. Two intervals overlap when each starts before the other ends.
 */
async function findConflict({ space, startsAt, endsAt, excludeId }) {
  const filter = {
    space,
    status: { $in: ['planned', 'active'] },
    startsAt: { $lt: endsAt },
    endsAt: { $gt: startsAt },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return ReadingGroupSession.findOne(filter).populate('group', 'name groupCode').populate('space', 'name code');
}

async function scheduleSession(payload, actor, context = {}) {
  const group = await ReadingGroup.findById(payload.group);
  if (!group) throw ApiError.notFound('Reading group not found');

  const space = await StudySpace.findById(payload.space);
  if (!space) throw ApiError.badRequest('The study space does not exist');
  if (!space.isActive) throw ApiError.badRequest('That study space is not currently bookable');

  const { startsAt, endsAt } = resolveWindow(payload);
  if (endsAt < new Date()) throw ApiError.badRequest('Sessions cannot be scheduled in the past');

  const expected = payload.expectedAttendees || group.members.length;
  if (expected > space.capacity) {
    throw ApiError.badRequest(`${space.name} seats ${space.capacity}; ${expected} attendees are expected`);
  }

  const conflict = await findConflict({ space: space._id, startsAt, endsAt });
  if (conflict) {
    throw ApiError.conflict(
      `${space.name} is already booked by "${conflict.group?.name}" from `
      + `${conflict.startTime} to ${conflict.endTime} on that date`,
    );
  }

  const session = await ReadingGroupSession.create({
    ...payload,
    startsAt,
    endsAt,
    expectedAttendees: expected,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await auditService.record({
    ...context, actor, action: 'group_session_created', entityType: 'ReadingGroupSession', entityId: session._id,
    entityLabel: `${group.name} @ ${space.name}`,
    newValue: { startsAt, endsAt, space: space.name },
  });

  // Tell the members a sitting has been scheduled for them.
  for (const memberId of group.members) {
    // eslint-disable-next-line no-await-in-loop
    await notificationService.notify({
      user: memberId,
      type: 'group_session',
      title: `Reading session scheduled: ${group.name}`,
      message: `${payload.topic || group.readingTopic || 'Study session'} at ${space.name}, `
        + `${dayjs(startsAt).format('YYYY-MM-DD')} ${payload.startTime}–${payload.endTime}.`,
      entityType: 'ReadingGroupSession',
      entityId: session._id,
      link: '/reading-groups',
    });
  }

  return ReadingGroupSession.findById(session._id).populate(SESSION_POPULATE);
}

async function updateSession(id, payload, actor, context = {}) {
  const session = await ReadingGroupSession.findById(id);
  if (!session) throw ApiError.notFound('Session not found');
  if (session.attendanceRecorded && (payload.sessionDate || payload.startTime || payload.space)) {
    throw ApiError.badRequest('Attendance has been recorded; this session can no longer be rescheduled');
  }
  const before = session.toObject();

  const needsWindow = payload.sessionDate || payload.startTime || payload.endTime;
  if (needsWindow) {
    const { startsAt, endsAt } = resolveWindow({
      sessionDate: payload.sessionDate || session.sessionDate,
      startTime: payload.startTime || session.startTime,
      endTime: payload.endTime || session.endTime,
    });
    payload.startsAt = startsAt;
    payload.endsAt = endsAt;
  }

  const space = payload.space || session.space;
  const startsAt = payload.startsAt || session.startsAt;
  const endsAt = payload.endsAt || session.endsAt;

  if (needsWindow || payload.space) {
    const conflict = await findConflict({ space, startsAt, endsAt, excludeId: session._id });
    if (conflict) {
      throw ApiError.conflict(`That space is already booked by "${conflict.group?.name}" in the requested window`);
    }
  }

  session.set({ ...payload, updatedBy: actor._id });
  await session.save();

  await auditService.record({
    ...context, actor, action: 'group_updated', entityType: 'ReadingGroupSession', entityId: session._id,
    entityLabel: String(session._id), oldValue: before, newValue: session.toObject(),
  });
  return ReadingGroupSession.findById(id).populate(SESSION_POPULATE);
}

async function cancelSession(id, reason, actor, context = {}) {
  const session = await ReadingGroupSession.findById(id);
  if (!session) throw ApiError.notFound('Session not found');
  session.status = 'cancelled';
  session.notes = `${session.notes} | Cancelled: ${reason || ''}`.trim();
  session.updatedBy = actor._id;
  await session.save();

  await auditService.record({
    ...context, actor, action: 'group_updated', entityType: 'ReadingGroupSession', entityId: session._id,
    description: `Session cancelled: ${reason || ''}`,
  });
  return ReadingGroupSession.findById(id).populate(SESSION_POPULATE);
}

/** `memberId` limits the result to sessions of groups that member belongs to. */
async function listSessions(query = {}, { memberId } = {}) {
  const pagination = buildPagination(query, { defaultSort: 'startsAt', defaultLimit: 50 });
  const filter = compact({ group: query.group, space: query.space, status: query.status });

  if (memberId) {
    const groupIds = (await ReadingGroup.find({ members: memberId }).distinct('_id')).map(String);
    const requested = query.group ? String(query.group) : null;
    filter.group = requested && !groupIds.includes(requested) ? { $in: [] } : { $in: requested ? [requested] : groupIds };
  }

  if (query.date) {
    filter.startsAt = { $gte: startOfDay(query.date), $lte: endOfDay(query.date) };
  } else {
    const range = dateRange(query.from, query.to);
    if (range) filter.startsAt = range;
  }
  if (query.upcoming === true) filter.startsAt = { ...(filter.startsAt || {}), $gte: new Date() };

  return paginate(ReadingGroupSession, filter, pagination, { populate: SESSION_POPULATE });
}

async function getSession(id, { memberId } = {}) {
  const session = await ReadingGroupSession.findById(id).populate([
    ...SESSION_POPULATE,
    { path: 'group', populate: { path: 'members', select: 'firstName lastName registrationNumber' } },
  ]);
  if (!session) throw ApiError.notFound('Session not found');
  if (memberId && !(session.group?.members || []).some((m) => String(m._id || m) === String(memberId))) {
    throw ApiError.forbidden();
  }
  const attendance = await ReadingGroupAttendance.find({ session: id })
    .populate('user', 'firstName lastName registrationNumber')
    .lean();
  return { ...session.toJSON(), attendance };
}

/** Records (or corrects) attendance for a session in one call. */
async function recordAttendance(sessionId, entries, actor, context = {}) {
  const session = await ReadingGroupSession.findById(sessionId).populate('group', 'members name');
  if (!session) throw ApiError.notFound('Session not found');
  if (session.status === 'cancelled') throw ApiError.badRequest('Attendance cannot be recorded for a cancelled session');

  const memberIds = new Set((session.group?.members || []).map(String));
  const invalid = entries.filter((e) => !memberIds.has(String(e.user)));
  if (invalid.length) {
    throw ApiError.badRequest('Attendance can only be recorded for members of this group');
  }

  const operations = entries.map((entry) => ({
    updateOne: {
      filter: { session: sessionId, user: entry.user },
      update: {
        $set: {
          group: session.group._id,
          status: entry.status,
          remark: entry.remark || '',
          recordedBy: actor._id,
          recordedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));
  await ReadingGroupAttendance.bulkWrite(operations);

  session.attendanceRecorded = true;
  if (session.status === 'planned' && session.endsAt < new Date()) session.status = 'completed';
  await session.save();

  await auditService.record({
    ...context, actor, action: 'group_attendance_recorded', entityType: 'ReadingGroupSession', entityId: session._id,
    entityLabel: session.group?.name,
    newValue: { recorded: entries.length, present: entries.filter((e) => e.status === 'present').length },
  });

  return getSession(sessionId);
}

/** Day or week view of the reading-room schedule. */
async function schedule({ from, to } = {}) {
  const start = startOfDay(from || new Date());
  const end = endOfDay(to || from || new Date());

  const sessions = await ReadingGroupSession.find({
    startsAt: { $gte: start, $lte: end },
    status: { $in: ['planned', 'active', 'completed'] },
  })
    .populate('group', 'name groupCode readingTopic')
    .populate('space', 'name spaceType capacity location')
    .sort('startsAt')
    .lean();

  const spaces = await StudySpace.find({ isActive: true }).select('name spaceType capacity').sort('name').lean();
  return { from: start, to: end, spaces, sessions };
}

/** Participation analytics for the reading-group report. */
async function statistics({ from, to } = {}) {
  const range = dateRange(from, to);
  const match = range ? { startsAt: range } : {};

  const [byStatus, byDepartment, attendance, topSpaces, topGroups] = await Promise.all([
    ReadingGroupSession.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ReadingGroup.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$department', groups: { $sum: 1 }, members: { $sum: { $size: '$members' } } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
      { $project: { department: { $ifNull: [{ $first: '$dept.name' }, 'Unassigned'] }, groups: 1, members: 1 } },
      { $sort: { groups: -1 } },
    ]),
    ReadingGroupAttendance.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ReadingGroupSession.aggregate([
      { $match: match },
      { $group: { _id: '$space', sessions: { $sum: 1 } } },
      { $lookup: { from: 'studyspaces', localField: '_id', foreignField: '_id', as: 'space' } },
      { $project: { space: { $ifNull: [{ $first: '$space.name' }, 'Unknown'] }, sessions: 1 } },
      { $sort: { sessions: -1 } },
      { $limit: 10 },
    ]),
    ReadingGroupSession.aggregate([
      { $match: match },
      { $group: { _id: '$group', sessions: { $sum: 1 } } },
      { $lookup: { from: 'readinggroups', localField: '_id', foreignField: '_id', as: 'group' } },
      { $project: { group: { $ifNull: [{ $first: '$group.name' }, 'Unknown'] }, sessions: 1 } },
      { $sort: { sessions: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const toMap = (rows) => rows.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {});
  return {
    sessionsByStatus: toMap(byStatus),
    attendanceByStatus: toMap(attendance),
    byDepartment,
    mostUsedSpaces: topSpaces,
    mostActiveGroups: topGroups,
    totalGroups: await ReadingGroup.countDocuments(),
    activeGroups: await ReadingGroup.countDocuments({ status: 'active' }),
  };
}

module.exports = {
  listGroups, getGroup, createGroup, updateGroup, setMembers, removeGroup,
  scheduleSession, updateSession, cancelSession, listSessions, getSession,
  recordAttendance, schedule, statistics, findConflict, resolveWindow,
};
