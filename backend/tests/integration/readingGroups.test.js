const dayjs = require('dayjs');
const {
  as, ensureRoles, ensureSettings, createUser, createAndSignIn,
  createStudySpace, resetDatabase, models,
} = require('../helpers');

const { ReadingGroup, ReadingGroupSession, ReadingGroupAttendance } = models;

describe('Reading groups', () => {
  let librarian;
  let student;
  let members;
  let space;
  let otherSpace;

  const tomorrow = () => dayjs().add(1, 'day').format('YYYY-MM-DD');

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();

    librarian = await createAndSignIn('librarian');
    student = await createAndSignIn('student', { registrationNumber: 'REG/GRP/0001' });

    members = await Promise.all([
      createUser('student', { registrationNumber: 'REG/GRP/0002' }),
      createUser('student', { registrationNumber: 'REG/GRP/0003' }),
    ]);

    space = await createStudySpace({ name: 'Group Study Room 1', capacity: 10 });
    otherSpace = await createStudySpace({ name: 'Group Study Room 2', capacity: 8 });
  });

  afterAll(resetDatabase);

  beforeEach(async () => {
    await Promise.all([
      ReadingGroupSession.deleteMany({}),
      ReadingGroupAttendance.deleteMany({}),
      ReadingGroup.deleteMany({}),
    ]);
  });

  /** Creates a group with the student and both extra members. */
  const createGroup = async (overrides = {}) => {
    const response = await as(librarian.token).post('/reading-groups', {
      name: overrides.name || 'Algorithms Study Circle',
      readingTopic: 'Graph algorithms',
      leader: String(student.user.id),
      members: [String(student.user.id), ...members.map((m) => String(m._id))],
      maxMembers: 20,
      status: 'active',
      ...overrides,
    });
    expect(response.status).toBe(201);
    return response.body.data;
  };

  const scheduleSession = (group, overrides = {}) =>
    as(librarian.token).post('/reading-groups/sessions', {
      group: group.id,
      space: String(space._id),
      sessionDate: tomorrow(),
      startTime: '10:00',
      endTime: '12:00',
      topic: 'Session',
      ...overrides,
    });

  describe('groups', () => {
    it('creates a group with its members and leader', async () => {
      const group = await createGroup();

      expect(group.groupCode).toMatch(/^RG-/);
      expect(group.members).toHaveLength(3);
      expect(group.leader.id).toBe(String(student.user.id));
    });

    it('adds and removes members', async () => {
      const group = await createGroup({ members: [String(student.user.id)], leader: String(student.user.id) });

      const added = await as(librarian.token).post(`/reading-groups/${group.id}/members`, {
        add: members.map((m) => String(m._id)),
      });
      expect(added.status).toBe(200);
      expect(added.body.data.members).toHaveLength(3);

      const removed = await as(librarian.token).post(`/reading-groups/${group.id}/members`, {
        remove: [String(members[0]._id)],
      });
      expect(removed.body.data.members).toHaveLength(2);
    });

    it('refuses to remove the leader without reassigning first', async () => {
      const group = await createGroup();

      const response = await as(librarian.token).post(`/reading-groups/${group.id}/members`, {
        remove: [String(student.user.id)],
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/leader cannot be removed/i);
    });

    it('does not let a student create a group', async () => {
      const response = await as(student.token).post('/reading-groups', {
        name: 'Unauthorised group',
        members: [],
      });
      expect(response.status).toBe(403);
    });
  });

  describe('Workflow G — scheduling and space conflicts', () => {
    it('schedules a session in a study space', async () => {
      const group = await createGroup();

      const response = await scheduleSession(group);

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('planned');
      expect(response.body.data.space.id).toBe(String(space._id));
    });

    it('refuses an overlapping booking of the same space', async () => {
      const group = await createGroup();
      const other = await createGroup({ name: 'Nursing Practice Group' });

      const first = await scheduleSession(group, { startTime: '10:00', endTime: '12:00' });
      expect(first.status).toBe(201);

      // Starts inside the first booking.
      const overlapping = await scheduleSession(other, { startTime: '11:00', endTime: '13:00' });
      expect(overlapping.status).toBe(409);
      expect(overlapping.body.message).toMatch(/already booked/i);

      // Fully contains the first booking.
      const enclosing = await scheduleSession(other, { startTime: '09:00', endTime: '14:00' });
      expect(enclosing.status).toBe(409);

      // Exactly the same window.
      const identical = await scheduleSession(other, { startTime: '10:00', endTime: '12:00' });
      expect(identical.status).toBe(409);

      expect(await ReadingGroupSession.countDocuments({ space: space._id })).toBe(1);
    });

    it('allows an adjacent, non-overlapping booking', async () => {
      const group = await createGroup();
      const other = await createGroup({ name: 'Accounting Revision Group' });

      await scheduleSession(group, { startTime: '10:00', endTime: '12:00' });

      const adjacent = await scheduleSession(other, { startTime: '12:00', endTime: '14:00' });
      expect(adjacent.status).toBe(201);
    });

    it('allows the same time in a different space', async () => {
      const group = await createGroup();
      const other = await createGroup({ name: 'Statistics Group' });

      await scheduleSession(group, { startTime: '10:00', endTime: '12:00' });

      const elsewhere = await scheduleSession(other, {
        space: String(otherSpace._id),
        startTime: '10:00',
        endTime: '12:00',
      });
      expect(elsewhere.status).toBe(201);
    });

    it('allows the same space on a different day', async () => {
      const group = await createGroup();

      await scheduleSession(group, { startTime: '10:00', endTime: '12:00' });

      const nextDay = await scheduleSession(group, {
        sessionDate: dayjs().add(2, 'day').format('YYYY-MM-DD'),
        startTime: '10:00',
        endTime: '12:00',
      });
      expect(nextDay.status).toBe(201);
    });

    it('refuses a booking that exceeds the space capacity', async () => {
      const group = await createGroup();

      const response = await scheduleSession(group, { expectedAttendees: 50 });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/seats/i);
    });

    it('refuses an end time before the start time', async () => {
      const group = await createGroup();

      const response = await scheduleSession(group, { startTime: '14:00', endTime: '12:00' });
      expect(response.status).toBe(400);
    });

    it('refuses a session scheduled in the past', async () => {
      const group = await createGroup();

      const response = await scheduleSession(group, {
        sessionDate: dayjs().subtract(2, 'day').format('YYYY-MM-DD'),
      });
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/past/i);
    });

    it('frees the space when a session is cancelled', async () => {
      const group = await createGroup();
      const other = await createGroup({ name: 'Second group' });

      const first = await scheduleSession(group, { startTime: '10:00', endTime: '12:00' });
      await as(librarian.token).post(`/reading-groups/sessions/${first.body.data.id}/cancel`, {
        reason: 'Group unavailable',
      });

      const rebooked = await scheduleSession(other, { startTime: '10:00', endTime: '12:00' });
      expect(rebooked.status).toBe(201);
    });

    it('lists the day schedule per space', async () => {
      const group = await createGroup();
      await scheduleSession(group);

      const response = await as(librarian.token).get(`/reading-groups/schedule?from=${tomorrow()}&to=${tomorrow()}`);

      expect(response.status).toBe(200);
      expect(response.body.data.spaces.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data.sessions).toHaveLength(1);
    });
  });

  describe('attendance', () => {
    it('records attendance for the group members', async () => {
      const group = await createGroup();
      const session = await scheduleSession(group);

      const response = await as(librarian.token).post(`/reading-groups/sessions/${session.body.data.id}/attendance`, {
        entries: [
          { user: String(student.user.id), status: 'present' },
          { user: String(members[0]._id), status: 'absent' },
          { user: String(members[1]._id), status: 'excused', remark: 'Medical appointment' },
        ],
      });

      expect(response.status).toBe(200);
      expect(response.body.data.attendance).toHaveLength(3);
      expect(response.body.data.attendanceRecorded).toBe(true);
    });

    it('replaces an earlier mark rather than duplicating it', async () => {
      const group = await createGroup();
      const session = await scheduleSession(group);
      const sessionId = session.body.data.id;

      await as(librarian.token).post(`/reading-groups/sessions/${sessionId}/attendance`, {
        entries: [{ user: String(student.user.id), status: 'absent' }],
      });
      const corrected = await as(librarian.token).post(`/reading-groups/sessions/${sessionId}/attendance`, {
        entries: [{ user: String(student.user.id), status: 'present' }],
      });

      expect(corrected.body.data.attendance).toHaveLength(1);
      expect(corrected.body.data.attendance[0].status).toBe('present');
    });

    it('refuses attendance for someone who is not a member', async () => {
      const group = await createGroup();
      const session = await scheduleSession(group);
      const outsider = await createUser('student', { registrationNumber: 'REG/GRP/OUT' });

      const response = await as(librarian.token).post(`/reading-groups/sessions/${session.body.data.id}/attendance`, {
        entries: [{ user: String(outsider._id), status: 'present' }],
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/members of this group/i);
    });
  });

  describe('member visibility', () => {
    it('shows a member only the groups they belong to', async () => {
      await createGroup({ name: 'My group' });
      const outsiderGroup = await createGroup({
        name: 'Someone else group',
        members: members.map((m) => String(m._id)),
        leader: String(members[0]._id),
      });

      const response = await as(student.token).get('/reading-groups');

      expect(response.status).toBe(200);
      const names = response.body.data.map((group) => group.name);
      expect(names).toContain('My group');
      expect(names).not.toContain('Someone else group');
    });
  });
});
