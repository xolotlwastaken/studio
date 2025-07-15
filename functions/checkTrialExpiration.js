// functions/checkTrialExpiration.js

const functions = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");


if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.checkTrialExpiration =
functions.onSchedule("every 24 hours", async () => {
  try {
    const now = admin.firestore.Timestamp.now();

    const snapshot = await db
        .collection("users")
        .where("isOnTrial", "==", true)
        .where("trialEndDate", "<", now)
        .get();

    if (snapshot.empty) {
      console.log("No expired trials.");
      return;
    }

    const batch = db.batch();
    snapshot.forEach((doc) => {
      console.log(`Updating expired trial for user: ${doc.id}`);
      batch.update(doc.ref, {
        isOnTrial: false,
        trialEnded: true,
        canUploadAudio: false,
      });
    });

    await batch.commit();
    console.log(`Updated ${snapshot.size} users.`);
  } catch (err) {
    console.error("Error expiring trials:", err);
  }
});
