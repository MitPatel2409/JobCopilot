const express = require("express");
const auth = require("../controllers/authController");

// Linking a Google account for Calendar and Gmail (Settings → Connect).
const router = express.Router();

router.get("/google/connect", auth.connect);
router.get("/google/connect/:connector", auth.connect);
router.get("/google/callback", auth.callback);

module.exports = router;
