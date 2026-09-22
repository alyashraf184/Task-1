import Joi from 'joi';
import mongoose from 'mongoose';
import { Booking } from '../models/Booking.js';

export function isValidObjectId(id) {
  return typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);
}

function ensureStartBeforeEnd(value, helpers) {
  if (!value.startDate || !value.endDate) return value;

  const start = new Date(value.startDate);
  const end = new Date(value.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return helpers.error('any.invalid');
  }

  if (start >= end) {
    return helpers.message('"startDate" must be strictly before "endDate"');
  }

  return value;
}

export function hasDateOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export const createBookingSchema = Joi.object({
  roomNumber: Joi.string().trim().required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  purpose: Joi.string().trim().allow('').optional(),
  bookedBy: Joi.string().hex().length(24).optional()
}).custom(ensureStartBeforeEnd, 'booking-date-order');

export const updateBookingSchema = Joi.object({
  roomNumber: Joi.string().trim(),
  startDate: Joi.date(),
  endDate: Joi.date(),
  purpose: Joi.string().trim().allow('').optional(),
  bookedBy: Joi.string().hex().length(24).optional()
}).custom((value, helpers) => {
  if (!value.startDate || !value.endDate) return value;

  const start = new Date(value.startDate);
  const end = new Date(value.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return helpers.error('any.invalid');
  }

  if (start >= end) {
    return helpers.message('"startDate" must be strictly before "endDate"');
  }

  return value;
}, 'booking-date-order');

async function findConflict({ roomNumber, startDate, endDate, ignoreId = null }) {
  return Booking.findOne({
    roomNumber,
    _id: { $ne: ignoreId },
    startDate: { $lt: endDate },
    endDate: { $gt: startDate }
  }).exec();
}

function serializeBooking(doc) {
  if (!doc) return null;
  const booking = doc.toObject ? doc.toObject() : doc;

  return {
    ...booking,
    id: booking._id.toString(),
    _id: undefined,
    bookedBy: booking.bookedBy && typeof booking.bookedBy === 'object' && booking.bookedBy._id
      ? {
          id: booking.bookedBy._id.toString(),
          name: booking.bookedBy.name,
          email: booking.bookedBy.email
        }
      : booking.bookedBy
  };
}

// GET /api/bookings
export async function getAllBookings(req, res, next) {
  try {
    const bookings = await Booking.find()
      .populate('bookedBy', 'name email')
      .sort({ startDate: 1 });

    res.json({ bookings: bookings.map(serializeBooking) });
  } catch (err) { next(err); }
}

// GET /api/bookings/:id
export async function getBooking(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking id' });
    }

    const booking = await Booking.findById(req.params.id).populate('bookedBy', 'name email');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    res.json({ booking: serializeBooking(booking) });
  } catch (err) {
    if (err instanceof mongoose.Error.CastError) {
      return res.status(400).json({ message: 'Invalid booking id' });
    }
    next(err);
  }
}

// POST /api/bookings
export async function createBooking(req, res, next) {
  try {
    const { value, error } = createBookingSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) return res.status(400).json({ message: error.message });

    const startDate = new Date(value.startDate);
    const endDate = new Date(value.endDate);
    const conflict = await findConflict({
      roomNumber: value.roomNumber,
      startDate,
      endDate
    });

    if (conflict) {
      return res.status(409).json({
        message: 'Booking conflict: this room is already booked for the requested time range.'
      });
    }

    const booking = await Booking.create(value);
    const populated = await booking.populate('bookedBy', 'name email');

    res.status(201).json({ booking: serializeBooking(populated) });
  } catch (err) { next(err); }
}

// PATCH /api/bookings/:id
export async function updateBooking(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking id' });
    }

    const { value, error } = updateBookingSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) return res.status(400).json({ message: error.message });
    if (!Object.keys(value).length) {
      return res.status(400).json({ message: 'No data provided to update' });
    }

    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Booking not found' });

    const finalBooking = {
      ...existing.toObject(),
      ...value,
      startDate: value.startDate ? new Date(value.startDate) : existing.startDate,
      endDate: value.endDate ? new Date(value.endDate) : existing.endDate,
      roomNumber: value.roomNumber || existing.roomNumber
    };

    if (finalBooking.startDate >= finalBooking.endDate) {
      return res.status(400).json({ message: '"startDate" must be strictly before "endDate"' });
    }

    const conflict = await findConflict({
      roomNumber: finalBooking.roomNumber,
      startDate: finalBooking.startDate,
      endDate: finalBooking.endDate,
      ignoreId: existing._id
    });

    if (conflict) {
      return res.status(409).json({
        message: 'Booking conflict: this room is already booked for the requested time range.'
      });
    }

    const updated = await Booking.findByIdAndUpdate(
      req.params.id,
      { $set: value },
      { new: true, runValidators: true }
    ).populate('bookedBy', 'name email');

    if (!updated) return res.status(404).json({ message: 'Booking not found' });

    res.json({ booking: serializeBooking(updated) });
  } catch (err) {
    if (err instanceof mongoose.Error.CastError) {
      return res.status(400).json({ message: 'Invalid booking id' });
    }
    next(err);
  }
}

// DELETE /api/bookings/:id
export async function deleteBooking(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking id' });
    }

    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    res.json({ ok: true });
  } catch (err) {
    if (err instanceof mongoose.Error.CastError) {
      return res.status(400).json({ message: 'Invalid booking id' });
    }
    next(err);
  }
}
