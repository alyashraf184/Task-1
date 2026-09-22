import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasDateOverlap,
  createBookingSchema,
  updateBookingSchema,
  isValidObjectId
} from '../src/controllers/bookingController.js';

test('hasDateOverlap detects overlapping ranges', () => {
  assert.equal(
    hasDateOverlap(
      new Date('2026-01-01T09:00:00Z'),
      new Date('2026-01-01T12:00:00Z'),
      new Date('2026-01-01T11:00:00Z'),
      new Date('2026-01-01T14:00:00Z')
    ),
    true
  );

  assert.equal(
    hasDateOverlap(
      new Date('2026-01-01T09:00:00Z'),
      new Date('2026-01-01T12:00:00Z'),
      new Date('2026-01-01T12:00:00Z'),
      new Date('2026-01-01T14:00:00Z')
    ),
    false
  );
});

test('createBookingSchema rejects endDate before startDate', () => {
  const { error } = createBookingSchema.validate({
    roomNumber: '101',
    startDate: '2026-01-02T10:00:00Z',
    endDate: '2026-01-02T09:00:00Z',
    purpose: 'Study'
  });

  assert.ok(error);
  assert.match(error.message, /startDate.*endDate|endDate.*startDate/i);
});

test('updateBookingSchema allows partial updates', () => {
  const { value, error } = updateBookingSchema.validate({
    purpose: 'Late study'
  });

  assert.equal(error, undefined);
  assert.deepEqual(value, { purpose: 'Late study' });
});

test('isValidObjectId rejects malformed booking ids', () => {
  assert.equal(isValidObjectId('abc'), false);
  assert.equal(isValidObjectId('507f1f77bcf86cd799439011'), true);
});
