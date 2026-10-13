const reservationService = require('../services/reservation.service');

/** Expires uncollected holds and passes each freed copy to the next in line. */
const run = () => reservationService.expireStaleReservations();

module.exports = { run };
