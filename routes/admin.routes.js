const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Import required models and services
const rideModel = require('../models/ride.model');
const userModel = require('../models/user.model');
const captainModel = require('../models/captain.model');
const { sendEmail } = require('../services/communication.service');
const { sendMessageToSocketId } = require('../socket');

// -------------------------------------------
// Helper: HTML Email Template with Styling
// -------------------------------------------
const createEmailTemplate = (heading, messageBody) => {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f2f2f2; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 20px; border: 1px solid #dddddd; }
          .header { background: #007BFF; color: #ffffff; padding: 10px; text-align: center; }
          .content { margin: 20px 0; font-size: 16px; color: #333333; line-height: 1.5; }
          .footer { text-align: center; font-size: 12px; color: #888888; margin-top: 20px; }
          a { color: #007BFF; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${heading}</h2>
          </div>
          <div class="content">
            ${messageBody}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Your Company Name. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

// ------------------------
// Admin Authentication
// ------------------------
router.post('/login', adminController.adminLogin);

// ------------------------
// Secure Routes (Admin Only)
// ------------------------
router.get('/dashboard', authMiddleware.authAdmin, adminController.getDashboardData);
router.post('/block-user/:id', authMiddleware.authAdmin, adminController.blockUser);
router.post('/unblock-user/:id', authMiddleware.authAdmin, adminController.unblockUser);

// ------------------------
// Ride Management Endpoints
// ------------------------

// Get all rides
router.get('/rides', authMiddleware.authAdmin, async (req, res) => {
  try {
    const rides = await rideModel.find()
      .populate('user', 'fullname email mobileNumber')
      .populate('captain', 'fullname email');
    res.status(200).json({ success: true, rides });
  } catch (err) {
    console.error("Error fetching rides:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get pending rides
router.get('/rides/pending', authMiddleware.authAdmin, async (req, res) => {
  try {
    const rides = await rideModel.find({ status: 'pending' })
      .populate('user', 'fullname email mobileNumber');
    res.status(200).json({ success: true, rides });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update ride status (update only status fields)
router.post('/rides/:id/status', authMiddleware.authAdmin, async (req, res) => {
  try {
    const updateData = { status: req.body.status };
    if (req.body.status === 'rejected') {
      updateData.rejectionReason = req.body.reason;
    }
    
    const ride = await rideModel.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('user', 'fullname email mobileNumber')
      .populate('captain', 'fullname email');
    
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }
    
    console.log("Updated ride:", ride);
    
    // Send a styled HTML email to the user
    if (ride.user && ride.user.email) {
      const messageBody = `
        <p>Hello ${ride.user.fullname},</p>
        <p>Your ride request status has been updated to <strong>${req.body.status.toUpperCase()}</strong>.</p>
        ${req.body.status === 'rejected' ? `<p>Reason: ${req.body.reason}</p>` : ''}
        <p>Thank you for choosing our service.</p>
      `;
      const htmlContent = createEmailTemplate('Ride Status Update', messageBody);
      try {
        await sendEmail(ride.user.email, 'Ride Status Update', htmlContent);
      } catch (emailErr) {
        console.error("Error sending email:", emailErr);
      }
    } else {
      console.warn("Ride does not have user information; skipping email notification.");
    }
    
    res.status(200).json({ success: true, ride });
  } catch (err) {
    console.error("Error updating ride status:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ Ride Assignment
router.post('/rides/:id/assign', authMiddleware.authAdmin, async (req, res) => {
  try {
    const ride = await rideModel.findById(req.params.id).populate('user captain');
    const captain = await captainModel.findById(req.body.captainId);
    if (!captain) return res.status(404).json({ success: false, message: 'Captain not found' });

    // Assign the captain and update status to "accepted"
    ride.captain = req.body.captainId;
    ride.status = 'accepted';

    // If paymentType is missing, set it to a default value
    if (!ride.paymentType) {
      ride.paymentType = "cash";
    }

    await ride.save();

    // Send email notification to the user
    if (ride.user && ride.user.email) {
      const userMessage = `
        <p>Hello ${ride.user.fullname},</p>
        <p>Your ride has been assigned to Captain <strong>${captain.fullname}</strong>.</p>
        <p>We will keep you updated with further details.</p>
      `;
      await sendEmail(
        ride.user.email,
        'Ride Assigned',
        createEmailTemplate('Ride Assigned', userMessage)
      );
    }
    // Send email notification to the captain
    if (captain.email) {
      const captainMessage = `
        <p>Hello ${captain.fullname},</p>
        <p>You have a new ride assignment.</p>
        <p><strong>Pickup:</strong> ${ride.pickup}<br>
           <strong>Destination:</strong> ${ride.destination}</p>
        <p>Please review the details and proceed accordingly.</p>
      `;
      await sendEmail(
        captain.email,
        'New Ride Assignment',
        createEmailTemplate('New Ride Assignment', captainMessage)
      );
    }

    // Notify the captain via socket (if available)
    sendMessageToSocketId(captain.socketId, {
      event: 'ride-assigned',
      data: ride
    });
    
    res.status(200).json({ success: true, ride });
  } catch (err) {
    console.error("Error in ride assignment:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
  
// End ride
router.post('/rides/:id/end', authMiddleware.authAdmin, async (req, res) => {
  try {
    const ride = await rideModel.findById(req.params.id);
    if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

    ride.status = 'completed';
    await ride.save();

    // Email to user
    if (ride.user && ride.user.email) {
      const userMessage = `
        <p>Hello ${ride.user.fullname},</p>
        <p>Your ride has been successfully completed.</p>
        <p>Thank you for riding with us.</p>
      `;
      await sendEmail(
        ride.user.email,
        'Ride Completed',
        createEmailTemplate('Ride Completed', userMessage)
      );
    }
    // Email to captain
    if (ride.captain && ride.captain.email) {
      const captainMessage = `
        <p>Hello ${ride.captain.fullname},</p>
        <p>The ride you were assigned has been marked as completed.</p>
        <p>Thank you for your service.</p>
      `;
      await sendEmail(
        ride.captain.email,
        'Ride Completed',
        createEmailTemplate('Ride Completed', captainMessage)
      );
    }
    res.status(200).json({ success: true, message: 'Ride ended successfully', ride });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cancel ride
router.post('/rides/:id/cancel', authMiddleware.authAdmin, async (req, res) => {
  try {
    const ride = await rideModel.findById(req.params.id).populate('user captain');
    if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

    ride.status = 'cancelled';
    ride.cancellationReason = req.body.reason || 'Cancelled by admin';
    await ride.save();

    // Email to user
    if (ride.user && ride.user.email) {
      const userMessage = `
        <p>Hello ${ride.user.fullname},</p>
        <p>Your ride has been cancelled.</p>
        <p>If you have any questions, please contact our support team.</p>
      `;
      await sendEmail(
        ride.user.email,
        'Ride Cancelled',
        createEmailTemplate('Ride Cancelled', userMessage)
      );
    }
    // Email to captain
    if (ride.captain && ride.captain.email) {
      const captainMessage = `
        <p>Hello ${ride.captain.fullname},</p>
        <p>The ride assigned to you has been cancelled.</p>
        <p>Please standby for further assignments.</p>
      `;
      await sendEmail(
        ride.captain.email,
        'Ride Cancelled',
        createEmailTemplate('Ride Cancelled', captainMessage)
      );
    }
    res.status(200).json({ success: true, message: 'Ride cancelled successfully', ride });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------
// Payment Management Endpoints
// ------------------------
router.get('/pending-payments', authMiddleware.authAdmin, async (req, res) => {
  try {
    const rides = await rideModel.find({ paymentType: 'online', isPaymentDone: false })
      .populate('user', 'fullname email mobileNumber')
      .populate('captain', 'fullname email');
    res.status(200).json({ success: true, rides });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/complete-payment/:rideId', authMiddleware.authAdmin, async (req, res) => {
  try {
    const ride = await rideModel.findByIdAndUpdate(
      req.params.rideId,
      { isPaymentDone: true },
      { new: true }
    );
    res.status(200).json({ success: true, ride });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------
// User and Captain Management Endpoints
// ------------------------

// Get all users
router.get('/users', authMiddleware.authAdmin, async (req, res) => {
  try {
    const users = await userModel.find().select('email mobileNumber fullname');
    res.status(200).json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all captains
router.get('/captains', authMiddleware.authAdmin, async (req, res) => {
  try {
    const captains = await captainModel.find().select('fullname email status vehicle mobileNumber');
    res.status(200).json({ success: true, captains });
  } catch (err) {
    console.error("Error fetching captains:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Block a captain
router.post('/block-captain/:id', authMiddleware.authAdmin, async (req, res) => {
  try {
    const captain = await captainModel.findByIdAndUpdate(
      req.params.id,
      { status: 'blocked' },
      { new: true }
    );
    if (!captain) {
      return res.status(404).json({ success: false, message: 'Captain not found' });
    }
    res.status(200).json({ success: true, captain });
  } catch (err) {
    console.error("Error blocking captain:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Unblock a captain
router.post('/unblock-captain/:id', authMiddleware.authAdmin, async (req, res) => {
  try {
    const captain = await captainModel.findByIdAndUpdate(
      req.params.id,
      { status: 'active' },
      { new: true }
    );
    if (!captain) {
      return res.status(404).json({ success: false, message: 'Captain not found' });
    }
    res.status(200).json({ success: true, captain });
  } catch (err) {
    console.error("Error unblocking captain:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
