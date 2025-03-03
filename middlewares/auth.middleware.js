const userModel = require('../models/user.model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const blackListTokenModel = require("../models/blackListToken.model");
const captainModel = require('../models/captain.model');
const Admin = require('../models/admin.model');

module.exports.authUser = async (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  console.log('authUser - Token received:', token);

  if (token === null || token === undefined || typeof token !== 'string' || token.trim() === '') {
    console.log('authUser - No valid token provided');
    return res.status(401).json({ message: 'Unauthorized: No valid token provided' });
  }

  try {
    const isBlacklisted = await blackListTokenModel.findOne({ token: token });
    if (isBlacklisted) {
      console.log('authUser - Token is blacklisted');
      return res.status(401).json({ message: 'Unauthorized: Token is blacklisted' });
    }

    if (token.split('.').length !== 3) {
      console.log('authUser - Invalid token format');
      return res.status(401).json({ message: 'Unauthorized: Invalid token format' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('authUser - Decoded token:', decoded);

    const user = await userModel.findById(decoded._id);

    if (!user) {
      console.log('authUser - User not found for ID:', decoded._id);
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Error in auth middleware:", err);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

module.exports.authCaptain = async (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  console.log('authCaptain - Token received:', token);

  if (token === null || token === undefined || typeof token !== 'string' || token.trim() === '') {
    console.log('authCaptain - No valid token provided');
    return res.status(401).json({ message: 'Unauthorized: No valid token provided' });
  }

  try {
    const isBlacklisted = await blackListTokenModel.findOne({ token });
    if (isBlacklisted) {
      console.log('authCaptain - Token is blacklisted');
      return res.status(401).json({ message: 'Unauthorized: Token is blacklisted' });
    }

    if (token.split('.').length !== 3) {
      console.log('authCaptain - Invalid token format');
      return res.status(401).json({ message: 'Unauthorized: Invalid token format' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('authCaptain - Decoded token:', decoded);

    const captain = await captainModel.findById(decoded._id);

    if (!captain) {
      console.log('authCaptain - Captain not found, proceeding without error.');
      req.captain = null;
    } else {
      req.captain = captain;
    }

    next();
  } catch (err) {
    console.error('Error in authCaptain middleware:', err);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

module.exports.authAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  console.log('authAdmin - Token received:', token);

  if (token === null || token === undefined || typeof token !== 'string' || token.trim() === '') {
    console.log('authAdmin - No valid token provided');
    return res.status(401).json({ message: 'Unauthorized: No valid token provided' });
  }

  try {
    const isBlacklisted = await blackListTokenModel.findOne({ token });
    if (isBlacklisted) {
      console.log('authAdmin - Token is blacklisted');
      return res.status(401).json({ message: 'Unauthorized: Token is blacklisted' });
    }

    if (token.split('.').length !== 3) {
      console.log('authAdmin - Invalid token format');
      return res.status(401).json({ message: 'Unauthorized: Invalid token format' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('authAdmin - Decoded token:', decoded);

    const admin = await Admin.findById(decoded._id);
    if (!admin) {
      console.log('authAdmin - Admin not found');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    console.error('Error in authAdmin middleware:', err);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};