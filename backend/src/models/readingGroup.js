const mongoose = require('mongoose');
const { toJSONPlugin, softDeletePlugin, authorshipPlugin } = require('./plugins/common');
const { GROUP_STATUS, ATTENDANCE_STATUS } = require('../constants/enums');

const { Schema } = mongoose;

const readingGroupSchema = new Schema(
  {
    groupCode: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    readingTopic: { type: String, trim: true, default: '' },

    leader: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    faculty: { type: Schema.Types.ObjectId, ref: 'Faculty', default: null },
    program: { type: Schema.Types.ObjectId, ref: 'Program', default: null },
    academicYear: { type: String, trim: true, default: '' },

    status: { type: String, enum: GROUP_STATUS, default: 'planned', index: true },
    maxMembers: { type: Number, min: 2, max: 100, default: 20 },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);
readingGroupSchema.plugin(toJSONPlugin);
readingGroupSchema.plugin(softDeletePlugin);
readingGroupSchema.plugin(authorshipPlugin);
readingGroupSchema.index({ name: 'text', readingTopic: 'text' }, { name: 'group_text_search' });
readingGroupSchema.virtual('memberCount').get(function memberCount() {
  return this.members ? this.members.length : 0;
});

/**
 * A scheduled sitting for a group. `startsAt`/`endsAt` are absolute UTC
 * instants so the double-booking check is a plain interval overlap query.
 */
const sessionSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'ReadingGroup', required: true, index: true },
    title: { type: String, trim: true, default: '' },
    topic: { type: String, trim: true, default: '' },

    sessionDate: { type: Date, required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true, index: true },

    space: { type: Schema.Types.ObjectId, ref: 'StudySpace', required: true, index: true },
    status: { type: String, enum: GROUP_STATUS, default: 'planned', index: true },

    expectedAttendees: { type: Number, min: 0, default: 0 },
    attendanceRecorded: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);
sessionSchema.plugin(toJSONPlugin);
sessionSchema.plugin(softDeletePlugin);
sessionSchema.plugin(authorshipPlugin);
sessionSchema.index({ space: 1, startsAt: 1, endsAt: 1 });

const attendanceSchema = new Schema(
  {
    session: { type: Schema.Types.ObjectId, ref: 'ReadingGroupSession', required: true, index: true },
    group: { type: Schema.Types.ObjectId, ref: 'ReadingGroup', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ATTENDANCE_STATUS, default: 'present' },
    remark: { type: String, trim: true, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
attendanceSchema.plugin(toJSONPlugin);
attendanceSchema.index({ session: 1, user: 1 }, { unique: true });

const ReadingGroup = mongoose.model('ReadingGroup', readingGroupSchema);
const ReadingGroupSession = mongoose.model('ReadingGroupSession', sessionSchema);
const ReadingGroupAttendance = mongoose.model('ReadingGroupAttendance', attendanceSchema);

module.exports = { ReadingGroup, ReadingGroupSession, ReadingGroupAttendance };
