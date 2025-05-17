const functions = require("firebase-functions");
const htmlToDocx = require("html-to-docx");
const admin = require("firebase-admin");
const stripeFunctions = require("./stripe");
const checkTrialExpiration = require("./checkTrialExpiration");

const cors = require("cors")({
  origin: true,
});


if (!admin.apps.length) {
  admin.initializeApp();
}

// Stripe
exports.createStripeCheckoutSession =
  stripeFunctions.createStripeCheckoutSession;
exports.cancelStripeSubscription =
  stripeFunctions.cancelStripeSubscription;
exports.handleStripeWebhook = stripeFunctions.handleStripeWebhook;

exports.checkTrialExpiration = checkTrialExpiration.checkTrialExpiration;

exports.generateDocx = functions.https.onRequest((req, res) => {
  cors(req, res, async () => { // Use cors middleware here
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.status(200).send("");
      return;
    }


    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const html = req.body.html;

    if (!html) {
      res.status(400).send("Missing 'html' in request body.");
      return;
    }

    try {
      const docxBuffer = await htmlToDocx(html, null, {
        table: {row: {cantSplit: true}},
        footer: true,
        pageNumber: true,
      });

      res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument."+
        "wordprocessingml.document",
      );
      res.setHeader(
          "Content-Disposition",
          "attachment; filename=\"summary.docx\"",
      );
      res.send(docxBuffer);
    } catch (error) {
      console.error("DOCX generation failed:", error);
      res.status(500).send("Failed to generate document.");
    }
  });
});
