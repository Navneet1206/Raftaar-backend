const express = require('express');
const router = express.Router();
const mapController = require('../controllers/map.controller');
const { query } = require('express-validator');

router.get(
    '/get-coordinates',
    // Validate that address is a string and has at least 3 characters
    query('address').isString().isLength({ min: 3 }).withMessage('Invalid address'),
    mapController.getCoordinates
  );
  

  router.get(
    '/get-distance-time',
    query('origin').isString().isLength({ min: 3 }),
    query('destination').isString().isLength({ min: 3 }),
    mapController.getDistanceTime
  );

  router.get(
    '/get-suggestions',
    query('input').isString().isLength({ min: 3 }),
    mapController.getAutoCompleteSuggestions
  );


module.exports = router;